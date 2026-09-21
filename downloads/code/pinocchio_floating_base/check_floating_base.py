#!/usr/bin/env python3
"""Pinocchio 3.8.0 floating-base API self-check; no URDF/mesh is required.

Run inside the documented environment, not by installing native packages on the
Hexo host. This source was syntax-checked only; its presence is not evidence of
a successful Pinocchio execution or a contact/control simulation.

Upstream API references, fixed at v3.8.0:
https://github.com/stack-of-tasks/pinocchio/blob/v3.8.0/include/pinocchio/multibody/joint/joint-free-flyer.hpp
https://github.com/stack-of-tasks/pinocchio/blob/v3.8.0/bindings/python/algorithm/expose-crba.cpp
https://github.com/stack-of-tasks/pinocchio/blob/v3.8.0/bindings/python/algorithm/expose-rnea-derivatives.cpp
"""

import argparse
import json
import math
import platform
import sys

SEED = 20260907


def build_model(pin, np):
    """Free-flyer + two actuated RY joints, with physical central inertias."""
    model = pin.Model()
    model.name = "floating_base_two_ry"
    body_specs = (
        (5.0, [0.02, -0.01, 0.03], [0.30, 0.40, 0.50]),
        (1.2, [0.20, 0.0, 0.0], [0.012, 0.025, 0.030]),
        (0.8, [0.15, 0.0, 0.0], [0.008, 0.015, 0.020]),
    )
    root = model.addJoint(0, pin.JointModelFreeFlyer(), pin.SE3.Identity(), "root_joint")
    shoulder = model.addJoint(
        root, pin.JointModelRY(),
        pin.SE3(np.eye(3), np.array([0.0, 0.0, 0.20])), "joint1",
    )
    elbow = model.addJoint(
        shoulder, pin.JointModelRY(),
        pin.SE3(np.eye(3), np.array([0.45, 0.0, 0.0])), "joint2",
    )
    for joint, (mass, center, principal) in zip((root, shoulder, elbow), body_specs):
        inertia = pin.Inertia(mass, np.array(center), np.diag(principal))
        model.appendBodyToJoint(joint, inertia, pin.SE3.Identity())
    tool = model.addFrame(pin.Frame(
        "tool", elbow, pin.SE3(np.eye(3), np.array([0.35, 0.03, 0.02])),
        pin.FrameType.OP_FRAME,
    ))
    model.gravity.linear = np.array([0.0, 0.0, -9.81])
    model.gravity.angular = np.zeros(3)
    return model, root, tool, body_specs


