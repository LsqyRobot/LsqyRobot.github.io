// Teaching fixture for Pinocchio 3.8.0; original example, no URDF or mesh.
// Source-reviewed, NOT compiled/run at publication time. See README.md.
// This is a batch API check, not a contact simulator or real-time controller.
#include <pinocchio/fwd.hpp>
#include <pinocchio/multibody/model.hpp>
#include <pinocchio/multibody/data.hpp>
#include <pinocchio/multibody/joint/joint-free-flyer.hpp>
#include <pinocchio/multibody/joint/joint-revolute.hpp>
#include <pinocchio/algorithm/joint-configuration.hpp>
#include <pinocchio/algorithm/kinematics.hpp>
#include <pinocchio/algorithm/frames.hpp>
#include <pinocchio/algorithm/jacobian.hpp>
#include <pinocchio/algorithm/crba.hpp>
#include <pinocchio/algorithm/rnea.hpp>
#include <pinocchio/algorithm/aba.hpp>
#include <pinocchio/algorithm/rnea-derivatives.hpp>
#include <pinocchio/utils/version.hpp>
#include <Eigen/Cholesky>
#include <Eigen/Eigenvalues>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

namespace pin = pinocchio;
using Vec = Eigen::VectorXd;
using Mat = Eigen::MatrixXd;
using Vec3 = Eigen::Vector3d;
using Mat3 = Eigen::Matrix3d;
using Mat6x = Eigen::Matrix<double, 6, Eigen::Dynamic>;

struct Fixture {
  pin::Model model;
  pin::JointIndex root;
  pin::FrameIndex tool;
};

pin::SE3 translation(const Vec3 & offset) {
  return pin::SE3(Mat3::Identity(), offset);
}

Fixture buildFixture() {
  Fixture fixture;
  pin::Model & model = fixture.model;
  model.name = "floating_base_two_ry";
  fixture.root = model.addJoint(0, pin::JointModelFreeFlyer(),
                                pin::SE3::Identity(), "root_joint");
  const auto shoulder = model.addJoint(fixture.root, pin::JointModelRY(),
                                      translation(Vec3(0., 0., .20)), "joint1");
  const auto elbow = model.addJoint(shoulder, pin::JointModelRY(),
                                   translation(Vec3(.45, 0., 0.)), "joint2");
  // Inertia(mass, COM offset, rotational inertia ABOUT THE COM).
  // These positive central principal moments obey all triangle inequalities.
  const Mat3 I0 = Vec3(.30, .40, .50).asDiagonal();
  const Mat3 I1 = Vec3(.012, .025, .030).asDiagonal();
  const Mat3 I2 = Vec3(.008, .015, .020).asDiagonal();
  model.appendBodyToJoint(fixture.root,
      pin::Inertia(5., Vec3(.02, -.01, .03), I0), pin::SE3::Identity());
  model.appendBodyToJoint(shoulder,
      pin::Inertia(1.2, Vec3(.20, 0., 0.), I1), pin::SE3::Identity());
  model.appendBodyToJoint(elbow,
      pin::Inertia(.8, Vec3(.15, 0., 0.), I2), pin::SE3::Identity());
  fixture.tool = model.addFrame(pin::Frame(
      "tool", elbow, translation(Vec3(.35, .03, .02)), pin::OP_FRAME));
  model.gravity.linear() = Vec3(0., 0., -9.81);
  model.gravity.angular().setZero();
  return fixture;
}

// Do not silently accept NaN: NaN comparisons alone can fail open.
void check(const std::string & name, double residual, double tolerance) {
  std::cout << name << " max_abs_error=" << residual
            << " tolerance=" << tolerance << '\n';
  if (!std::isfinite(residual) || residual > tolerance)
    throw std::runtime_error("Check failed: " + name);
}

