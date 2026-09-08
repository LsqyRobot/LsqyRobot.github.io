"""Load with `source /lab/python_breakpoint.py` inside GDB's Python runtime."""
import gdb


class NegativeResult(gdb.Breakpoint):
    def stop(self):
        # Read inferior values; do not call functions in the debuggee.
        actual = int(gdb.parse_and_eval("actual"))
        if actual < 0:
            tick = int(gdb.parse_and_eval("tick"))
            gdb.write(f"Python filter accepted: tick={tick}, actual={actual}\n")
            return True
        return False


negative_result = NegativeResult("check_output")
