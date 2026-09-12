#!/usr/bin/env python3
"""Run in the disposable Docker lab; publish evidence only after real success."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone


LAB = Path("/lab")
CONTRACT = Path("/contract")
OUT = Path("/work/out")
EXPECTED_CONAN = "Conan version 2.15.0"


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def source_hashes():
    # Article/README edits and the legacy Conan 1 snapshot are not lab inputs.
    paths = [LAB / "run_lab.py", CONTRACT / "Dockerfile", CONTRACT / "run.sh"]
    for name in ("mymath", "consumer"):
        paths.extend(path for path in (LAB / name).rglob("*") if path.is_file())
    return {str(path): digest(path) for path in sorted(paths)}


def verify():
    state = json.loads((OUT / "last-run.json").read_text())
    summary = json.loads((OUT / "summary.json").read_text())
    if state.get("status") != "passed" or summary.get("status") != "passed":
        raise RuntimeError("Latest run did not pass; refuse to snapshot old evidence")
    if state["summary_sha256"] != digest(OUT / "summary.json"):
        raise RuntimeError("Summary changed after verification")
    if summary["source_sha256"] != source_hashes():
        raise RuntimeError("Lab inputs changed; run test again before snapshot")
    if summary["image_id"] != os.environ.get("CONAN_LAB_IMAGE_ID"):
        raise RuntimeError("Docker image differs from the verified run")
    if summary["transcript_sha256"] != digest(OUT / "transcript.txt"):
        raise RuntimeError("Transcript differs from the verified run")
    if not summary["checks"] or not all(item["passed"] for item in summary["checks"]):
        raise RuntimeError("Evidence contains an unsuccessful check")
    print("Evidence verified: latest run, inputs, image, checks and transcript match")


class Experiment:
    def __init__(self):
        OUT.mkdir(parents=True, exist_ok=True)
        self.started = now()
        write_json(OUT / "last-run.json", {"status": "running", "started_utc": self.started})
        self.log = (OUT / "transcript.txt").open("w", buffering=1)
        self.commands = []
        self.checks = []
        self.env = os.environ.copy()
        # Every invocation gets its own fresh cache, also in an interactive shell.
        self.env["CONAN_HOME"] = tempfile.mkdtemp(prefix="conan-cache-", dir="/work")
        self.workspace = Path(tempfile.mkdtemp(prefix="conan-example-", dir="/work"))
        for name in ("mymath", "consumer"):
            shutil.copytree(LAB / name, self.workspace / name)

    def command(self, label, argv, expected_failure=False):
        argv = [str(item) for item in argv]
        print(f"[{label}] {shlex.join(argv)}", flush=True)
        self.log.write(f"\n[{label}] $ {shlex.join(argv)}\n")
        started = time.monotonic()
        result = subprocess.run(argv, cwd=self.workspace, env=self.env,
                                text=True, capture_output=True, timeout=180)
        self.log.write("--- stdout ---\n" + result.stdout)
        self.log.write("--- stderr ---\n" + result.stderr)
        self.log.write(f"\n[exit_code={result.returncode}]\n")
        self.commands.append({"label": label, "argv": argv,
                              "exit_code": result.returncode,
                              "expected_failure": expected_failure,
                              "duration_seconds": round(time.monotonic() - started, 3)})
        if (result.returncode == 0) == expected_failure:
            raise RuntimeError(f"Unexpected exit code for {label}: {result.returncode}\n"
                               + result.stdout[-1500:] + result.stderr[-3500:])
        if "--format=json" in argv:
            (OUT / f"{label}.json").write_text(result.stdout)
        return result

    def check(self, name, condition, evidence):
        if not condition:
            raise AssertionError(f"{name}: {evidence}")
        self.checks.append({"name": name, "passed": True, "evidence": evidence})
        print(f"PASS: {name}", flush=True)

    @staticmethod
    def identity(result):
        graph = json.loads(result.stdout)["graph"]["nodes"]
        nodes = graph.values() if isinstance(graph, dict) else graph
        node = next(node for node in nodes
                    if str(node.get("ref", "")).startswith("mymath/")
                    and node.get("package_id"))
        return {key: node.get(key) for key in
                ("ref", "rrev", "package_id", "prev", "binary", "settings", "options")}

    @staticmethod
    def configuration(build_type):
        return ["-pr:b=default", "-pr:h=default", f"-s:h=build_type={build_type}",
                "-s:h=compiler.cppstd=17", "--no-remote"]

    def create(self, version, build_type, suffix=""):
        label = f"create-{version}-{build_type.lower()}{suffix}"
        result = self.command(label, ["conan", "create", "mymath", f"--version={version}",
                                     *self.configuration(build_type), "--format=json"])
        marker = f"test_package: sum=5; version={version}; build_type={build_type}"
        self.check(label + "-test-package", marker in result.stdout + result.stderr, marker)
        identity = self.identity(result)
        self.check(label + "-binary-identity",
                   all(identity[key] for key in ("ref", "rrev", "package_id", "prev")), identity)
        return identity

    def consumer(self, label, build_type, lockfile, expected_version):
        output = self.workspace / label
        install = self.command(label + "-install", [
            "conan", "install", "consumer", f"--output-folder={output}",
            *self.configuration(build_type), f"--lockfile={lockfile}",
            "--build=never", "--format=json"])
        identity = self.identity(install)
        build = output / "build" / build_type
        toolchain = build / "generators/conan_toolchain.cmake"
        self.check(label + "-cmake-generators", toolchain.is_file()
                   and (build / "generators/mymath-config.cmake").is_file(),
                   "cmake_layout generated CMakeToolchain and mymath CMakeDeps config")
        self.command(label + "-configure", ["cmake", "-S", "consumer", "-B", build,
                                            f"-DCMAKE_TOOLCHAIN_FILE={toolchain}",
                                            f"-DCMAKE_BUILD_TYPE={build_type}"])
        self.command(label + "-build", ["cmake", "--build", build, "--parallel", "2"])
        executable = build / "robot-consumer"
        run = self.command(label + "-run", [executable])
        marker = f"consumer: sum=5; version={expected_version}; build_type={build_type}"
        self.check(label + "-output", run.stdout.strip() == marker, run.stdout.strip())
        return identity

    def run(self):
        version = self.command("conan-version", ["conan", "--version"]).stdout.strip()
        self.check("fixed-conan-version", version == EXPECTED_CONAN, version)
        provenance = {
            "conan": version,
            "architecture": platform.machine(),
            "cmake": self.command("cmake-version", ["cmake", "--version"]).stdout.splitlines()[0],
            "compiler": self.command("compiler-version", ["g++", "--version"]).stdout.splitlines()[0],
            "compiler_target": self.command("compiler-target", ["g++", "-dumpmachine"]).stdout.strip(),
            "python": platform.python_version(),
            "python_dependencies": self.command("python-dependencies", ["pip", "freeze"]).stdout.splitlines(),
        }
        self.command("detect-profile", ["conan", "profile", "detect"])
        profile = Path(self.env["CONAN_HOME"]) / "profiles/default"
        provenance["detected_profile"] = profile.read_text()
        (OUT / "detected-profile.txt").write_text(profile.read_text())
        self.command("remove-remotes", ["conan", "remote", "remove", "*"])
        remotes = self.command("list-remotes", ["conan", "remote", "list", "--format=json"])
        self.check("no-conan-remotes", not json.loads(remotes.stdout), remotes.stdout.strip())

        release = self.create("1.0", "Release")
        debug = self.create("1.0", "Debug")
        self.check("debug-release-same-rrev-different-package-id",
                   release["rrev"] == debug["rrev"] and release["package_id"] != debug["package_id"],
                   {"release": release, "debug": debug})

        lock = OUT / "mymath-1.0.lock"
        self.command("create-lock", ["conan", "lock", "create", "consumer",
                                     *self.configuration("Release"), "--lockfile=",
                                     f"--lockfile-out={lock}"])
        lock_data = json.loads(lock.read_text())
        self.check("lock-captures-version-and-rrev",
                   any(item.startswith(f"mymath/1.0#{release['rrev']}")
                       for item in lock_data["requires"]), lock_data)

        new_version = self.create("1.1", "Release")
        unlocked = self.consumer("unlocked-release", "Release", "", "1.1")
        self.check("unlocked-range-selects-new-version", unlocked["ref"] == new_version["ref"], unlocked)

        # Change only the disposable source copy, retaining both cached revisions.
        source = self.workspace / "mymath/src/mymath.cpp"
        with source.open("a") as stream:
            stream.write("\n// A local source revision for the lockfile experiment.\n")
        revision = self.create("1.0", "Release", "-new-revision")
        self.check("source-change-new-rrev-same-package-id",
                   revision["rrev"] != release["rrev"]
                   and revision["package_id"] == release["package_id"],
                   {"initial": release, "changed_source": revision})

        locked_release = self.consumer("locked-release", "Release", str(lock), "1.0")
        locked_debug = self.consumer("locked-debug", "Debug", str(lock), "1.0")
        self.check("lock-retains-original-recipe-revision",
                   locked_release["ref"] == release["ref"]
                   and locked_debug["ref"] == debug["ref"],
                   {"release": locked_release, "debug": locked_debug})
        self.check("same-lock-different-binary-configurations",
                   locked_release["package_id"] == release["package_id"]
                   and locked_debug["package_id"] == debug["package_id"]
                   and locked_release["package_id"] != locked_debug["package_id"],
                   "The same version/RREV lock resolves each profile's own package ID")

        missing = self.command("missing-binary", [
            "conan", "install", "consumer", f"--output-folder={self.workspace / 'missing'}",
            *self.configuration("RelWithDebInfo"), f"--lockfile={lock}", "--build=never"],
            expected_failure=True)
        missing_text = missing.stdout + missing.stderr
        self.check("lock-does-not-create-missing-binary",
                   "Missing binary" in missing_text and "mymath/1.0" in missing_text,
                   {"exit_code": missing.returncode, "message": missing_text[-3000:]})
        cache = self.command("cache-identities", ["conan", "list", "mymath/*#*:*#*", "--format=json"])
        self.check("cache-list-readable", bool(json.loads(cache.stdout).get("Local Cache")),
                   "Full recipe revisions, package IDs and package revisions recorded in cache-identities.json")

        self.log.close()
        summary = {
            "schema_version": 1, "status": "passed", "started_utc": self.started,
            "finished_utc": now(), "image_id": os.environ.get("CONAN_LAB_IMAGE_ID", "unknown"),
            "environment": provenance, "source_sha256": source_hashes(),
            "transcript_sha256": digest(OUT / "transcript.txt"),
            "identities": {"release": release, "debug": debug,
                           "new_version": new_version, "changed_source": revision},
            "lockfile": lock_data, "checks": self.checks, "commands": self.commands,
            "boundaries": ["Native Linux execution only; not an ARM cross-compilation test",
                           "No remote registry, upload, authentication or third-party Conan package",
                           "Lockfile fixes dependency versions and recipe revisions, not binaries",
                           "Compiler/APT/Python transitive versions recorded, not all frozen"],
        }
        write_json(OUT / "summary.json", summary)
        write_json(OUT / "last-run.json", {"status": "passed", "finished_utc": now(),
                                          "summary_sha256": digest(OUT / "summary.json")})
        print(f"PASS: {len(self.checks)} checks; evidence in {OUT}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
        return
    experiment = Experiment()
    try:
        experiment.run()
    except BaseException as error:
        if not experiment.log.closed:
            experiment.log.write(f"\nFAILED: {error}\n")
            experiment.log.close()
        write_json(OUT / "last-run.json", {"status": "failed", "started_utc": experiment.started,
                                          "finished_utc": now(), "error": str(error)})
        raise


if __name__ == "__main__":
    main()
