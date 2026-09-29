# 验证范围

日期：2026-09-27。临时容器使用本机既有 `ros2-humble-dev:local`
镜像（Ubuntu 22.04 / ROS 2 Humble / aarch64 / GDB 12.1），源码只读挂载。
构建产物只存在于临时容器；未改已有运行容器或基础镜像。

已验证：

- `colcon build --packages-select diagnostic_demo --cmake-args -DCMAKE_BUILD_TYPE=Debug` 成功。
- GDB 条件断点 `break DiagnosticNode::tick if count_ == 4` 命中第五次回调入口。
- 此时启用 `catch throw` 并继续，停在 `__cxa_throw`。
- 栈包含 `std::vector<int>::at` 和 `DiagnosticNode::tick`，后者指向源码第 32 行。
- `print values` 得到长度 3、内容 `{10, 20, 30}`；`print count_` 得到 `5`。
- normal 和 slow 各运行约 6 秒，计数持续增长；slow 的日志耗时约 80 ms 以上。
  日志只是 `steady_clock` 的局部测量，不是 LTTng trace，也不代表控制性能基准。

GDB 复现命令（构建并加载工作区后执行）：

```bash
gdb -q -batch \
  -ex 'set pagination off' \
  -ex 'break DiagnosticNode::tick if count_ == 4' \
  -ex run -ex 'delete 1' -ex 'catch throw' -ex continue \
  -ex 'bt 6' -ex 'frame function DiagnosticNode::tick' \
  -ex 'print values' -ex 'print count_' \
  --args install/diagnostic_demo/lib/diagnostic_demo/diagnostic_node \
  --ros-args -p mode:=crash
```

容器中设置 `ROS_LOCALHOST_ONLY=1` 并给予 `SYS_PTRACE`，GDB 关于无法关闭
ASLR 的警告未阻止断点和变量检查。`catch throw` 如果在启动前设置，会先捕获
Fast DDS 内部初始化异常；因此上面的复现把 catchpoint 延迟到目标回调入口。

未进行运行验证：LTTng 采集、tracetools_analysis notebook、内核跟踪、core
收集、launch 批处理、perf / strace / Sanitizer 和跨机器消息延迟。
现有镜像的 `tracetools status` 返回 `Tracing disabled`，没有 `ros2 trace`
命令；笔记说明了安装及 overlay 构建方式，未把这些步骤声称为已完成实测。
