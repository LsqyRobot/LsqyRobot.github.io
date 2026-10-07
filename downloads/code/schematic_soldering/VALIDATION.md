# 验证记录（2026-09-29）

实际环境：Docker Desktop，Linux arm64，Ubuntu 22.04，ngspice 36（Ubuntu 包 36+ds-1ubuntu0.1），Python 3.10。不是对最新版软件的声明。

命令：`./bin/site.sh electronics-test build/electronics-lab/validated-20260929`，退出码 0。

仿真容器断网、只读根文件系统、非 root；仅挂载只读实验目录和可写输出目录。

镜像 ID：`sha256:42240bd2e10fdae6ada3978467c1b1908c8296e77575bc90f67e3bae8d657c6f`。

| 核对项 | 仿真值 | 理论/独立计算值 | 绝对容差 | 结果 |
| --- | --- | --- | --- | --- |
| loaded divider output / V | 1.66666667 | 1.66666667 | 1e-05 | 通过 |
| divider source current / A (SPICE sign) | -0.000333333333 | -0.000333333333 | 1e-08 | 通过 |
| unloaded divider output / V | 2.5 | 2.5 | 1e-05 | 通过 |
| LED loop KVL / V | 5 | 5 | 1e-05 | 通过 |
| LED model current vs independent equation / A | 0.00290536921 | 0.00290538914 | 2e-06 | 通过 |
| RC at 1 tau after edge / V | 3.16051473 | 3.16060279 | 0.002 | 通过 |
| RC at 5 tau after edge / V | 4.96630893 | 4.96631027 | 0.002 | 通过 |

教学 LED 工作点：V≈2.094631 V，I≈2.905369 mA。模型为 `.model LED_TEACH D(Is=1e-20 N=2 Rs=5)`，温度 27°C；没有指定真实料号。RC 仿真有 1μs 上升时间，与理想阶跃结果有很小差异。

原始 `.dat`、运行 `.cir`、日志、输入 SHA-256 与 report.json 在上述 build 目录中。文章中的两张曲线由该批次实际求解数据生成，不是凭公式画出的示意线。

验证边界：ngspice 批处理与自动数值核对已实测；没有实物板测试，没有提供 KiCad 原生工程，也没有以 KiCad GUI 导入/仿真结果冒充本次批处理结果。CircuitJS 是另附的可交互学习入口，未宣称其模型参数与 ngspice 教学 LED 模型完全一致。
