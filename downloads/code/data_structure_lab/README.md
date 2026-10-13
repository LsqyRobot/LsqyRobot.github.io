# 数据结构与算法 C++17 实验

九个独立程序：structures.cpp、linked_list_test.cpp、stl_operations.cpp、
algorithms.cpp、sequence_algorithms.cpp、search_greedy.cpp、dynamic_programming.cpp、
graph_algorithms.cpp、optimization.cpp；链表实现位于 linked_list.hpp。

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

不要加 -DNDEBUG，否则标准 assert 会被关闭。源码内含完整示例、独立参考结果和边界断言。

- lower_bound 要求输入已按同一关系有序。
- DP 硬币面值为正整数，可无限使用；目标限定 0..1000000。
- Trie 是 a-z 教学实现，不是 Unicode 文本索引。
- BFS 只适用于无权图的最少边数；图端点必须合法。
- LinkedList 禁止拷贝与移动，专注唯一所有权、操作边界和迭代释放。
- 数值优化程序只演示明确选定的目标函数，不承诺任意目标都收敛。

网站入口：/knowledge/data-algorithms/

新增算法：

- sequence_algorithms.cpp：前缀和、差分、排序双指针、非负滑动窗口、精确和计数、答案二分。
  值绝对值不超过 1000000，n 不超过 100000；窗口/分组要求非负，完整限制见源码。
- search_greedy.cpp：归并与逆序对、重复元素排列、无权区间调度。
  排列枚举最多 9 个元素，区间必须有正持续时间，端点可以首尾相接。
- dynamic_programming.cpp：精确重量背包、严格 LIS、LCS、方案恢复与硬币计数。
  计数用 uint64_t，溢出显式报错；维度与输入限制写在对应函数中。
- graph_algorithms.cpp：非负 Dijkstra、Bellman–Ford、Kahn、Kruskal。
  有向最短路与无向生成森林的图含义不同；负环、不可达、溢出有明确状态。

2026-10-13：九个程序在声明的 Ubuntu 22.04 / GCC 11.4 镜像内通过
-Wall -Wextra -Wpedantic -Werror、断言、ASan 与 UBSan。
该记录只说明教学实现及覆盖案例通过，不代表任意输入/设备的软件认证。
