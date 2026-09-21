// No calls or syscalls inside the recorded range: deliberately architecture-small.
volatile int counter = 0;
__attribute__((noinline)) void reverse_begin() { asm volatile("" ::: "memory"); }
__attribute__((noinline)) void reverse_end() { asm volatile("" ::: "memory"); }
int main() {
    reverse_begin();
    counter = 1;
    counter = 2;
    reverse_end();
    return 0;
}
