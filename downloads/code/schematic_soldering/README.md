# 配套电路恢复练习

主笔记：`/2026/09/29/schematic_reading_soldering_simulation/`。

文件含义：

- `01-divider.cir`：5V、10k/10k 分压，另并联 10k 负载。
- `02-led.cir`：5V、1k 与教学二极管模型；工作点和供电 DC 扫描。
- `03-rc.cir`：10k、1uF，1ms 开始的脉冲上升，瞬态仿真。
- `run_experiments.py`：真实调用 ngspice，检查 7 个数值条件，保存 SVG 曲线和 JSON 报告。
- `measurement-sheet.md`：预测、仿真、实测对照模板。
- `VALIDATION.md`：实际测试结果与边界。

这些 `.cir` 是 ngspice 网表，不是 KiCad 原理图文件。每个器件行给出节点连接，节点 `0` 为参考地。可复制参数在仿真软件中重画。

已有 Python 3 和 ngspice 时，在本目录执行：

```bash
python3 run_experiments.py --out /absolute/path/to/new-results
```

已有 ngspice、只运行一个实验时，可在可写目录执行 `ngspice -b 03-rc.cir`；`.dat` 输出到当前工作目录。修改参数后原始理论验收可能不再适用，应重新计算预期，不是放宽容差。

在原笔记仓库使用隔离 Docker 环境：

```bash
./bin/site.sh electronics-build
./bin/site.sh electronics-test
```

首次镜像构建联网安装软件包；仿真在断网、非 root、只读根文件系统中执行。不同批次输出到新目录，保留输入网表、ngspice 日志、镜像身份、原始数据和判定结果。

LED 模型仅用于学习；没有指定真实器件料号。仿真不包含焊点故障、制造公差、完整热模型或 PCB 寄生，也不生成生产板文件。
