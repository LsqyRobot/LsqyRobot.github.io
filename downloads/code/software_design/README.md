# 程序设计系列：完整 C++ 示例

九个独立的小程序，与程序设计 00–05 正文中的完整程序逐字对应。均只使用内存中的模拟数据，不连接设备，不执行真实机器人控制，不承诺硬实时或线程安全。

## 标准与文件

| 文章 | 完整程序 | 编译标准 |
| --- | --- | --- |
| 00 职责、组合与所有权 | composition.cpp | C++17 |
| 01 工厂的三种含义 | simple_factory.cpp, factory_method.cpp, abstract_factory.cpp | C++17 |
| 02 Strategy | strategy_runtime.cpp, strategy_values.cpp | C++17 |
| 03 C++17 | cpp17_values.cpp | C++17 |
| 04 C++20 | cpp20_contracts.cpp | C++20 |
| 05 C++23 | cpp23_expected.cpp | C++23 |

例如在下载目录运行：

```bash
g++ -std=c++17 -Wall -Wextra -Werror -pedantic composition.cpp -o composition
./composition
g++ -std=c++20 -Wall -Wextra -Werror -pedantic cpp20_contracts.cpp -o cpp20_contracts
./cpp20_contracts
g++ -std=c++23 -Wall -Wextra -Werror -pedantic cpp23_expected.cpp -o cpp23_expected
./cpp23_expected
```

完整输出由同目录 examples.json 记录，文章同时展示可读版本。本次本地验证使用 GCC 14.2.0 和 libstdc++ 14；不能据此断言所有编译器、所有标准库组合均支持这些特性。C++20/23 示例有相关特性宏检查，C++23 expected 的 monadic 操作不满足宏值时使用显式分支实现相同流程。

01–02 的 unique_ptr/std::function/lambda 起于 C++11，make_unique 起于 C++14；统一以 C++17 编译不表示它们是 C++17 新增语法。实例中的整数统计只覆盖小型固定数据，不是面向无限输入的防溢出实现。

## 仓库内的回归验证

```bash
npm run build
node --test tools/test-software-design.mjs
```

验证专题导航、六篇文章路由和本地链接、下载文件原样发布、正文源码一致性，以及九个程序按对应标准编译运行、输出与文章相符。可设置 CXX 选择另一套编译器；语言标准选项仍需配套标准库支持。

旧工厂/策略文章保留原地址，未列入这九个受验证的程序。
