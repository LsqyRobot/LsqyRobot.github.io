# TF2 learning lab

Baseline: Ubuntu 22.04 + ROS 2 Humble. Python 3 scripts need no colcon build.
Both scripts are MIT-licensed. Run only one demo publisher for these frame names.

Install dependencies inside the ROS Linux environment:

```bash
sudo apt install ros-humble-rclpy ros-humble-tf2-ros ros-humble-tf2-tools \
  ros-humble-tf2-geometry-msgs ros-humble-geometry-msgs graphviz
```

Terminal A, from the directory holding these scripts:

```bash
source /opt/ros/humble/setup.bash
python3 demo.py
```

Terminal B, source the same installation, then run commands individually:

```bash
python3 probe.py
ros2 run tf2_ros tf2_echo base_link laser_frame
ros2 run tf2_tools view_frames
ros2 run tf2_ros tf2_monitor odom laser_frame
```

Stop persistent commands with Ctrl+C. `view_frames` writes files in the current
directory. In a graphics-enabled Linux environment, RViz can show the moving
frames using Fixed Frame `odom` and a TF display.

The static edge translates by (0.3, 0, 0.2) m and rotates +90 degrees about Z.
A point (1, 0, 0) in laser_frame becomes (0.3, 1, 0.2) in base_link. The inverse
translation is (0, 0.3, -0.2), not just the negative of the forward translation.

The dynamic odom-to-base_link edge is published every 50 ms. Stop demo.py, then
restart with `python3 demo.py --ros-args -p stamp_delay:=0.5` to publish transforms
whose timestamp and corresponding pose lag current ROS time by 0.5 seconds.
Compare the monitor output and `latest_age_seconds` in probe.py. Actual timing
depends on the machine and scheduling.

See `/2026/09/27/ros2_tf2_tools_practical_guide/` for the full Chinese tutorial,
and `VALIDATION.md` for the scope of runtime verification.
