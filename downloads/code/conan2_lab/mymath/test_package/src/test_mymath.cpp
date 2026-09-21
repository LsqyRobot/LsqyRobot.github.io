// SPDX-License-Identifier: MIT
#include "mymath.h"
#include <iostream>

int main() {
    // An explicit check still runs when Release defines NDEBUG.
    if (mymath::add(2, 3) != 5 || mymath::add(-3, 3) != 0) {
        return 1;
    }
    std::cout << "test_package: sum=5; version=" << mymath::version()
              << "; build_type=" << mymath::build_type() << '\n';
    return 0;
}
