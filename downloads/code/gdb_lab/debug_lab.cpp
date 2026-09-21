// Intentionally faulty *teaching* program. Run only in the disposable GDB lab.
// Compile with: g++ -std=c++17 -g3 -Og -fno-omit-frame-pointer -pthread
//              /lab/debug_lab.cpp -o /work/debug_lab
#include <atomic>
#include <condition_variable>
#include <cstring>
#include <mutex>
#include <stdexcept>
#include <thread>

#define NOINLINE __attribute__((noinline))

struct Account { int balance; };
Account account{100};

NOINLINE void check_output(int tick, int expected, int actual) {
    // Keep a stable source breakpoint where all three arguments are available.
    asm volatile("" : : "r"(tick), "r"(expected), "r"(actual) : "memory");
}

NOINLINE int apply_gain(int tick, int demand) {
    int output = demand * 2;
    if (tick == 3) output = -output;  // Deliberate sign bug.
    return output;
}

NOINLINE void conditional_case() {
    for (int tick = 0; tick < 6; ++tick) {
        const int demand = 10;
        const int actual = apply_gain(tick, demand);
        check_output(tick, 20, actual);
    }
}

NOINLINE void watch_checkpoint() { asm volatile("" ::: "memory"); }
NOINLINE void apply_deposit(int amount) { account.balance += amount; }
NOINLINE void buggy_fee() { account.balance = -999; }  // Wrong business write.
NOINLINE void watchpoint_case() {
    watch_checkpoint();
    apply_deposit(25);
    buggy_fee();
}

std::mutex queue_mutex;
std::condition_variable queue_ready;
std::atomic<int> waiting_workers{0};
bool release_workers = false;

NOINLINE void wait_for_job(int worker_id) {
    std::unique_lock<std::mutex> lock(queue_mutex);
    waiting_workers.fetch_add(1);
    queue_ready.wait(lock, [] { return release_workers; });
    asm volatile("" : : "r"(worker_id) : "memory");
}

NOINLINE void threads_checkpoint() { asm volatile("" ::: "memory"); }
NOINLINE void threads_case() {
    std::thread sensor(wait_for_job, 1);
    std::thread planner(wait_for_job, 2);
    while (waiting_workers.load() != 2) std::this_thread::yield();
    // Acquiring the shared mutex ensures both workers released it in wait().
    { std::lock_guard<std::mutex> lock(queue_mutex); threads_checkpoint(); }
    // Deliberately missing notification: join() would hang, without random races.
    // This demonstrates blocked workers, not proof of a lock-order deadlock.
    sensor.join();
    planner.join();
}

NOINLINE int parse_duration(int seconds) {
    if (seconds < 0) throw std::runtime_error("negative trajectory duration");
    return seconds;
}

NOINLINE void exception_case() {
    try { (void)parse_duration(-1); }
    catch (const std::runtime_error&) { /* Application hides the useful origin. */ }
}

NOINLINE void store_target(int* target, int command) { *target = command; }
NOINLINE void core_case() { store_target(nullptr, 47); }

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    if (std::strcmp(argv[1], "conditional") == 0) conditional_case();
    else if (std::strcmp(argv[1], "watchpoint") == 0) watchpoint_case();
    else if (std::strcmp(argv[1], "threads") == 0) threads_case();
    else if (std::strcmp(argv[1], "exception") == 0) exception_case();
    else if (std::strcmp(argv[1], "core") == 0) core_case();
    else return 2;
    return 0;
}
