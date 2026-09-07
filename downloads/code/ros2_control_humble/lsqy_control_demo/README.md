# ROS 2 Humble：双关节控制接线与 Executor 教学包

目标平台：Ubuntu 22.04、ROS 2 Humble、Humble 分支 `ros2_control` / `ros2_controllers`。核对日期：2026-09-06。包名 `lsqy_control_demo`。

**验证边界：本包完成的是源码、配置与官方 Humble API 核对及宿主机静态检查；尚未在 ROS 容器中 colcon 编译、启动或发送实际 Action。下面的运行结果均为验收预期，不是已测日志。** 不需要 RViz、GPU、Gazebo、实体机械臂，不能把它当作动力学仿真或真机安全验收。

本包包含两个独立实验：

1. `demo.launch.py`：位置轨迹 → JTC → `GenericSystem` → 关节状态，理解框架接线、接口 claim、控制器生命周期。
2. `executor_demo`：慢/快回调在单线程、多线程与回调组中的调度对照。它是普通 `rclcpp` 节点，不接入控制器，也不会改变 Controller Manager 的 Executor。

## 1. 文件结构与固定约定

```text
lsqy_control_demo/
├── package.xml
├── CMakeLists.txt
├── README.md
├── config/controllers.yaml
├── urdf/two_joint_arm.urdf
├── launch/demo.launch.py
└── src/executor_demo.cpp
```

文章提供 `lsqy_control_demo.zip` 与 `SHA256SUMS.txt`。ZIP 只打包上述源码与文档，不包含 ROS 依赖、编译结果或已经验收的镜像。单独下载时，先校验 SHA-256，再把 ZIP 解压到你自己的 colcon 工作空间 `src/` 中，得到 `src/lsqy_control_demo/package.xml`；不要再多套一层同名目录。在工作空间根目录运行 `colcon build --packages-select lsqy_control_demo --symlink-install`，随后 `source install/setup.bash`。第 3 节展示的是直接使用本仓库源码、将构建产物放入仓库 `build/` 的另一种布局。

| 项目 | 本包约定 |
| --- | --- |
| Manager 节点 | `/controller_manager` |
| 硬件组件 | `DemoSystem`，`mock_components/GenericSystem` |
| 关节名/排列 | `joint1`、`joint2` |
| 命令接口 | `joint1/position`、`joint2/position`，单位 rad |
| 状态接口 | 两个关节各 `position`（rad）、`velocity`（rad/s） |
| 默认激活 | `joint_state_broadcaster`、`arm_controller` |
| 已配置但默认不加载 | `forward_position_controller` |
| 关节状态话题 | `/joint_states` |
| 轨迹 Action | `/arm_controller/follow_joint_trajectory` |
| 控制周期 | `update_rate: 100`，目标周期 10 ms，不是实时性能保证 |
| 时间来源 | `use_sim_time: false`，不等待 `/clock` |

URDF 的 `<limit>` 描述模型范围，**不能据此认为任意硬件命令都已有运行时限幅**。示例只发范围内的小幅命令，没有实现真实驱动保护、急停或 watchdog。

## 2. 准备 ROS 环境：使用 ROS 开发容器

本仓库的 `docker/ros2-humble-dev` 默认安装 `ros-base`，不能假设已经包含 `ros2_control`。本次文章补充没有修改或重新构建这个镜像；它的历史验收边界仍以该目录 README 及 Docker 总览中的待办为准。MuJoCo、Flight Lab 的测试不代表 ROS 包能运行。

要让依赖随镜像迁移，应将下列安装段加入 **ROS 开发 Dockerfile** 中：放在添加 ROS apt 源之后、切换到非 root 的 `USER` 之前；随后显式重新构建。不要加入 Flight Lab 或在 macOS 宿主机安装这些 ROS 二进制。

```dockerfile
# ROS 2 Humble control tutorial dependencies (Ubuntu 22.04).
# 依赖版本随 ROS apt 仓库更新；验收后保存具体 dpkg 版本与镜像 digest。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ros-humble-ros2-control \
        ros-humble-ros2-controllers \
        ros-humble-robot-state-publisher \
    && rm -rf /var/lib/apt/lists/*
```

以上是**供将来实施的 Dockerfile 片段**，不是声明当前镜像已有这些包。准备好对应依赖后，可在仓库根目录执行：

