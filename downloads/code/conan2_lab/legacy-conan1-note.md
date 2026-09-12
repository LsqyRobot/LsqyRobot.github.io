---
title: Conan 学习
date: 2026-01-12 11:50:24
tags: 
- work
- linux
thumbnail: "/img/postImg/18_CPP/logo/Conan_logo_used.jpg"
categories: CPP
---

<!-- vim-markdown-toc GFM -->

* [前言](#前言)
	* [1. Conan 基础概念](#1-conan-基础概念)
		* [什么是 Conan？](#什么是-conan)
		* [核心概念](#核心概念)
	* [2. 安装 Conan](#2-安装-conan)
		* [通过 pip 安装（推荐）](#通过-pip-安装推荐)
		* [验证安装](#验证安装)
		* [初始配置](#初始配置)
	* [3. 创建第一个简单的 C++ 项目](#3-创建第一个简单的-c-项目)
		* [项目结构](#项目结构)
		* [步骤1：创建项目目录](#步骤1创建项目目录)
		* [步骤2：创建头文件](#步骤2创建头文件)
		* [步骤3：创建实现文件](#步骤3创建实现文件)
		* [步骤4：创建 CMakeLists.txt](#步骤4创建-cmakeliststxt)
	* [4. 编写 conanfile.py（Conan 1.x 语法）](#4-编写-conanfilepyconan-1x-语法)
		* [基础版本的 conanfile.py](#基础版本的-conanfilepy)
		* [字段解释：](#字段解释)
		* [更完整的 conanfile.py（带依赖和测试）](#更完整的-conanfilepy带依赖和测试)
	* [5. 构建和打包 Conan 包（Conan 1.x）](#5-构建和打包-conan-包conan-1x)
		* [第一次构建和创建包](#第一次构建和创建包)
			* [方法1：使用 conan create（推荐）](#方法1使用-conan-create推荐)
			* [方法2：分步构建（更适合开发调试）](#方法2分步构建更适合开发调试)
		* [常用的构建选项](#常用的构建选项)
			* [构建不同配置的包](#构建不同配置的包)
			* [查看和管理包](#查看和管理包)
		* [包的引用格式（Conan 1.x）](#包的引用格式conan-1x)
		* [测试包是否工作](#测试包是否工作)
			* [test_package/conanfile.py](#test_packageconanfilepy)
			* [test_package/CMakeLists.txt](#test_packagecmakeliststxt)
			* [test_package/example.cpp](#test_packageexamplecpp)
			* [运行测试](#运行测试)
	* [6. 上传包到制品库（Conan 1.x）](#6-上传包到制品库conan-1x)
		* [配置远程仓库](#配置远程仓库)
			* [方法1：使用 JFrog Artifactory](#方法1使用-jfrog-artifactory)
			* [方法2：使用 Nexus Repository](#方法2使用-nexus-repository)
			* [方法3：使用 ConanCenter（开源包）](#方法3使用-conancenter开源包)
		* [上传包到远程仓库](#上传包到远程仓库)
			* [上传单个包](#上传单个包)
			* [上传多个包](#上传多个包)
			* [只上传源码包（recipe）](#只上传源码包recipe)
		* [从远程仓库安装包](#从远程仓库安装包)
			* [搜索远程包](#搜索远程包)
			* [安装包](#安装包)
		* [在项目中使用包](#在项目中使用包)
			* [conanfile.txt（简单方式）](#conanfiletxt简单方式)
			* [使用方法：](#使用方法)
			* [conanfile.py（高级方式）](#conanfilepy高级方式)
		* [版本管理和发布策略](#版本管理和发布策略)
			* [语义化版本控制](#语义化版本控制)
			* [版本升级](#版本升级)
			* [上传新版本](#上传新版本)
		* [权限和安全](#权限和安全)
			* [设置包的可见性](#设置包的可见性)
			* [使用 API Key 进行认证](#使用-api-key-进行认证)
	* [7. 实际示例：可执行文件和动态库打包](#7-实际示例可执行文件和动态库打包)
		* [示例1：打包可执行文件](#示例1打包可执行文件)
			* [项目结构](#项目结构-1)
			* [可执行文件的 conanfile.py](#可执行文件的-conanfilepy)
			* [使用可执行文件包](#使用可执行文件包)
		* [示例2：打包动态链接库（.so/.dll/.dylib）](#示例2打包动态链接库sodlldylib)
			* [项目结构](#项目结构-2)
			* [动态库的 conanfile.py](#动态库的-conanfilepy)
		* [示例3：混合包（库 + 工具）](#示例3混合包库--工具)
			* [conanfile.py](#conanfilepy)
		* [示例4：Header-Only 库](#示例4header-only-库)
			* [conanfile.py](#conanfilepy-1)
		* [实用技巧和最佳实践](#实用技巧和最佳实践)
			* [1. 自动检测系统库依赖](#1-自动检测系统库依赖)
			* [2. 条件性依赖](#2-条件性依赖)
			* [3. 多配置支持](#3-多配置支持)
			* [4. 验证和测试](#4-验证和测试)
	* [8. 总结](#8-总结)
		* [核心技能](#核心技能)
		* [实际应用场景](#实际应用场景)
		* [下一步建议](#下一步建议)
		* [常用命令速查](#常用命令速查)
		* [参考资源](#参考资源)

<!-- vim-markdown-toc -->

# 前言

Conan 是一个现代化的 C/C++ 包管理器，可以帮助我们轻松管理项目依赖，创建和分发自己的软件包。

## 1. Conan 基础概念

### 什么是 Conan？
- **包管理器**：类似于 Python 的 pip、Node.js 的 npm
- **跨平台**：支持 Windows、Linux、macOS
- **多编译器**：支持 GCC、Clang、Visual Studio 等
- **二进制管理**：可以分发预编译的二进制文件，避免每次都重新编译

### 核心概念
- **Package（包）**：包含库文件、头文件、可执行文件的软件包
- **Recipe（配方）**：描述如何构建包的 `conanfile.py` 文件
- **Reference（引用）**：包的唯一标识，格式为 `name/version@user/channel`
- **Remote（远程仓库）**：存储包的服务器

## 2. 安装 Conan

### 通过 pip 安装（推荐）
```bash
pip install conan
```

### 验证安装
```bash
conan --version
```

### 初始配置
```bash
# 检测编译器配置
conan profile detect --force

# 查看配置
conan profile show default
```

## 3. 创建第一个简单的 C++ 项目

让我们从一个简单的数学库开始，演示如何创建和打包一个 C++ 项目。

### 项目结构
```
mymath/
├── conanfile.py           # Conan 配方文件
├── include/
│   └── mymath/
│       └── calculator.h   # 头文件
├── src/
│   └── calculator.cpp     # 实现文件
└── CMakeLists.txt         # 构建配置
```

### 步骤1：创建项目目录
```bash
mkdir mymath && cd mymath
```

### 步骤2：创建头文件
**include/mymath/calculator.h**
```cpp
#pragma once

namespace mymath {
    class Calculator {
    public:
        static int add(int a, int b);
        static int subtract(int a, int b);
        static int multiply(int a, int b);
        static double divide(int a, int b);
    };
}
```

### 步骤3：创建实现文件
**src/calculator.cpp**
```cpp
#include "mymath/calculator.h"
#include <stdexcept>

namespace mymath {
    int Calculator::add(int a, int b) {
        return a + b;
    }

    int Calculator::subtract(int a, int b) {
        return a - b;
    }

    int Calculator::multiply(int a, int b) {
        return a * b;
    }

    double Calculator::divide(int a, int b) {
        if (b == 0) {
            throw std::runtime_error("Division by zero!");
        }
        return static_cast<double>(a) / b;
    }
}
```

### 步骤4：创建 CMakeLists.txt
```cmake
cmake_minimum_required(VERSION 3.15)
project(mymath)

# 创建库
add_library(mymath src/calculator.cpp)

# 设置包含目录
target_include_directories(mymath PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

# 安装规则
install(TARGETS mymath DESTINATION lib)
install(DIRECTORY include/ DESTINATION include)
```

## 4. 编写 conanfile.py（Conan 1.x 语法）

`conanfile.py` 是 Conan 的核心配置文件，定义了包的信息和构建方式。

### 基础版本的 conanfile.py
```python
from conans import ConanFile, CMake, tools


class MymathConan(ConanFile):
    name = "mymath"
    version = "1.0"
    license = "MIT"
    author = "Your Name <your.email@example.com>"
    url = "https://github.com/yourname/mymath"
    description = "A simple math library for demonstration"
    topics = ("math", "calculator", "demo")

    settings = "os", "compiler", "build_type", "arch"
    options = {"shared": [True, False]}
    default_options = {"shared": False}

    generators = "cmake"
    exports_sources = "src/*", "include/*", "CMakeLists.txt"

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.install()

    def package_info(self):
        self.cpp_info.libs = ["mymath"]
        self.cpp_info.includedirs = ["include"]
```

### 字段解释：

- **基本信息**：
  - `name`: 包名
  - `version`: 版本号
  - `license`: 许可证
  - `description`: 包描述

- **设置和选项**：
  - `settings`: 影响二进制兼容性的设置（操作系统、编译器、构建类型、架构）
  - `options`: 用户可选择的编译选项
  - `default_options`: 默认选项值

- **构建相关**：
  - `generators`: 生成构建系统需要的文件
  - `exports_sources`: 导出源码文件

- **方法**：
  - `build()`: 如何构建项目
  - `package()`: 如何打包文件
  - `package_info()`: 包的使用信息

### 更完整的 conanfile.py（带依赖和测试）
```python
from conans import ConanFile, CMake, tools
import os


class MymathConan(ConanFile):
    name = "mymath"
    version = "1.0"
    license = "MIT"
    author = "Your Name <your.email@example.com>"
    url = "https://github.com/yourname/mymath"
    description = "A simple math library for demonstration"
    topics = ("math", "calculator", "demo")

    settings = "os", "compiler", "build_type", "arch"
    options = {
        "shared": [True, False],
        "fPIC": [True, False]
    }
    default_options = {
        "shared": False,
        "fPIC": True
    }

    generators = "cmake"
    exports_sources = "src/*", "include/*", "CMakeLists.txt"

    def config_options(self):
        if self.settings.os == "Windows":
            del self.options.fPIC

    def configure(self):
        if self.options.shared:
            del self.options.fPIC

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.install()

        # 复制许可证文件
        self.copy("LICENSE", dst="licenses", src=".")

    def package_info(self):
        self.cpp_info.libs = ["mymath"]
        self.cpp_info.includedirs = ["include"]

        # 如果是静态库，可能需要链接数学库
        if not self.options.shared:
            self.cpp_info.system_libs = ["m"]  # Linux/macOS 数学库
```

## 5. 构建和打包 Conan 包（Conan 1.x）

现在让我们使用 Conan 1.x 的命令来构建和打包我们的库。

### 第一次构建和创建包

#### 方法1：使用 conan create（推荐）
```bash
# 在项目根目录（包含 conanfile.py 的目录）执行
conan create . mycompany/stable

# 查看创建的包
conan search mymath/1.0@mycompany/stable
```

#### 方法2：分步构建（更适合开发调试）
```bash
# 1. 安装依赖并生成构建文件
mkdir build && cd build
conan install .. --build missing

# 2. 构建项目
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .

# 3. 回到项目根目录并导出包
cd ..
conan export-pkg . mymath/1.0@mycompany/stable -s build_type=Release
```

### 常用的构建选项

#### 构建不同配置的包
```bash
# 构建 Debug 版本
conan create . mycompany/stable -s build_type=Debug

# 构建共享库版本
conan create . mycompany/stable -o mymath:shared=True

# 构建特定架构
conan create . mycompany/stable -s arch=x86

# 组合多个选项
conan create . mycompany/stable -s build_type=Release -o mymath:shared=True
```

#### 查看和管理包
```bash
# 查看本地包列表
conan search

# 查看特定包的详细信息
conan search mymath/1.0@mycompany/stable

# 查看包的详细信息
conan info mymath/1.0@mycompany/stable

# 删除包
conan remove mymath/1.0@mycompany/stable

# 查看包的文件结构
conan info mymath/1.0@mycompany/stable --paths
```

### 包的引用格式（Conan 1.x）

在 Conan 1.x 中，包的引用格式为：`name/version@user/channel`

- **name**: 包名（如：mymath）
- **version**: 版本号（如：1.0）
- **user**: 用户或组织名（如：mycompany）
- **channel**: 渠道名（如：stable, testing）

### 测试包是否工作

创建一个测试项目来验证我们的包：

#### test_package/conanfile.py
```python
from conans import ConanFile, CMake, tools
import os


class TestPackageConan(ConanFile):
    settings = "os", "compiler", "build_type", "arch"
    generators = "cmake"

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def imports(self):
        self.copy("*.dll", dst="bin", src="bin")  # Windows
        self.copy("*.dylib*", dst="bin", src="lib")  # macOS

    def test(self):
        if not tools.cross_building(self.settings):
            os.chdir("bin")
            self.run(".%sexample" % os.sep)
```

#### test_package/CMakeLists.txt
```cmake
cmake_minimum_required(VERSION 3.15)
project(PackageTest CXX)

include(${CMAKE_BINARY_DIR}/conanbuildinfo.cmake)
conan_basic_setup()

add_executable(example example.cpp)
target_link_libraries(example ${CONAN_LIBS})
```

#### test_package/example.cpp
```cpp
#include <iostream>
#include "mymath/calculator.h"

int main() {
    std::cout << "Testing mymath library:" << std::endl;
    std::cout << "5 + 3 = " << mymath::Calculator::add(5, 3) << std::endl;
    std::cout << "10 - 4 = " << mymath::Calculator::subtract(10, 4) << std::endl;
    std::cout << "6 * 7 = " << mymath::Calculator::multiply(6, 7) << std::endl;
    std::cout << "15 / 3 = " << mymath::Calculator::divide(15, 3) << std::endl;
    return 0;
}
```

#### 运行测试
```bash
# 自动测试包（如果存在 test_package）
conan create . mycompany/stable

# 或者单独运行测试
conan test test_package mymath/1.0@mycompany/stable
```

## 6. 上传包到制品库（Conan 1.x）

创建好包之后，我们需要把它上传到制品库，供团队其他成员使用。

### 配置远程仓库

#### 方法1：使用 JFrog Artifactory
```bash
# 添加远程仓库
conan remote add artifactory https://your-company.jfrog.io/artifactory/api/conan/conan-local

# 查看远程仓库列表
conan remote list

# 设置认证信息
conan user -p <password> -r artifactory <username>
```

#### 方法2：使用 Nexus Repository
```bash
# 添加 Nexus 仓库
conan remote add nexus https://your-nexus.com/repository/conan-hosted/

# 认证
conan user -p <password> -r nexus <username>
```

#### 方法3：使用 ConanCenter（开源包）
```bash
# ConanCenter 是官方的公共仓库
conan remote add conancenter https://center.conan.io

# 查看所有可用的远程仓库
conan remote list
```

### 上传包到远程仓库

#### 上传单个包
```bash
# 上传包到指定远程仓库
conan upload mymath/1.0@mycompany/stable --all -r artifactory

# --all 参数会上传所有的二进制文件
# -r 指定远程仓库名称
```

#### 上传多个包
```bash
# 上传所有本地包
conan upload "*" --all -r artifactory --confirm

# 上传特定模式的包
conan upload "mymath/*" --all -r artifactory --confirm
```

#### 只上传源码包（recipe）
```bash
# 只上传 conanfile.py 和源码，不上传二进制文件
conan upload mymath/1.0@mycompany/stable -r artifactory
```

### 从远程仓库安装包

#### 搜索远程包
```bash
# 搜索远程仓库中的包
conan search mymath* -r artifactory

# 搜索所有远程仓库
conan search mymath* -r all
```

#### 安装包
```bash
# 安装包到本地
conan install mymath/1.0@mycompany/stable -r artifactory

# 安装并构建缺失的依赖
conan install mymath/1.0@mycompany/stable --build missing -r artifactory
```

### 在项目中使用包

#### conanfile.txt（简单方式）
```txt
[requires]
mymath/1.0@mycompany/stable

[generators]
cmake

[options]
mymath:shared=False

[imports]
bin, *.dll -> ./bin
lib, *.dylib* -> ./lib
```

#### 使用方法：
```bash
mkdir build && cd build
conan install .. --build missing
cmake ..
cmake --build .
```

#### conanfile.py（高级方式）
```python
from conans import ConanFile, CMake, tools


class MyProjectConan(ConanFile):
    settings = "os", "compiler", "build_type", "arch"
    requires = "mymath/1.0@mycompany/stable"
    generators = "cmake"

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def imports(self):
        self.copy("*.dll", dst="bin", src="bin")
        self.copy("*.dylib*", dst="bin", src="lib")
```

### 版本管理和发布策略

#### 语义化版本控制
```bash
# 开发版本
conan create . mycompany/testing  # 1.0@mycompany/testing

# 预发布版本
conan create . mycompany/beta     # 1.0@mycompany/beta

# 正式发布版本
conan create . mycompany/stable   # 1.0@mycompany/stable
```

#### 版本升级
```python
# 在 conanfile.py 中更新版本号
class MymathConan(ConanFile):
    name = "mymath"
    version = "1.1"  # 更新版本号
    # ...
```

#### 上传新版本
```bash
conan create . mycompany/stable
conan upload mymath/1.1@mycompany/stable --all -r artifactory
```

### 权限和安全

#### 设置包的可见性
```bash
# 设置包的权限（具体命令取决于制品库类型）
# 在 JFrog Artifactory 中通常通过 Web UI 管理权限

# 查看包的权限信息
conan info mymath/1.0@mycompany/stable -r artifactory
```

#### 使用 API Key 进行认证
```bash
# 使用 API Key 而不是密码
conan user -p <api-key> -r artifactory <username>

# 或者设置环境变量
export CONAN_USER_ARTIFACTORY=<username>
export CONAN_PASSWORD_ARTIFACTORY=<api-key>
```

## 7. 实际示例：可执行文件和动态库打包

现在让我们通过更实际的例子来学习如何打包不同类型的软件包。

### 示例1：打包可执行文件

假设你有一个编译好的命令行工具，想要打包分发。

#### 项目结构
```
mytool/
├── conanfile.py
├── src/
│   └── main.cpp
├── CMakeLists.txt
└── bin/              # 预编译的可执行文件
    ├── mytool        # Linux 可执行文件
    ├── mytool.exe    # Windows 可执行文件
    └── mytool.app    # macOS 应用程序
```

#### 可执行文件的 conanfile.py
```python
from conans import ConanFile, tools
import os


class MytoolConan(ConanFile):
    name = "mytool"
    version = "2.0"
    license = "MIT"
    description = "Command line utility for processing data"

    settings = "os", "arch"  # 可执行文件通常不需要 compiler 和 build_type

    # 导出预编译的二进制文件
    exports = "bin/*"

    def package(self):
        # 复制可执行文件到包中
        if self.settings.os == "Windows":
            self.copy("*.exe", dst="bin", src="bin")
        elif self.settings.os == "Macos":
            self.copy("*.app", dst="bin", src="bin")
        else:  # Linux
            self.copy("mytool", dst="bin", src="bin")

        # 设置可执行权限（Linux/macOS）
        if self.settings.os != "Windows":
            exe_path = os.path.join(self.package_folder, "bin", "mytool")
            if os.path.exists(exe_path):
                os.chmod(exe_path, 0o755)

    def package_info(self):
        # 设置可执行文件的路径
        self.cpp_info.bin_paths = ["bin"]

        # 设置环境变量
        self.env_info.PATH.append(os.path.join(self.package_folder, "bin"))
```

#### 使用可执行文件包
```python
# consumer_conanfile.py
from conans import ConanFile


class ConsumerConan(ConanFile):
    requires = "mytool/2.0@mycompany/stable"

    def imports(self):
        # 导入可执行文件到项目的 bin 目录
        self.copy("*", dst="bin", src="bin")
```

### 示例2：打包动态链接库（.so/.dll/.dylib）

#### 项目结构
```
mysharedlib/
├── conanfile.py
├── include/
│   └── mysharedlib/
│       └── api.h
├── lib/
│   ├── linux/
│   │   └── libmysharedlib.so
│   ├── windows/
│   │   ├── mysharedlib.dll
│   │   └── mysharedlib.lib     # 导入库
│   └── macos/
│       └── libmysharedlib.dylib
└── CMakeLists.txt
```

#### 动态库的 conanfile.py
```python
from conans import ConanFile, tools
import os


class MysharedlibConan(ConanFile):
    name = "mysharedlib"
    version = "1.5"
    license = "Apache-2.0"
    description = "Shared library for data processing"

    settings = "os", "compiler", "build_type", "arch"

    exports = "include/*", "lib/*"

    def package(self):
        # 复制头文件
        self.copy("*.h", dst="include", src="include")

        # 根据平台复制动态库文件
        if self.settings.os == "Windows":
            self.copy("*.dll", dst="bin", src=f"lib/{str(self.settings.os).lower()}")
            self.copy("*.lib", dst="lib", src=f"lib/{str(self.settings.os).lower()}")
        elif self.settings.os == "Macos":
            self.copy("*.dylib", dst="lib", src="lib/macos")
        else:  # Linux
            self.copy("*.so*", dst="lib", src="lib/linux")

    def package_info(self):
        # 设置链接库
        if self.settings.os == "Windows":
            self.cpp_info.libs = ["mysharedlib"]  # .lib 文件
        else:
            self.cpp_info.libs = ["mysharedlib"]

        # 设置库文件搜索路径
        self.cpp_info.libdirs = ["lib"]

        # 设置头文件搜索路径
        self.cpp_info.includedirs = ["include"]

        # Windows 需要设置 bin 路径以找到 DLL
        if self.settings.os == "Windows":
            self.cpp_info.bin_paths = ["bin"]
```

### 示例3：混合包（库 + 工具）

有时候一个包既包含库文件又包含工具程序。

#### conanfile.py
```python
from conans import ConanFile, CMake, tools
import os


class MixedPackageConan(ConanFile):
    name = "mypackage"
    version = "3.0"
    license = "MIT"
    description = "Library with command line tools"

    settings = "os", "compiler", "build_type", "arch"
    options = {"shared": [True, False], "tools": [True, False]}
    default_options = {"shared": False, "tools": True}

    generators = "cmake"
    exports_sources = "src/*", "include/*", "tools/*", "CMakeLists.txt"

    def build(self):
        cmake = CMake(self)
        # 传递选项到 CMake
        cmake.definitions["BUILD_SHARED_LIBS"] = self.options.shared
        cmake.definitions["BUILD_TOOLS"] = self.options.tools
        cmake.configure()
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.install()

        # 根据选项安装不同的内容
        if self.options.tools:
            self.copy("*.exe", dst="bin", src="build/bin")
            self.copy("mytool", dst="bin", src="build/bin")

    def package_info(self):
        # 库文件信息
        self.cpp_info.libs = ["mypackage"]
        self.cpp_info.includedirs = ["include"]

        # 如果包含工具，设置可执行文件路径
        if self.options.tools:
            self.cpp_info.bin_paths = ["bin"]
            self.env_info.PATH.append(os.path.join(self.package_folder, "bin"))
```

### 示例4：Header-Only 库

对于只有头文件的库（如很多现代 C++ 库）：

#### conanfile.py
```python
from conans import ConanFile


class HeaderOnlyConan(ConanFile):
    name = "myheaderlib"
    version = "1.0"
    license = "MIT"
    description = "Header-only utility library"

    # Header-only 库通常不需要 settings
    # 但如果使用了 C++14/17/20 特性，可能需要 compiler 设置
    settings = "compiler"  # 只为了确保 C++ 标准兼容性

    no_copy_source = True  # 不复制源文件到构建目录
    exports_sources = "include/*"

    def package(self):
        self.copy("*.h", dst="include", src="include")
        self.copy("*.hpp", dst="include", src="include")

    def package_info(self):
        # Header-only 库不需要链接任何库
        self.cpp_info.includedirs = ["include"]

        # 如果需要特定的 C++ 标准
        if self.settings.compiler.cppstd:
            self.cpp_info.cppflags = [f"-std=c++{self.settings.compiler.cppstd}"]
```

### 实用技巧和最佳实践

#### 1. 自动检测系统库依赖
```python
def package_info(self):
    self.cpp_info.libs = ["mylib"]

    # Linux 系统库依赖
    if self.settings.os == "Linux":
        self.cpp_info.system_libs = ["pthread", "dl", "m"]
    # Windows 系统库依赖
    elif self.settings.os == "Windows":
        self.cpp_info.system_libs = ["ws2_32", "user32"]
```

#### 2. 条件性依赖
```python
def requirements(self):
    if self.options.ssl:
        self.requires("openssl/1.1.1k@")
    if self.options.compression:
        self.requires("zlib/1.2.11@")
```

#### 3. 多配置支持
```python
def configure(self):
    # 如果是共享库，移除 fPIC 选项
    if self.options.shared:
        del self.options.fPIC

    # 如果是 Release 版本，强制关闭调试符号
    if self.settings.build_type == "Release":
        self.options.debug_symbols = False
```

#### 4. 验证和测试
```python
def build(self):
    # 构建前验证
    if self.settings.os == "Windows" and self.options.shared:
        raise Exception("Windows shared library not supported in this version")

    cmake = CMake(self)
    cmake.configure()
    cmake.build()

    # 构建后测试
    if tools.cross_building(self.settings):
        self.output.info("Cross-compiling, skipping tests")
    else:
        cmake.test()
```

## 8. 总结

通过本教程，你已经学会了：

### 核心技能
1. **Conan 基础知识**：理解 Conan 的概念和工作原理
2. **环境配置**：安装和配置 Conan 1.66
3. **项目创建**：从零开始创建 C++ 项目
4. **配方编写**：编写适合 Conan 1.x 的 conanfile.py
5. **包的构建**：使用 `conan create` 和分步构建方法
6. **包的发布**：上传到各种制品库（Artifactory、Nexus）

### 实际应用场景
- **静态库打包**：传统的 C++ 静态库
- **动态库打包**：跨平台的共享库（.so/.dll/.dylib）
- **可执行文件打包**：命令行工具和应用程序
- **Header-Only 库**：现代 C++ 模板库
- **混合包**：包含库和工具的复杂包

### 下一步建议

1. **练习项目**：尝试将你现有的 C++ 项目打包为 Conan 包
2. **依赖管理**：学习如何处理复杂的依赖关系
3. **持续集成**：将 Conan 集成到你的 CI/CD 流程中
4. **版本管理**：制定合适的版本发布策略
5. **团队协作**：建立团队的包管理规范

### 常用命令速查

```bash
# 基本命令
conan --version
conan profile show default
conan search <pattern>

# 包创建和管理
conan create . <user>/<channel>
conan export-pkg . <name>/<version>@<user>/<channel>
conan upload <reference> --all -r <remote>

# 仓库管理
conan remote add <name> <url>
conan remote list
conan user -p <password> -r <remote> <username>

# 包使用
conan install <reference>
conan install .. --build missing
```

### 参考资源

- [Conan 1.x 官方文档](https://docs.conan.io/en/1.59/)
- [Conan 中心仓库](https://center.conan.io/)
- [示例项目](https://github.com/conan-io/examples)


