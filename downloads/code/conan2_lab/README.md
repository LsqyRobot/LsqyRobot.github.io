# Conan 2.15.0：本地库、消费端与锁文件

这是 Conan 笔记的可下载教学源码。包叫 `mymath/1.0`，只有本地 C++ 文件，没有第三方 Conan 依赖。自动实验会另外创建 1.1 和一个修改后的 1.0 recipe revision，以实际展示版本选择与锁文件约束。

## 从仓库复跑

需要完整站点仓库和运行中的 Docker。在仓库根目录执行：

```bash
bash docker/conan-lab/run.sh build
bash docker/conan-lab/run.sh test
bash docker/conan-lab/run.sh snapshot
```

仅下载本目录不包含 Docker launcher；镜像配置与操作说明在仓库 `docker/conan-lab/`。宿主不用安装 Conan、CMake、Python 包或编译器。创建镜像需要下载系统与 Python 工具依赖；实际实验容器断网，只使用本地包。

| 文件 | 学习内容 |
| --- | --- |
| `mymath/conanfile.py` | settings/options、源码导出、`cmake_layout`、构建与打包、消费信息 |
| `mymath/CMakeLists.txt` | 普通 CMake 库目标与 install 规则 |
| `mymath/include/mymath.h`、`mymath/src/mymath.cpp` | 本地函数及版本／构建类型标识 |
| `mymath/test_package/` | 针对已打包库的消费测试；Release 也执行显式数值检查 |
| `consumer/conanfile.py` | 范围依赖、`CMakeToolchain`／`CMakeDeps` |
| `consumer/CMakeLists.txt` | `find_package` 与 imported target，不引用库源码路径 |
| `run_lab.py` | 隔离 cache、执行命令、解析 JSON 图、正反例断言与真实证据 |
| `recorded-summary.json`、`recorded-transcript.txt` | 通过实测后发布的记录；不是模拟输出 |
| `recorded-manual-summary.json`、`recorded-manual-transcript.txt` | 正文手动命令的独立实测记录，不替换主实验的 24 项检查 |

## 锁住了什么

原锁文件记录 `mymath/1.0#<RREV>`。缓存新增 1.1 或新的 1.0 RREV 后，显式使用原锁仍消费旧的依赖版本和 recipe revision。相同锁可以搭配不同配置，因此 Release 和 Debug 选择不同 package ID。

锁文件不保证对应二进制已经存在；缺少 RelWithDebInfo 包时，`conan install ... --build=never` 必须失败。实验不会偷偷改成 `--build=missing` 去掩盖这个结果。锁文件也不能替代 profile、工具链、sysroot、环境、二进制制品记录与目标机验收。

## 读日志与手动试验

`recorded-transcript.txt` 按标签保存完整 stdout/stderr 和每条命令退出码。`recorded-summary.json` 的 `checks` 是真实断言，`identities` 保留版本、RREV、package ID、PREV 和 settings；具体哈希以那次执行结果为准，不要把示例哈希复制成自己的固定配置。

自动 runner 把源码复制到临时目录，再创建全新的 `CONAN_HOME`，不会写宿主的 `.conan2`。默认 remotes 从这个私有缓存移除，解析命令带 `--no-remote`。所有编译／消费都发生在 Docker 内；完整 cache 与 ELF 随容器销毁，仅文本证据保留在 `build/conan-lab`。

2026-09-09 的 ARM64 Linux 原生实测中，主实验通过 24 项检查；正文手动流程独立通过 15 项检查。后者确认 `conan build consumer -of out/consumer-release` 的产物为 `out/consumer-release/build/Release/robot-consumer`，并实测了 Linux 共享库 `test_package`。它只查询 `conan upload --help` 的参数，没有执行 upload。

复跑独立检查：先执行 `bash docker/conan-lab/run.sh shell`，再在容器内执行 `python3 -B /contract/check_manual.py`；可用 `python3 -B /contract/check_manual.py --verify` 校验该次证据。自动主实验显式使用 `compiler.cppstd=17`，手动流程保留检测 profile 的 `gnu17`，所以两次 package ID 不必相同；这不是锁文件失效。

本轮不验证 ARM 交叉编译、目标板运行、远端登录/上传/下载或生产发布。即使记录中的架构为 `aarch64`，它也表示 ARM64 Linux 原生编译，不表示高通板或交叉工具链已通过验收。

官方参考：[Conan 2.15 发布记录](https://docs.conan.io/2.15/changelog.html)、[创建软件包](https://docs.conan.io/2.15/tutorial/creating_packages/create_your_first_package.html)、[锁文件](https://docs.conan.io/2.15/tutorial/versioning/lockfiles.html)。这些版本文档用于解释本实验，不把固定的 2.15.0 标成最新版本。