def run_checks(pin, np, summary):
    model, root, tool, body_specs = build_model(pin, np)
    summary["model"] = {"name": model.name, "nq": model.nq, "nv": model.nv,
                        "root_joint_id": root, "tool_frame_id": tool}
    summary["model"]["joints"] = [
        {"id": jid, "name": model.names[jid], "idx_q": model.joints[jid].idx_q,
         "nq": model.joints[jid].nq, "idx_v": model.joints[jid].idx_v,
         "nv": model.joints[jid].nv}
        for jid in range(1, model.njoints)
    ]
    checks = summary["checks"]

    def error(actual, expected):
        actual, expected = np.asarray(actual), np.asarray(expected)
        if actual.shape != expected.shape:
            return math.inf
        if not np.all(np.isfinite(actual)) or not np.all(np.isfinite(expected)):
            return math.inf
        return float(np.max(np.abs(actual - expected))) if actual.size else 0.0

    def record(name, residual, tolerance, **details):
        finite = math.isfinite(residual)
        checks[name] = {"max_abs_error": residual if finite else None,
                        "tolerance": tolerance,
                        "passed": bool(finite and residual <= tolerance), **details}

    # 1. Each central inertia has positive eigenvalues and satisfies all three
    # principal-moment triangle inequalities. These are not point-mass bodies.
    physical = all(
        mass > 0 and min(principal) > 0
        and 2 * max(principal) < sum(principal)
        for mass, _, principal in body_specs
    )
    root_model = model.joints[root]
    root_ok = (root_model.idx_q, root_model.nq, root_model.idx_v, root_model.nv) == (0, 7, 0, 6)
    structure_ok = model.nq == 9 and model.nv == 8 and root_ok and physical
    record("model_structure_and_inertias", 0.0 if structure_ok else math.inf, 0.0,
           positive_physical_inertias=physical)
    if not structure_ok:
        return  # Do not perform dimension-dependent checks on an invalid model.

    rng = np.random.default_rng(SEED)
    # Do not call randomConfiguration on an unbounded free-flyer translation.
    q = pin.integrate(model, pin.neutral(model), 0.25 * rng.standard_normal(model.nv)).copy()
    v = 0.30 * rng.standard_normal(model.nv)
    a = 0.40 * rng.standard_normal(model.nv)

    # 2. Configuration coordinates are not tangent coordinates: nq != nv.
    delta = 1e-4 * rng.standard_normal(model.nv)
    q_next = pin.integrate(model, q, delta).copy()
    recovered_delta = pin.difference(model, q, q_next).copy()
    quaternion_error = abs(float(np.linalg.norm(q[3:7])) - 1.0)
    roundtrip_error = error(recovered_delta, delta)
    record("configuration_manifold", max(quaternion_error, roundtrip_error), 1e-10,
           quaternion_norm_error=quaternion_error, local_roundtrip_error=roundtrip_error)

    # 3. Free-flyer quaternion order is x,y,z,w; its first three velocities are
    # LOCAL linear velocity. At +90 deg yaw, pdot_world = R_world_base @ v_local.
    q90 = pin.neutral(model).copy()
    q90[:3] = [0.3, -0.2, 0.8]
    q90[3:7] = [0.0, 0.0, math.sqrt(0.5), math.sqrt(0.5)]
    local_velocity = np.zeros(model.nv)
    local_velocity[:6] = [0.25, -0.15, 0.1, 0.1, -0.2, 0.3]
    rotation90 = np.array([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    step = 1e-7
    plus = pin.integrate(model, q90, step * local_velocity).copy()
    minus = pin.integrate(model, q90, -step * local_velocity).copy()
    measured_translation_rate = (plus[:3] - minus[:3]) / (2 * step)
    expected_translation_rate = rotation90 @ local_velocity[:3]
    record("base_translation_derivative", error(measured_translation_rate, expected_translation_rate),
           1e-8, finite_difference_step=step,
           world_translation_rate=measured_translation_rate.tolist())

    # 4. The 3.8.0 Python wrapper already symmetrizes CRBA. Taking only its upper
    # triangle is defensive/cross-language code: C++ core guarantees that part.
    # Never use M + M.T (doubles the diagonal), or retain mutable Data aliases.
    mass_data = model.createData()
    raw_mass = pin.crba(model, mass_data, q).copy()
    mass = np.triu(raw_mass) + np.triu(raw_mass, 1).T
    minimum_eigenvalue = float(np.linalg.eigvalsh(mass).min())
    mass_error = max(error(mass, mass.T), error(np.diag(mass), np.diag(raw_mass)))
    if not np.all(np.isfinite(mass)) or minimum_eigenvalue <= 0:
        mass_error = math.inf
    record("mass_matrix", mass_error, 1e-12, minimum_eigenvalue=minimum_eigenvalue)

    # 5. This full generalized torque includes a hypothetical root wrench. It
    # checks algorithm consistency, not a realizable underactuated controller.
    rnea_data = model.createData()
    tau = pin.rnea(model, rnea_data, q, v, a).copy()
    nle_data = model.createData()
    nle = pin.nonLinearEffects(model, nle_data, q, v).copy()
    aba_data = model.createData()
    recovered_a = pin.aba(model, aba_data, q, v, tau).copy()
    inverse_error = error(tau, mass @ a + nle)
    forward_error = error(recovered_a, a)
    record("inverse_forward_dynamics", max(inverse_error, forward_error), 1e-9,
           rnea_equation_error=inverse_error, aba_roundtrip_error=forward_error)

    # 6. No ground contact or root actuator: only the last two efforts are set.
    # ABA solves the free base acceleration; it need not be zero or stable.
    underactuated_tau = np.zeros(model.nv)
    underactuated_tau[6:] = [0.30, -0.20]
    free_data = model.createData()
    free_acceleration = pin.aba(model, free_data, q, v, underactuated_tau).copy()
    free_rnea_data = model.createData()
    free_tau_back = pin.rnea(model, free_rnea_data, q, v, free_acceleration).copy()
    free_error = max(error(underactuated_tau[:6], np.zeros(6)),
                     error(free_tau_back, underactuated_tau),
                     error(mass @ free_acceleration + nle, underactuated_tau))
    record("underactuated_free_base", free_error, 1e-9,
           acceleration_finite=bool(np.all(np.isfinite(free_acceleration))),
           base_acceleration=free_acceleration[:6].tolist())

    # 7. Derivative columns are nv tangent perturbations, NOT nq coordinates.
    # v,a remain numerically fixed in Pinocchio's chosen tangent trivialization.
    # Python returns Eigen::Ref views: keep this named Data alive, then copy.
    derivative_data = model.createData()
    result = pin.computeRNEADerivatives(model, derivative_data, q, v, a)
    dtau_dq, dtau_dv, dtau_da = tuple(matrix.copy() for matrix in result)
    derivative_shape_ok = all(matrix.shape == (model.nv, model.nv)
                              for matrix in (dtau_dq, dtau_dv, dtau_da))
    fd_step = 1e-6
    finite_difference = np.empty((model.nv, model.nv))
    for column in range(model.nv):
        tangent = np.zeros(model.nv)
        tangent[column] = fd_step
        q_plus = pin.integrate(model, q, tangent).copy()
        q_minus = pin.integrate(model, q, -tangent).copy()
        plus_data, minus_data = model.createData(), model.createData()
        tau_plus = pin.rnea(model, plus_data, q_plus, v, a).copy()
        tau_minus = pin.rnea(model, minus_data, q_minus, v, a).copy()
        finite_difference[:, column] = (tau_plus - tau_minus) / (2 * fd_step)
    dq_error = error(dtau_dq, finite_difference)
    da_error = error(dtau_da, mass)
    derivative_error = max(dq_error, da_error) if derivative_shape_ok else math.inf
    record("rnea_tangent_derivative", derivative_error, 1e-6,
           shape=list(dtau_dq.shape), finite_difference_step=fd_step,
           dq_error=dq_error, da_equals_mass_error=da_error)

    # 8. FK populates velocities, joint Jacobians populate data.J, and frame
    # placements populate oMf. All getters use the SAME q and reference frame.
    frame_data = model.createData()
    pin.forwardKinematics(model, frame_data, q, v)
    pin.computeJointJacobians(model, frame_data, q)
    pin.updateFramePlacements(model, frame_data)
    references = (("LOCAL", pin.ReferenceFrame.LOCAL),
                  ("LOCAL_WORLD_ALIGNED", pin.ReferenceFrame.LOCAL_WORLD_ALIGNED),
                  ("WORLD", pin.ReferenceFrame.WORLD))
    frame_errors = {}
    for name, reference in references:
        jacobian = pin.getFrameJacobian(model, frame_data, tool, reference).copy()
        velocity = pin.getFrameVelocity(model, frame_data, tool, reference).vector.copy()
        frame_errors[name] = error(jacobian @ v, velocity)
    # WORLD changes both axes and reference point; LWA changes axes only.
    record("frame_velocity_jacobians", max(frame_errors.values()), 1e-10,
           reference_frame_errors=frame_errors)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-version", default="3.8.0",
                        help="Require an exact pinocchio.__version__ (default: 3.8.0)")
    args = parser.parse_args()
    summary = {"pinocchio_version": None, "required_version": args.require_version,
               "seed": SEED, "model": None, "checks": {}, "passed": False,
               "runtime": {"python": platform.python_version(), "numpy": None,
                           "machine": platform.machine(), "system": platform.system()}}
    try:
        import numpy as np
        import pinocchio as pin

        summary["runtime"]["numpy"] = str(np.__version__)
        summary["pinocchio_version"] = str(pin.__version__)
        if summary["pinocchio_version"] != args.require_version:
            raise RuntimeError("Pinocchio version mismatch; use the documented pinned environment")
        run_checks(pin, np, summary)
        summary["passed"] = len(summary["checks"]) == 8 and all(
            item["passed"] for item in summary["checks"].values()
        )
    except Exception as exc:
        summary["error"] = {"type": type(exc).__name__, "message": str(exc)}

    def json_safe(value):
        if isinstance(value, float) and not math.isfinite(value):
            return None  # Failed numeric checks must still produce valid JSON.
        if isinstance(value, dict):
            return {key: json_safe(item) for key, item in value.items()}
        if isinstance(value, list):
            return [json_safe(item) for item in value]
        return value

    print(json.dumps(json_safe(summary), ensure_ascii=False, indent=2, allow_nan=False))
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
