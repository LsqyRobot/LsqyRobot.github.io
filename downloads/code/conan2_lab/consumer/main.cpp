// SPDX-License-Identifier: MIT
#include "mymath.h"
#include <iostream>

int main() {
    if (mymath::add(2, 3) != 5) {
        return 1;
    }
    std::cout << "consumer: sum=5; version=" << mymath::version()
              << "; build_type=" << mymath::build_type() << '\n';
    return 0;
}
