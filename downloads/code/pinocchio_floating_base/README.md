# Pinocchio 浮动基教学自检

对应专题：`/knowledge/robotics/pinocchio/`，第 03 篇说明各项数值检查的意义。

第 04 篇补充完整 C++ 工程；第 05、06 篇分别深入接触/质心与导数/线性化。

## 固定基线

- Pinocchio **3.8.0**，不是自动跟随最新版。
- 官方 tag：<https://github.com/stack-of-tasks/pinocchio/tree/v3.8.0>
- 源码提交：`655877b314baed68c7e2d4dd56b0a0200bb9f98e`。
- Python 模块名 `pinocchio`；官方 PyPI 项目名 `pin`，见官方 README。
- 模型由脚本手工构建：一个 free-flyer、两个转动关节、一个工具 Frame。
- 不需要私有 URDF、网格、GUI、ROS master、飞控或实体电机。

## 运行

在**已经具备 Pinocchio 3.8.0 与 NumPy 的受控 Python 环境**中，在仓库根目录执行：

```bash
python3 source/downloads/code/pinocchio_floating_base/check_floating_base.py
```

下载单个脚本到其他位置后，也可以在该目录执行 `python3 check_floating_base.py`。

脚本默认检查版本，打印 JSON 结果（包括运行时版本、CPU 架构、关节索引与 8 组检查）；失败返回非零退出码。不要通过改变期望版本来掩盖不同版本的行为差异。

## C++ 配套工程

将 `CMakeLists.txt` 和 `floating_base_demo.cpp` 放在同一目录。它们不安装或下载任何依赖；在**已声明并具备 Pinocchio 3.8.0 C++ SDK、Eigen、CMake 与编译器的开发容器**中，从仓库根目录执行：

```bash
cmake -S source/downloads/code/pinocchio_floating_base \
  -B /tmp/pinocchio-notes-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/pinocchio-notes-build --parallel 2
ctest --test-dir /tmp/pinocchio-notes-build --output-on-failure
/tmp/pinocchio-notes-build/floating_base_demo
```

独立下载后，将 `-S` 参数换成这两个文件所在的目录。SDK 安装在自定义前缀时，显式设置 `CMAKE_PREFIX_PATH`；不要根据缺失头文件报错随意混装另一个 Pinocchio 版本。

CMake 使用 `find_package(pinocchio 3.8.0 EXACT REQUIRED CONFIG)` 和导出的 `pinocchio::pinocchio` target，传递依赖由 SDK 提供。配置成功不等于已编译；编译成功不等于测试通过。

C++ 程序使用与 Python 相同的质量、COM、中心惯量和关节几何，但选择另一组固定的 `q/v/a`，不要求两者输出逐数字相同。它打印版本、关节索引、质量矩阵特征值和每项残差，失败返回 1。其输出是可读文本，**不是 Python 脚本的 JSON 协议**。阈值是待运行验证的固定小模型教学阈值，不是实机精度指标。

程序中的特征值分解、日志输出与有限差分是离线审计步骤；虽然复用了具名 `Data`，并不声称适合直接放进实时控制线程。

## 验证边界（2026-09-07）

当前交付包含固定版本源码核对、Python 语法与静态发布检查；**尚未在安装 Pinocchio 的环境中执行数值自检，也未实际编译 C++ 示例**。未向现有四套 Docker 环境添加依赖，也没有修改宿主机全局 Python。不要把源码审查、语法检查、网页生成成功或预期误差阈值当成实测 PASS。

## 待办与验收

- [x] 固定 v3.8.0 来源、模型定义、下载文件、文章调用约定与数值失败条件。
- [ ] 在选定 Docker 服务中声明完整 Python/C++ SDK 依赖并记录解析版本；本示例不隐式选择或修改服务。
- [ ] 执行上面的 CMake、CTest 与 Python 命令，保存命令、日志、退出码及实际版本；任一残差超阈值先排查，不直接放宽阈值。
- [ ] 将第 05、06 篇的接触/KKT 与离散 A/B 实验做成额外回归：原 Python 8 项及本 C++ 程序**尚未覆盖**这些扩展实验。
- [ ] 在不同 CPU 架构上分别运行后，才声明该架构数值验证完成。

将来运行后应一起保留：脚本版本/哈希、Pinocchio/Python/NumPy 版本、CPU 架构、JSON 输出和退出码。新建容器环境时，应将依赖写入 Dockerfile 并记录实际解析出的版本；只固定 `pin` 主包版本不等于整个依赖环境的哈希锁定。

## 数值解释

- 输入配置来自 `neutral` 和有界切空间积分，而不是带无限平移范围的随机配置。
- `RNEA -> ABA` 是代数一致性，不是浮动基可驱动性的证明。
- 数值阈值是为固定尺度的小模型设计的回归界限，不是实机定位精度承诺。
- 配置导数通过 `integrate` 在 `nv` 维切空间做差分，不直接扰动四元数系数。
- 不同参考系下分别比较 `J @ v` 与同一参考系的 frame 速度。
- 不包含接触约束、碰撞、力矩饱和、状态估计或实机控制。

发现失败时先保留完整报错和 JSON，再检查版本、坐标约定与模型惯量；不要直接放大容差让测试变绿。