int run() {
  std::cout << std::scientific << std::setprecision(12);
  std::cout << "pinocchio=" << pin::printVersion() << '\n';
  if (pin::printVersion() != "3.8.0")
    throw std::runtime_error("This teaching baseline requires Pinocchio 3.8.0");
  Fixture fixture = buildFixture();
  const pin::Model & model = fixture.model;
  if (model.nq != 9 || model.nv != 8)
    throw std::runtime_error("Unexpected fixture dimensions");
  for (pin::JointIndex i = 1; i < model.njoints; ++i) {
    const auto & joint = model.joints[i];
    std::cout << "joint=" << model.names[i] << " idx_q=" << joint.idx_q()
              << " nq=" << joint.nq() << " idx_v=" << joint.idx_v()
              << " nv=" << joint.nv() << '\n';
  }

  // Fixed bounded values, not randomConfiguration with infinite root limits.
  Vec initial_delta(model.nv), v(model.nv), a(model.nv);
  initial_delta << .10, -.12, .30, .15, -.20, .25, .35, -.40;
  v << .20, -.10, .15, -.20, .25, .10, .30, -.25;
  a << -.10, .15, -.20, .05, -.08, .12, .25, -.30;
  const Vec q = pin::integrate(model, pin::neutral(model), initial_delta);
  check("quaternion_norm", std::abs(q.segment<4>(3).norm() - 1.), 1e-12);

  // Separate named workspaces make cache ownership clear. They are allocated
  // outside the loops below; this does NOT certify allocation-free execution.
  pin::Data mass_data(model), bias_data(model), id_data(model), fd_data(model);
  pin::Data free_data(model), free_id_data(model), frame_data(model);
  pin::Data derivative_data(model), plus_data(model), minus_data(model);

  mass_data.M.setZero();
  pin::crba(model, mass_data, q, pin::Convention::LOCAL);
  // A concrete matrix is a snapshot; do not double the diagonal with M+M^T.
  const Mat M = mass_data.M.selfadjointView<Eigen::Upper>();
  if (!M.allFinite()) throw std::runtime_error("Nonfinite mass matrix");
  Eigen::SelfAdjointEigenSolver<Mat> eigen_solver(M);
  if (eigen_solver.info() != Eigen::Success || eigen_solver.eigenvalues().minCoeff() <= 0.)
    throw std::runtime_error("Mass matrix is not positive definite");
  std::cout << "mass_min_eigenvalue=" << eigen_solver.eigenvalues().minCoeff() << '\n';

  const Vec h = pin::nonLinearEffects(model, bias_data, q, v);
  const Vec tau = pin::rnea(model, id_data, q, v, a);
  check("rnea_Ma_h", (tau - M * a - h).cwiseAbs().maxCoeff(), 1e-9);
  const Vec a_roundtrip = pin::aba(model, fd_data, q, v, tau, pin::Convention::LOCAL);
  check("aba_rnea_roundtrip", (a_roundtrip - a).cwiseAbs().maxCoeff(), 1e-9);
  Eigen::LDLT<Mat> factor(M);
  if (factor.info() != Eigen::Success) throw std::runtime_error("LDLT failed");
  const Vec a_solve = factor.solve(tau - h);
  check("factor_solve", (a_solve - a).cwiseAbs().maxCoeff(), 1e-9);

  // RNEA of arbitrary a generally demands a root wrench. This second call
  // instead commands ONLY the two internal motors; the base is free to move.
  Vec motor_tau = Vec::Zero(model.nv);
  motor_tau(model.joints[model.getJointId("joint1")].idx_v()) = .30;
  motor_tau(model.joints[model.getJointId("joint2")].idx_v()) = -.20;
  const auto & root = model.joints[fixture.root];
  check("zero_base_command", motor_tau.segment(root.idx_v(), root.nv()).norm(), 0.);
  const Vec a_free = pin::aba(model, free_data, q, v, motor_tau, pin::Convention::LOCAL);
  const Vec tau_free = pin::rnea(model, free_id_data, q, v, a_free);
  check("free_base_equation", (tau_free - motor_tau).cwiseAbs().maxCoeff(), 1e-9);
  std::cout << "free_base_generalized_acceleration=" << a_free.head<6>().transpose() << '\n';

  // q-only Jacobian construction does not refresh velocity. Compute FK(q,v)
  // first and keep q unchanged; then query both sides in the same reference.
  pin::forwardKinematics(model, frame_data, q, v);
  pin::computeJointJacobians(model, frame_data, q);
  pin::updateFramePlacements(model, frame_data);
  const pin::ReferenceFrame frames[] = {pin::LOCAL, pin::LOCAL_WORLD_ALIGNED, pin::WORLD};
  const char * names[] = {"LOCAL", "LOCAL_WORLD_ALIGNED", "WORLD"};
  Mat6x J(6, model.nv);
  for (int k = 0; k < 3; ++k) {
    // Output-buffer overloads may only write columns on the kinematic support.
    J.setZero();
    pin::getFrameJacobian(model, frame_data, fixture.tool, frames[k], J);
    const pin::Motion velocity = pin::getFrameVelocity(model, frame_data, fixture.tool, frames[k]);
    check(std::string("Jv_") + names[k],
          (J * v - velocity.toVector()).cwiseAbs().maxCoeff(), 1e-10);
  }

  // C++ returns derivatives in Data; d(tau)/d(q) is nv x nv in tangent space.
  derivative_data.dtau_dq.setZero();
  derivative_data.dtau_dv.setZero();
  derivative_data.M.setZero();
  pin::computeRNEADerivatives(model, derivative_data, q, v, a);
  const Mat analytic = derivative_data.dtau_dq;
  const Mat d_tau_da = derivative_data.M.selfadjointView<Eigen::Upper>();
  check("rnea_da_is_M", (d_tau_da - M).cwiseAbs().maxCoeff(), 1e-10);
  Mat numeric(model.nv, model.nv);
  Vec delta = Vec::Zero(model.nv);
  const double eps = 1e-6;
  for (int column = 0; column < model.nv; ++column) {
    delta.setZero();
    delta(column) = eps;
    const Vec q_plus = pin::integrate(model, q, delta);
    const Vec q_minus = pin::integrate(model, q, -delta);
    const Vec tau_plus = pin::rnea(model, plus_data, q_plus, v, a);
    const Vec tau_minus = pin::rnea(model, minus_data, q_minus, v, a);
    numeric.col(column) = (tau_plus - tau_minus) / (2. * eps);
  }
  check("tangent_rnea_derivative", (analytic - numeric).cwiseAbs().maxCoeff(), 1e-6);
  std::cout << "PASS: fixture API checks only; not a contact/control rollout\n";
  return 0;
}

int main() {
  try {
    return run();
  } catch (const std::exception & error) {
    std::cerr << "FAIL: " << error.what() << '\n';
    return 1;
  }
}
