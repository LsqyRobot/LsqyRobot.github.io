"""Invoked by GDB, not the host Python interpreter. All outputs are actual GDB.

LAB_SCENARIO selects a recipe; LAB_OUTPUT selects its JSON file. A successful
process exits 0 only after scenario assertions. Unsupported optional reverse
recording is explicitly marked, never presented as a successful reverse demo.
"""
import json
import os
import traceback

import gdb

scenario = os.environ["LAB_SCENARIO"]
session = {"id": scenario, "title": scenario, "steps": [], "checks": [], "status": "running"}
last_stop = None


def remember_stop(event):
    global last_stop
    last_stop = event


gdb.events.stop.connect(remember_stop)


def step(commands, caption, duration_ms=4500):
    if isinstance(commands, str):
        commands = [commands]
    index = len(session["steps"])
    session["steps"].append({"command": "\n".join(commands), "output": "",
                             "caption": caption, "duration_ms": duration_ms})
    gdb.write(f"LAB STEP {index} BEGIN\n")
    # GDB 12 stop notifications bypass execute(to_string=True), and sometimes
    # GDB logging too. The parent runner records the *actual complete stdout*
    # between these markers; it never invents stop notifications for a GIF.
    try:
        for command in commands:
            gdb.write("LAB COMMAND: " + command + "\n")
            gdb.execute(command, to_string=False)
    except gdb.error as error:
        gdb.write("GDB command error: " + str(error) + "\n")
        raise
    finally:
        gdb.write(f"LAB STEP {index} END\n")


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    session["checks"].append(name)


def value(expression):
    return int(gdb.parse_and_eval(expression))


def run():
    for command in ["set pagination off", "set confirm off", "set print pretty on",
                    "set print frame-arguments all", "set print elements 20"]:
        gdb.execute(command)
    if scenario == "conditional":
        session["title"] = "Conditional breakpoint: stop at the bad sample"
        step("break check_output if actual != expected", "Skip correct samples automatically")
        step("run", "First bad result: tick 3, expected 20, actual -20")
        check("tick=3, expected=20, actual=-20", value("tick") == 3 and value("expected") == 20 and value("actual") == -20)
        step(["info args", "bt 3"], "Inspect values and the caller")
        step(["up", "list"], "Trace the incorrect result back to apply_gain")
    elif scenario == "watchpoint":
        session["title"] = "Hardware watchpoint: find the unexpected writer"
        step(["break watch_checkpoint", "run", "watch -l account.balance"], "Watch memory, not a guessed source line")
        check("hardware watchpoint selected", any(b.type == gdb.BP_HARDWARE_WATCHPOINT for b in gdb.breakpoints()))
        step("continue", "A valid deposit changes 100 to 125")
        check("legitimate deposit reaches 125", value("account.balance") == 125)
        step("continue", "The next writer changes 125 to -999")
        check("bad write reaches -999", value("account.balance") == -999)
        step(["bt 3", "print account.balance"], "buggy_fee is the responsible writer")
        check("stack identifies buggy_fee", "buggy_fee" in gdb.execute("bt", to_string=True))
    elif scenario == "threads":
        session["title"] = "Thread stacks: diagnose a missing notification"
        step(["break threads_checkpoint", "run"], "Two workers are waiting; main reaches a known checkpoint")
        step("info threads", "Three threads, not just the selected main thread")
        check("three live threads", len(gdb.selected_inferior().threads()) == 3)
        step("thread apply all bt 8", "Inspect every stack before guessing a deadlock", 6500)
        check("both workers are in wait_for_job", gdb.execute("thread apply all bt 8", to_string=True).count("wait_for_job (worker_id=") == 2)
        step(["print waiting_workers", "print release_workers"], "The release predicate is still false")
        check("release_workers is false", value("release_workers") == 0)
    elif scenario == "exception":
        session["title"] = "C++ catchpoint: stop where an exception is thrown"
        step("catch throw", "Catch the throw before application code swallows it")
        step("run", "Stop in the C++ runtime throw path")
        check("catch throw fired", isinstance(last_stop, gdb.BreakpointEvent) and "__cxa_throw" in gdb.newest_frame().name())
        step(["bt 4", "up", "info args"], "Select the user frame: seconds is -1")
        check("throw origin contains seconds=-1", value("seconds") == -1)
        step("continue", "The application catches it and exits normally")
        check("inferior exited", gdb.selected_inferior().pid == 0)
    elif scenario == "core":
        session["title"] = "Core debugging: inspect a crash after the process is gone"
        step("run", "SIGSEGV: inspect before changing anything")
        check("null target crash", isinstance(last_stop, gdb.SignalEvent) and last_stop.stop_signal == "SIGSEGV" and value("target") == 0 and value("command") == 47)
        step(["bt 3", "info args"], "The bad target is null; the command is 47")
        step(["generate-core-file /work/out/crash.core", "kill"], "Save process memory and terminate this test process")
        check("nonempty core produced", os.path.getsize("/work/out/crash.core") > 4096)
        step(["core-file /work/out/crash.core", "bt 3", "info args"], "Reload the snapshot with the same executable", 6500)
        check("reloaded core preserves arguments", value("target") == 0 and value("command") == 47)
    elif scenario == "python":
        session["title"] = "GDB Python: a programmable breakpoint filter"
        step("source /lab/python_breakpoint.py", "Load a breakpoint class with a Python stop() predicate")
        step("run", "Only a negative result is accepted by the Python filter")
        check("Python predicate accepted bad result", isinstance(last_stop, gdb.BreakpointEvent) and value("actual") == -20)
        step(["info args", "bt 3"], "GDB remains interactive at the selected anomaly")
        check("Python filter stopped at tick 3", value("tick") == 3 and value("actual") == -20)
    elif scenario == "reverse":
        session["title"] = "Reverse debugging: test support before relying on it"
        step(["break reverse_begin", "break reverse_end", "run", "finish"], "Start recording before the two integer writes")
        try:
            step("record full", "Enable software process recording")
        except gdb.error as error:
            message = str(error)
            gdb.write("record full error: " + message + "\n")
            session["steps"][-1]["caption"] = "Unsupported on this tested target; no reverse claim"
            if "does not support" not in message and "not supported" not in message:
                raise
            session["status"] = "unsupported"
            session["reason"] = message
            session["checks"].append("unsupported target reported explicitly")
            return
        step(["continue", "print counter"], "Forward execution reaches counter=2")
        check("forward counter=2", value("counter") == 2)
        for _ in range(12):
            step(["reverse-next", "print counter"], "Rewind one source step")
            if value("counter") == 1:
                break
        check("reverse execution restores counter=1", value("counter") == 1)
    else:
        raise ValueError("unknown scenario: " + scenario)
    session["status"] = "passed"


try:
    run()
except Exception as error:
    session["status"] = "failed"
    session["error"] = str(error)
    traceback.print_exc()
finally:
    with open(os.environ["LAB_OUTPUT"], "w", encoding="utf-8") as stream:
        json.dump(session, stream, indent=2)
    gdb.execute("quit " + ("1" if session["status"] == "failed" else "0"))
