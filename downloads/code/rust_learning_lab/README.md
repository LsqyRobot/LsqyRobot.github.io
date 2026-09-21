# Rust learning lab

这是《Rust 系统学习笔记（一）》配套的无第三方依赖练习 crate。它把几行关节位置数据解析成 `Sample`，再计算指定关节的统计结果，用一条小链路练习所有权、借用、生命周期、`Option`、`Result`、模块和测试。

环境基线：Rust 2024 Edition，`rust-version = "1.85"`。

推荐从仓库根目录使用专用 Docker 环境，本机不需要安装 Rust：

```bash
./bin/site.sh rust-build
./bin/site.sh rust-test
./bin/site.sh rust-run
./bin/site.sh rust-example ownership
./bin/site.sh rust-example async_intro
./bin/site.sh rust-shell
```

镜像固定 Rust 1.85.1，并包含 Cargo、rustfmt 和 Clippy。源码实时挂载到容器 `/workspace`，构建与依赖缓存放在仓库根目录的 `build/rust-learning-lab/`。完整说明见 `docker/rust-learning-lab/README.md`。

如果本机已经安装 `rustup`，项目根目录的 `rust-toolchain.toml` 会选择同一个工具链，也可以直接执行：

```bash
cargo run
cargo run -- data/samples.csv front_left_hip
cargo run --example ownership
cargo run --example async_intro
cargo test --all-targets
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
```

目录与学习点：

- `src/model.rs`：拥有 `String` 的领域类型与借用字段的统计结果；
- `src/parser.rs`：`Result`、自定义错误、迭代器和单元测试；
- `src/report.rs`：共享借用、可变借用和显式生命周期；
- `src/async_intro.rs`：`Future` 的最小轮询模型；其中 `run_ready` 只用于立即完成的教学 future，不是通用 executor；
- `src/main.rs`：二进制入口、文件 I/O、`?` 和 `Option` 分支；
- `tests/telemetry_workflow.rs`：从公开 API 驱动的集成测试；
- `examples/`：可以独立运行和修改的概念练习。

建议每次只做一个改动：先写失败测试，再改实现，最后依次通过 `fmt → clippy → test`。异步网络 I/O、并发任务取消以及 C/C++ FFI 都应在这条同步核心链路稳定后再加入；不要把教学用 `run_ready` 扩展成生产执行器。