```bash
# 宿主机；仅在已决定构建此 ROS 环境时执行。
docker compose -f docker/ros2-humble-dev/compose.yaml build
docker compose -f docker/ros2-humble-dev/compose.yaml up -d
docker compose -f docker/ros2-humble-dev/compose.yaml exec dev bash
```

容器内检查：

```bash
source /opt/ros/humble/setup.bash
ros2 pkg prefix controller_manager
ros2 pkg prefix hardware_interface
ros2 pkg prefix joint_trajectory_controller
ros2 pkg prefix robot_state_publisher
ros2 run controller_manager spawner --help
ros2 control switch_controllers --help
```

如果已有 Ubuntu 22.04/Humble 开发机，也可在该环境构建，不必额外创建容器。以下路径以本仓库被挂载为 `/workspace` 为例；迁移时只需把源码和构建目录改为你的实际路径，不要照搬 macOS 用户名路径。

## 3. 构建与启动

在容器内：

```bash
source /opt/ros/humble/setup.bash
# 77 仅是示例：先确认该 domain 未被其他实验占用。
export ROS_DOMAIN_ID=77
export ROS_LOCALHOST_ONLY=1
mkdir -p /workspace/build/ros2-control-demo-ws
cd /workspace/build/ros2-control-demo-ws
colcon build \
  --base-paths /workspace/source/downloads/code/ros2_control_humble/lsqy_control_demo \
  --packages-select lsqy_control_demo \
  --symlink-install
source install/setup.bash
ros2 launch lsqy_control_demo demo.launch.py
```

保持这个终端运行。第二个终端通过同一 `dev` 容器执行 ROS 命令：

```bash
# 宿主机
docker compose -f docker/ros2-humble-dev/compose.yaml exec dev bash
```

```bash
# 每个新开的容器内 bash 终端都执行
source /opt/ros/humble/setup.bash
source /workspace/build/ros2-control-demo-ws/install/setup.bash
export ROS_DOMAIN_ID=77
export ROS_LOCALHOST_ONLY=1
```

