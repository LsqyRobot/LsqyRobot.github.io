# ROS 2 diagnostics demo

Baseline: Ubuntu 22.04 / ROS 2 Humble, C++17. This package deliberately throws
an uncaught exception in `crash` mode. Use in an isolated development environment.

Copy `diagnostic_demo/` to `~/diagnostics_ws/src/`, then use a fresh Bash terminal:

```bash
source /opt/ros/humble/setup.bash
cd ~/diagnostics_ws
colcon build --packages-select diagnostic_demo --symlink-install \
  --cmake-args -DCMAKE_BUILD_TYPE=Debug
source install/setup.bash
ros2 run diagnostic_demo diagnostic_node --ros-args -p mode:=normal
```

Stop with Ctrl+C. `mode:=slow` sleeps for 80 ms in each 100 ms timer callback;
`mode:=crash` calls `values.at(5)` on a three-element vector on the fifth callback.
The mode is read at startup: restart the process after changing it.

```bash
ros2 run --prefix 'gdb -q --args' diagnostic_demo diagnostic_node \
  --ros-args -p mode:=crash
```

In GDB: `catch throw`, `run`, `bt`, then select the `DiagnosticNode::tick`
frame by its actual frame number. Inspect `count_` and `values`.

The article contains tracing setup and interpretation:
`/2026/09/27/ros2_debugging_gdb_tracing/`.

This example has no launch or tracing dependency; installing it does not enable
tracing in your ROS distribution. See `VALIDATION.md` for the verified scope.
