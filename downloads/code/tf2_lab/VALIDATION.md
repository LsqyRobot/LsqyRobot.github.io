# TF2 实验验证记录

日期：2026-09-27。环境：既有 `ros2-humble-dev:local` 镜像、Ubuntu 22.04、
ROS 2 Humble、ARM64。使用临时容器，源码只读挂载，`ROS_LOCALHOST_ONLY=1`，
`ROS_DOMAIN_ID=73`。未修改已有容器或基础镜像。

已验证 normal 与 `stamp_delay:=0.5` 两种模式的 probe 均输出 `passed: true`：

- 正向平移 `[0.3, 0, 0.2]`。
- 反向平移约 `[0, 0.3, -0.2]`，浮点误差约 1e-16。
- 雷达点 `[1, 0, 0]` 转到底盘为 `[0.3, 1, 0.2]`。
- `odom -> laser_frame` 的跨边组合与相同 Buffer 内的动态平移一致。
- 不存在的 frame 触发 LookupException，未来／过去 60 秒触发 ExtrapolationException。

三个 CLI 工具已执行：

- `tf2_echo` 正向与反向输出和上述数值一致。
- `view_frames` 生成 `.gv` 和 PDF，识别 `odom -> base_link -> laser_frame`。
  动态边显示约 20.179 Hz、5.005 秒历史；静态边显示 10000 Hz 与零时间，
  不应将该静态显示值解释为真实发布频率。
- `tf2_monitor` 每次运行约 12 秒，得到如下单次测量（秒）：

| 指标 | normal | 延后 0.5 秒 |
| --- | ---: | ---: |
| probe 查询到的最新动态 TF 年龄 | 0.002312334 | 0.501202250 |
| base_link Average Delay | 0.00118087 | 0.501088 |
| base_link Max Delay | 0.00541711 | 0.502472 |
| Net delay avg | 0.00416508 | 0.100490 |
| Net delay max | 0.0475662 | 0.553883 |

Net delay avg 在 Humble 中使用从零初始化的低通估计，短观察窗口下尚未收敛，
不能拿它代替逐帧 Average Delay。静态 laser_frame 在 normal 会话显示
15.2699 秒，是早先静态 stamp 与晚加入 monitor 当前时间的差，外参并没有失效。

原始文本位于 `evidence/`，可对照阅读；数值不是性能保证。持续 CLI 的退出码
124 是验证脚本在规定时间发送 SIGINT 后由 `timeout` 返回的结果。

复现：按 README 启动 demo，分别执行 probe、view_frames、正反 tf2_echo 和
tf2_monitor；停止 demo 后用 `stamp_delay:=0.5` 重新启动，再运行 probe 与 monitor。

未实测：RViz GUI、C++ 集成片段、跨机器同步、bag 回放及仿真时钟跳转。