为避免 mock 命令误发给同名真机，实验使用独立、未占用的 ROS domain，并限制本地主机发现；这些设置要在**启动节点和运行命令之前**完成。所有实验终端必须通过 `exec` 进入同一个 `dev` 容器并设置相同的两个变量。77 不是预留的“教学专用域”，如果已占用就换成经确认空闲的值。不同容器的 localhost 通常不是同一个网络空间；不要一边在新 `run` 容器启动节点、一边在旧容器发命令。ROS_DOMAIN_ID/LOCALHOST_ONLY 是减少意外连接的措施，不是恶意访问的安全认证机制；本教学环境不应连接实体机器人设备。[Humble 环境变量配置](https://docs.ros.org/en/humble/Tutorials/Beginner-CLI-Tools/Configuring-ROS2-Environment.html)

这里没有 xacro 变量，launch 直接读取完整 URDF。`robot_state_publisher` 获得 `robot_description` 参数并发布描述话题；Manager 将 `~/robot_description` 映射到 `/robot_description`。当前 Humble 推荐话题方式，旧式直接给 Manager 传 `robot_description` 参数已标记弃用；若本地旧二进制行为不同，先记录版本并核对对应源码，不要混抄 Rolling/Jazzy API。[Humble Controller Manager](https://control.ros.org/humble/doc/ros2_control/controller_manager/doc/userdoc.html)

launch 不以固定睡眠判断是否就绪。一个 `spawner` 等待 Manager 服务，然后按 `joint_state_broadcaster`、`arm_controller` 顺序逐个 load/configure/activate。它正常退出不意味着控制器停止；控制器运行在 Manager 进程中。示例检查 spawner 的退出码，非零时请求整个 launch 关闭；Manager/RSP 提前退出也触发关闭。`Shutdown` 事件不等于已提供严格的 CI 验收退出码，自动化测试仍应检查 controller 状态和 Action 结果。[Humble spawner 源码](https://github.com/ros-controls/ros2_control/blob/humble/controller_manager/controller_manager/spawner.py)、[Humble OnProcessExit](https://github.com/ros2/launch/blob/humble/launch/launch/event_handlers/on_process_exit.py)

## 4. 检查组件、接口与反馈

```bash
ros2 control list_hardware_components -c /controller_manager
ros2 control list_hardware_interfaces -c /controller_manager
ros2 control list_controllers -c /controller_manager
ros2 action list -t
ros2 topic info /joint_states --verbose
ros2 topic echo /joint_states sensor_msgs/msg/JointState --once
```

应检查的现象：

- 硬件 `DemoSystem` 为 active。
- `joint_state_broadcaster` 和 `arm_controller` 为 active。
- 两个 position command interface 可用且已被 JTC claimed。
- 两组 position/velocity state interface 可用；没有要求 broadcaster 独占 state interface。
- `/joint_states` 包含两个关节；根据消息的 `name` 匹配位置，不硬编码返回数组顺序。

这是预期清单，CLI 格式可能随 Humble 补丁版本不同。`forward_position_controller` 此时通常不在已加载控制器列表；在参数文件中声明类型不等于已加载实例。

## 5. 发送轨迹并核对结果

在默认 `arm_controller` 为 active 时：

```bash
ros2 action send_goal \
  /arm_controller/follow_joint_trajectory \
  control_msgs/action/FollowJointTrajectory \
  "{trajectory: {joint_names: [joint1, joint2], points: [{positions: [0.5, -0.3], time_from_start: {sec: 2, nanosec: 0}}]}}" \
  --feedback
```

验收时不能只看 `Goal accepted`。继续核对终态是否 SUCCEEDED、结果 `error_code` 是否 0，然后再次读取：

```bash
ros2 topic echo /joint_states sensor_msgs/msg/JointState --once
```

目标是经过约 2 秒的轨迹执行后，按关节名对应的位置接近 `joint1=0.5 rad`、`joint2=-0.3 rad`。这 2 秒是轨迹相对时间，不包括终端启动、DDS 发现、Action 通信和结果监测耗时；配置的 `goal_time: 1.0` 是额外的到达容差时间，不是额外轨迹点。[Humble Joint Trajectory Controller](https://control.ros.org/humble/doc/ros2_controllers/joint_trajectory_controller/doc/userdoc.html)

**为何这不是物理闭环验证？** 本包 `calculate_dynamics=false`，`GenericSystem` 将 position command 回显为 position state；没有质量、摩擦、碰撞、电机、电流或编码器。没有 velocity command 且关闭差分推导时，示例的 velocity state 保持初始化的 0，并不是实际运动速度。即使 Action 成功，也只证明这一配置的命令/状态链路，不能证明轨迹跟踪能力或停车安全。[Humble mock 组件说明](https://control.ros.org/humble/doc/ros2_control/hardware_interface/doc/mock_components_userdoc.html)、[GenericSystem::read() 源码](https://github.com/ros-controls/ros2_control/blob/humble/hardware_interface/src/mock_components/generic_system.cpp)

## 6. 比较独占 command interface 与控制器切换

仅在这个 mock 上做以下实验，不要直接复制到正在作业的真机。先等前一条 Action 完成：

```bash
# 加载和配置，不立即申请 position 接口。
ros2 run controller_manager spawner forward_position_controller \
  -c /controller_manager --inactive --controller-manager-timeout 30
ros2 control list_controllers -c /controller_manager
```

JTC 仍占用同一组 position command interfaces 时，只激活另一个 position controller 应因资源冲突而失败：

```bash
# 故意失败的教学检查；失败后仍要重新查看两个控制器的实际状态。
ros2 control switch_controllers -c /controller_manager \
  --activate forward_position_controller --strict
ros2 control list_controllers -c /controller_manager
```

正确做法是在一次切换请求中停掉旧控制器、激活新控制器：

```bash
ros2 control switch_controllers -c /controller_manager \
  --deactivate arm_controller --activate forward_position_controller --strict
ros2 control list_controllers -c /controller_manager

ros2 topic pub --once /forward_position_controller/commands \
  std_msgs/msg/Float64MultiArray "{data: [0.2, -0.1]}"
ros2 topic echo /joint_states sensor_msgs/msg/JointState --once
```

这是直接位置命令，没有 Action 结果，也没有 JTC 的轨迹插值；该接口切换实验与硬件控制模式切换不是同一层问题。恢复轨迹控制器：

```bash
ros2 control switch_controllers -c /controller_manager \
  --deactivate forward_position_controller --activate arm_controller --strict
ros2 control list_controllers -c /controller_manager
```

`--strict` 要求严格处理请求，并不是任意运行时故障的事务回滚保证；每次切换后都应查看真实状态。参数拼写以本机 `--help` 为准，本包使用当前 Humble 的 `--activate` / `--deactivate`。[Humble switch_controllers CLI 源码](https://github.com/ros-controls/ros2_control/blob/humble/ros2controlcli/ros2controlcli/verb/switch_controllers.py)

## 7. SingleThreadedExecutor / MultiThreadedExecutor 对照

停止上一轮 `executor_demo` 后再启动下一轮，各观察 5～10 秒即可；它与 mock launch 相互独立，不要求启动控制器。

```bash
# 两个不同回调组，但 executor 只有一个回调执行线程。
ros2 run lsqy_control_demo executor_demo \
  --ros-args -p executor:=single -p same_group:=false

# 两个线程、两个独立互斥组。
ros2 run lsqy_control_demo executor_demo \
  --ros-args -p executor:=multi -p same_group:=false

# 两个线程、同一个互斥组：仍不能同时执行这两个回调。
ros2 run lsqy_control_demo executor_demo \
  --ros-args -p executor:=multi -p same_group:=true
```

| 模式 | 如何阅读日志（预期，不是实测输出） |
| --- | --- |
| single + 不同组 | slow BEGIN/END 的约 700 ms 区间内，fast 无法执行，`gap` 增大 |
| multi + 不同组 | slow 等待期间允许出现 fast 日志，fast 的 `gap` 应更接近 100 ms |
| multi + 同组 | slow 占用该互斥组期间 fast 仍被阻塞，即使有另一个空闲线程 |

回调组和 timer 都由类成员 `SharedPtr` 保持生命周期。`last_fast_` 仅在 fast 回调中修改，其互斥组保证它不会与自身同时执行；如果新增跨组共享状态，必须重新设计同步，不能凭“每组互斥”推断不同组之间也安全。多线程只允许并发，不保证调度公平性、固定线程绑定、优先级或确定周期；不同 CPU/负载下具体日志顺序会不同。[ROS 2 Humble Callback Groups 官方指南源码](https://github.com/ros2/ros2_documentation/blob/humble/source/How-To-Guides/Using-callback-groups.rst)

程序用 `steady_clock` 测量间隔，故意在慢回调里 `sleep_for(700ms)` 以模拟阻塞 I/O。这是教学反例，不是推荐的控制代码：不要把睡眠、每周期日志、动态字符串分配放入硬件 `read()` / `write()` 或控制器 `update()`。本程序显式指定两个线程，不依赖机器上的默认线程数量。[Humble MultiThreadedExecutor 构造函数](https://github.com/ros2/rclcpp/blob/humble/rclcpp/include/rclcpp/executors/multi_threaded_executor.hpp)

## 8. 停止、保存与复现记录

在 launch 终端按 Ctrl-C 关闭本次节点。若本 ROS 容器没有其他在用工作，宿主机可执行：

```bash
docker compose -f docker/ros2-humble-dev/compose.yaml down
```

源码位于仓库 `source/downloads/code/ros2_control_humble/lsqy_control_demo`；上述构建目录、install、colcon 日志都在宿主机绑定的 `build/ros2-control-demo-ws` 下。容器停止不会删除这些文件。不要把 `build/` 当作已纳入 Git 的实验备份，迁移时另存日志和版本记录。

建议第一次实际验收时记录：

- 日期、CPU 架构、Ubuntu 版本、ROS_DISTRO、RMW_IMPLEMENTATION、镜像完整 ID。
- `dpkg-query -W 'ros-humble-controller-manager' 'ros-humble-hardware-interface' 'ros-humble-joint-trajectory-controller' 'ros-humble-rclcpp'` 输出。
- 本包版本/仓库提交、所有自定义 URDF/YAML，以及完整 launch 日志。
- controller / hardware interface 列表，Action 最终状态和误差，不能只截取成功连接日志。
- 三种 Executor 模式的 fast 间隔记录，注明系统负载；不能用这一小实验宣称硬实时。

待验证：Humble 环境真正 colcon 编译、launch 启动、Action 结果、资源冲突与恢复、三种 Executor 调度观测。未来接入真实硬件/物理仿真时，需另验收失联、超时、限位、初始化保持、停止策略与实际测量反馈。本包没有自定义硬件驱动，不申请设备或实时调度权限。

`package.xml` 中的维护邮箱是示例占位，若将此包作为独立公开软件发布，应替换为真实项目维护信息并补齐发布许可文件。
