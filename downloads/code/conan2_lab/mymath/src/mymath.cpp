// SPDX-License-Identifier: MIT
#include "mymath.h"

namespace mymath {
int add(int left, int right) { return left + right; }
const char* version() { return MYMATH_VERSION; }
const char* build_type() { return MYMATH_BUILD_TYPE; }
}
