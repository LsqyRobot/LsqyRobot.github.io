# GDB 进阶实战：可复现实验

这组故意带 bug 的小程序对应原站点的 GDB 笔记，使用真实 GDB 输出演示定位过程。它不是业务代码，不要在生产服务中运行故意崩溃/挂起模式。

## 获取和运行

使用**完整博客源码仓库**，而不是仅下载此 Markdown：

```bash
bash docker/gdb-lab/run.sh build
bash docker/gdb-lab/run.sh test
bash docker/gdb-lab/run.sh render
```

Dockerfile 与宿主入口在仓库 `docker/gdb-lab/`。宿主不需要安装 GCC、GDB、Python 或 Pillow；需要可用的 Docker。目录内可单独下载示例源文件，但 Docker 入口/生成器依赖完整仓库的相对路径。

自动测试产物在 `build/gdb-lab/`；如需把本次验证后的日志更新为博客下载件，额外执行 `bash docker/gdb-lab/run.sh snapshot`。旧快照不是一次新测试的替代品。

## 进入交互环境

```bash
bash docker/gdb-lab/run.sh shell
```

以下编译命令在容器中执行：

```bash
g++ -std=c++17 -g3 -Og -fno-omit-frame-pointer -pthread \
  /lab/debug_lab.cpp -o /work/debug_lab
g++ -g3 -O0 -fno-omit-frame-pointer \
  /lab/reverse_demo.cpp -o /work/reverse_demo
```

下方 `(gdb)` 是提示符说明，不是输入的一部分；每个案例开一个新的 GDB，避免断点编号和状态互相干扰。`quit` 只结束这个教学调试会话。

## 1. 条件断点

启动 `gdb --args /work/debug_lab conditional`，输入：

```text
break check_output if actual != expected
run
info args
bt 3
up
list
```

实际停止状态为 `tick=3, expected=20, actual=-20`。这定位的是第一个可观测错误结果，再沿调用者找到 `apply_gain` 的符号翻转，不是假设停下时 CPU 还在错误写入那一行。

## 2. 硬件 watchpoint

启动 `gdb --args /work/debug_lab watchpoint`：

```text
break watch_checkpoint
run
watch -l account.balance
continue
continue
bt 3
print account.balance
```

本次硬件 watchpoint 两次观测 `100→125` 和 `125→-999`，第二次定位 `buggy_fee`。这演示**错误业务写入**，不是数组越界。支持能力取决于目标、监视区域大小/对齐及硬件槽位，不能把本次成功推成无限数量的 watchpoint。

## 3. 多线程等待

启动 `gdb --args /work/debug_lab threads`：

```text
break threads_checkpoint
run
info threads
thread apply all bt 8
print waiting_workers
print release_workers
```

两个 worker 都在 `wait_for_job` 的条件变量等待，main 处于检查点，释放谓词是 false。继续运行后 main 的 `join()` 将等待，没有随机触发窗口。本例证明的是“等待条件永远未满足”，不把它冒称成锁顺序死锁的通用证明。

## 4. C++ 抛出位置

启动 `gdb --args /work/debug_lab exception`：

```text
catch throw
run
bt 4
up
info args
continue
```

本次停在 `__cxa_throw`，上一层用户函数的 `seconds=-1`。应用稍后会 catch 这个异常，单看“程序退出正常”看不出最初来源。不同 C++ 运行库可能有不同的栈包装层，需要先看 `bt` 再选择实际用户帧。

## 5. 崩溃与 core

启动 `gdb --args /work/debug_lab core`：

```text
run
bt 3
info args
generate-core-file /work/out/crash.core
kill
core-file /work/out/crash.core
bt 3
info args
```

`store_target(nullptr, 47)` 故意产生 SIGSEGV。本次保存并重载后仍能看到 `target=0x0, command=47`。交互执行 `kill` 可能询问确认；这是结束你刚启动的故障示例，不是对宿主其他进程发信号。

自动测试会把**同一 ELF**保存在 `/work/out/debug_lab`。在新容器 shell 里先 `cp /work/out/debug_lab /work/debug_lab` 恢复 core 记录的原始路径，再用 `gdb /work/debug_lab /work/out/crash.core` 重载。直接指定 `/work/out/debug_lab` 也已验证能读回参数，但可能提示找不到原路径的文件映射。交互自行编译的 `/work/debug_lab` 是临时文件，若想跨容器重载，请先保存对应二进制并明确管理自己的 core，不要任意覆盖自动验证产生的配套文件。

## 6. GDB Python 过滤

启动 `gdb --args /work/debug_lab conditional`：

```text
source /lab/python_breakpoint.py
run
info args
bt 3
```

`gdb.Breakpoint.stop()` 读取参数，仅在 `actual < 0` 时停止；本次实际 `tick=3, actual=-20`。脚本解释器是 GDB 内嵌 Python，不是用宿主 `python python_breakpoint.py` 执行。

## 7. 反向执行能力探测

启动 `gdb /work/reverse_demo`：

```text
break reverse_begin
break reverse_end
run
finish
record full
continue
print counter
reverse-next
print counter
```

根据当前源码位置可能需要再重复 `reverse-next`/`print counter`。本次 Linux ARM64/GDB 12.1 的简单整数示例真实从 `2` 恢复为 `1`。记录区间有意不调用 C 库、不发生系统调用；不是 `rr`、不是 Intel PT，也不代表任意 Linux 程序都能回退。自动测试只有遇到明确“不支持 target”的错误才记为 `unsupported`，其他失败会让测试失败，不能悄悄当成功。

## 下载件与证据

- `debug_lab.cpp`、`reverse_demo.cpp`：真实编译执行的源文件。
- `python_breakpoint.py`：GDB Python 断点类。
- `record_session.py`：GDB 内部执行器与 18 个语义断言。
- `run_lab.py`：编译、各会话独立进程、超时、完整 stdout 采集与 JSON 导出。
- `recorded-sessions.json`：GIF 所依据的每步真实命令和输出。
- `full-transcript.txt`：未裁剪的整轮原始输出（包含用于可靠提取的 `LAB STEP`/`LAB COMMAND` 标记）。
- `validation.json`：源码/日志 SHA、软件版本、架构、实际 UID/GID、镜像 ID 和每项断言。

GDB 12 的 `gdb.execute(to_string=True)` 不总能捕获停机通知，因此执行器把步骤边界写入原始 stdout，由外层解析边界；不是补写预想的断点输出。动画为了可读性可以截取/换行，但完整文本不依赖动画。

绝不把生产 core、密码、token 或私人业务数据当作博客素材。本次 core 与 ELF 仅放本地忽略目录，不公开下载。
