#include <cstdio>
int initialized_counter = 7;
char zero_buffer[4096];
static int local_counter = 3;
namespace demo {
int square(int value) { return value * value + local_counter; }
}
void announce() { puts("symbol lab"); }
