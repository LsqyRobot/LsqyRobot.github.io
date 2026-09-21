#!/usr/bin/env python3
"""Build and verify all sessions inside the declared Linux Docker image."""
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

SOURCE = Path("/lab")
OUTPUT = Path("/work/out")
OUTPUT.mkdir(parents=True, exist_ok=True)


def execute(command, **kwargs):
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=90, **kwargs)
    if result.returncode:
        raise RuntimeError(f"{command!r} failed ({result.returncode})\n{result.stdout}")
    return result.stdout


build = ["g++", "-std=c++17", "-g3", "-Og", "-fno-omit-frame-pointer", "-pthread",
         str(SOURCE / "debug_lab.cpp"), "-o", "/work/debug_lab"]
reverse_build = ["g++", "-g3", "-O0", "-fno-omit-frame-pointer",
                 str(SOURCE / "reverse_demo.cpp"), "-o", "/work/reverse_demo"]
execute(build)
execute(reverse_build)
for binary in ["debug_lab", "reverse_demo"]:
    shutil.copy2(Path("/work") / binary, OUTPUT / binary)
source_names = ["debug_lab.cpp", "reverse_demo.cpp", "record_session.py", "python_breakpoint.py", "run_lab.py"]
provenance = {
    "machine": platform.machine(), "platform": platform.platform(),
    "uid": os.getuid(), "gid": os.getgid(),
    "gdb_version": execute(["gdb", "--version"]),
    "compiler_version": execute(["g++", "--version"]),
    "packages": execute(["dpkg-query", "-W", "gdb", "gdbserver", "g++", "libc6", "python3", "python3-pil"]),
    "compile_commands": [build, reverse_build],
    "source_sha256": {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()
                      for name in source_names},
    "binary_sha256": {name: hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()
                      for name in ["debug_lab", "reverse_demo"]},
    "base_image": "ubuntu:22.04@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc",
    "image_id": os.environ.get("GDB_LAB_IMAGE_ID", "not supplied; use docker/gdb-lab/run.sh test"),
    "security": {"network": "none", "source_mount": "read-only", "non_root": os.getuid() != 0,
                 "cap_add": ["SYS_PTRACE"], "seccomp": "unconfined", "privileged": False},
}
(OUTPUT / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
sessions = []
transcripts = []
for scenario in ["conditional", "watchpoint", "threads", "exception", "core", "python", "reverse"]:
    target = "/work/reverse_demo" if scenario == "reverse" else "/work/debug_lab"
    mode = "conditional" if scenario == "python" else scenario
    command = ["gdb", "--quiet", "--nx", "--batch", "-x", str(SOURCE / "record_session.py"),
               "--args", target] + ([] if scenario == "reverse" else [mode])
    env = dict(os.environ, LAB_SCENARIO=scenario, LAB_OUTPUT=str(OUTPUT / f"{scenario}.json"))
    result = subprocess.run(command, env=env, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=45)
    (OUTPUT / f"{scenario}.log").write_text(result.stdout, encoding="utf-8")
    transcripts.append(f"===== {scenario} =====\n" + result.stdout)
    if result.returncode:
        print(result.stdout, file=sys.stderr)
        raise SystemExit(f"{scenario}: failed (exit {result.returncode})")
    session = json.loads((OUTPUT / f"{scenario}.json").read_text(encoding="utf-8"))
    for index, item in enumerate(session["steps"]):
        match = re.search(rf"LAB STEP {index} BEGIN\n(.*?)LAB STEP {index} END\n", result.stdout, re.S)
        if match is None:
            raise RuntimeError(f"missing raw stdout markers: {scenario} step {index}")
        item["output"] = "".join(line for line in match.group(1).splitlines(keepends=True)
                                 if not line.startswith("LAB COMMAND: "))
    (OUTPUT / f"{scenario}.json").write_text(json.dumps(session, indent=2), encoding="utf-8")
    sessions.append(session)
    print(f"{scenario}: {session['status']} ({len(session['checks'])} assertions)", flush=True)
(OUTPUT / "sessions.json").write_text(json.dumps(sessions, indent=2), encoding="utf-8")
(OUTPUT / "recorded-sessions.json").write_text(json.dumps(sessions, indent=2), encoding="utf-8")
(OUTPUT / "full-transcript.txt").write_text("\n".join(transcripts), encoding="utf-8")
validation = dict(provenance, scenarios=[{"id": s["id"], "status": s["status"], "checks": s["checks"]} for s in sessions])
validation["recorded_sessions_sha256"] = hashlib.sha256((OUTPUT / "recorded-sessions.json").read_bytes()).hexdigest()
validation["full_transcript_sha256"] = hashlib.sha256((OUTPUT / "full-transcript.txt").read_bytes()).hexdigest()
(OUTPUT / "validation.json").write_text(json.dumps(validation, indent=2), encoding="utf-8")
print("All mandatory scenarios passed; consult reverse.status for target support.")
