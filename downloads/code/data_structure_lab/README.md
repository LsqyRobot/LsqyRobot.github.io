# 数据结构与算法 C++17 实验

五个独立程序：structures.cpp、linked_list_test.cpp、stl_operations.cpp、
algorithms.cpp、optimization.cpp；链表实现位于 linked_list.hpp。

在网站仓库根目录：

```sh
./bin/site.sh algorithms-build
./bin/site.sh algorithms-test
node --test tools/test-data-algorithm-model.mjs
```

复用 docker/gdb-lab/Dockerfile 中的 Ubuntu 22.04 / GCC 环境；这里只执行普通
编译和程序，不开放调试权限。源码只读、容器无网络，以非 root 身份运行。
每个程序用 C++17、警告、断言、ASan/UBSan 编译；任何失败都会中止整次实验。
日志在 build/data-structure-lab/ 下按运行时间归档，记录镜像 ID、编译器版本和结果。

已有自己的 C++17 编译环境时，也可逐个编译。linked_list_test.cpp 需要同目录的头文件：

```sh
g++ -std=c++17 -Wall -Wextra -Wpedantic -g -O1 \
  -fsanitize=address,undefined -fno-omit-frame-pointer algorithms.cpp -o algorithms
./algorithms
```

不要加 -DNDEBUG，否则标准 assert 会被关闭。学习时修改一份副本，保留原始代码作对照。

- lower_bound 要求输入已按同一关系有序。
- DP 硬币面值为正整数，可无限使用；目标限定 0..1000000。
- Trie 是 a-z 教学实现，不是 Unicode 文本索引。
- BFS 只适用于无权图的最少边数；图端点必须合法。
- LinkedList 禁止拷贝与移动，专注唯一所有权、操作边界和迭代释放。
- 数值优化程序只演示明确选定的目标函数，不承诺任意目标都收敛。

网站入口：/knowledge/data-algorithms/
