# Linux 工具笔记配套实验

这些源码由网站 `docker/linux-tools-lab` 中的 Ubuntu 22.04 镜像编译和执行。完整入口、隔离说明与待办在仓库的 `docker/linux-tools-lab/README.md`、`TODO.md`。

```bash
# 在完整网站仓库根目录执行；不要 sudo。
bash docker/linux-tools-lab/run.sh build
bash docker/linux-tools-lab/run.sh test
bash docker/linux-tools-lab/run.sh snapshot
bash docker/linux-tools-lab/run.sh render
```

覆盖 `ldd`、`lsof`、`ps`、`pstack`（明确标注的替代路径）、`strace`、`ipcs`、`top`、`free`、`vmstat`、`iostat`、`sar`、`readelf`、`objdump`、`nm`、`size`、`wget`、`scp`、`crontab`。

`tool_demo.cpp` 和 `demo_lib.cpp` 构成可信自建动态链接 ELF；`symbols.cpp` 提供符号和 section 样例；`run_lab.py` 自动生成输入、记录真实 stdout 并清理自己的资源。`cron_job.sh` 只验证最小环境执行，不安装调度。`verify_evidence.py` 拒绝上一次失败、源码变动或摘要不匹配的旧证据。

`recorded-sessions.json` 是 GIF 的真实命令/输出来源；`validation.json` 记录实际 package 版本、镜像 ID、架构、编译命令、源码与输出 SHA-256、每组实验断言；`full-transcript.txt` 保留完整记录。GIF 是这些输出的教学重排和节选，不是手工假造终端输出或桌面屏幕录像。

注意边界：

- 当前 Ubuntu ARM64 没有 `pstack`，用明确显示的 GNU GDB batch 命令获取全部玩具线程栈，不能声称已执行 pstack。
- 未运行 cron daemon、未安装用户表、未验证真实定时触发。当前隔离配置下 `crontab -l` 权限被拒绝是记录的一部分；`env -i` 脚本通过不代表 scheduler 通过。
- SSH 和 HTTP 仅存在于一次性容器内部 loopback；扫描 host key 后先与本次独立生成的 server 公钥比对，SSH 私钥不会进入下载目录。
- 性能指标可能是 Docker Linux VM/宿主全局视图，不是容器自身配额；每次数字自然变化，不使用固定性能阈值判定通过。
- 不对陌生 ELF 执行 `ldd`，不把演示 PID/IPC ID 用于宿主真实进程，更不要用批量 kill/ipcrm 清理生产环境。
