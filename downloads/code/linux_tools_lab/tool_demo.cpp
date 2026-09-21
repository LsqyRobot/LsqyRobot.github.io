#include <atomic>
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <mutex>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

extern "C" int demo_add(int, int);
std::mutex queue_mutex;
std::condition_variable queue_ready;
std::atomic<int> waiting_workers{0};

__attribute__((noinline)) void wait_for_job() {
    std::unique_lock<std::mutex> lock(queue_mutex);
    ++waiting_workers;
    queue_ready.wait(lock, [] { return false; });
}

int main(int argc, char** argv) {
    if (argc == 2 && std::strcmp(argv[1], "worker") == 0) {
        const int fd = open("sample.log", O_RDWR | O_CREAT | O_TRUNC, 0600);
        if (fd < 0 || write(fd, "open but unlinked\n", 18) < 0 || unlink("sample.log")) return 2;
        const int sock = socket(AF_INET, SOCK_STREAM, 0);
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = 0;
        if (sock < 0 || bind(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) || listen(sock, 1)) return 3;
        std::thread first(wait_for_job), second(wait_for_job);
        while (waiting_workers.load() != 2) std::this_thread::sleep_for(std::chrono::milliseconds(1));
        std::printf("READY pid=%d threads=3 deleted_fd=%d\n", getpid(), fd);
        std::fflush(stdout);
        for (;;) pause();
    }
    const int fd = open("sample.txt", O_RDONLY);
    if (fd < 0) return 4;
    char text[64]{};
    const auto count = read(fd, text, sizeof(text) - 1);
    close(fd);
    const int absent = open("missing.txt", O_RDONLY);
    const int missing_errno = errno;
    if (absent >= 0) close(absent);
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    std::printf("demo_add(2,3)=%d bytes=%ld missing_errno=%d\n", demo_add(2, 3), static_cast<long>(count), missing_errno);
    return absent == -1 && missing_errno == ENOENT ? 0 : 5;
}
