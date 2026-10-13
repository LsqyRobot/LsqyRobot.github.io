#include <algorithm>
#include <concepts>
#include <iostream>
#include <ranges>
#include <span>
#include <vector>
#include <version>

#if !defined(__cpp_lib_span) || __cpp_lib_span < 202002L
#error "This example requires C++20 std::span."
#endif
#if !defined(__cpp_lib_ranges) || __cpp_lib_ranges < 201911L
#error "This example requires C++20 ranges."
#endif

struct Reading {
    int millimeters;
    bool present;

    int distance_mm() const { return millimeters; }
    bool healthy() const { return present && millimeters >= 0; }
};

template<class T>
concept DistanceSample = requires(const T& sample) {
    { sample.distance_mm() } -> std::same_as<int>;
    { sample.healthy() } -> std::same_as<bool>;
};

static_assert(DistanceSample<Reading>);
static_assert(!DistanceSample<int>);

template<DistanceSample T>
int total_distance(std::span<const T> samples) {
    auto distances = samples
        | std::views::filter([](const T& s) { return s.healthy(); })
        | std::views::transform([](const T& s) { return s.distance_mm(); });
    int total = 0;
    for (int millimeters : distances) {
        total += millimeters;
    }
    return total;
}

int main() {
    const std::vector<Reading> readings{
        {120, true}, {-1, false}, {230, true}, {90, true}
    };
    const std::span<const Reading> window{readings};
    std::cout << "samples=" << window.size() << '\n';
    std::cout << "total_mm=" << total_distance(window) << '\n';

    auto nearby = readings
        | std::views::filter([](const Reading& s) {
              return s.healthy() && s.distance_mm() < 200;
          })
        | std::views::transform([](const Reading& s) {
              return s.distance_mm();
          });

    std::vector<int> snapshot;
    for (int millimeters : nearby) {
        snapshot.push_back(millimeters);
    }
    std::ranges::sort(snapshot);
    std::cout << "nearby_sorted_mm=";
    for (int millimeters : snapshot) {
        std::cout << ' ' << millimeters;
    }
    std::cout << '\n';
    std::cout << "first_two_total_mm="
              << total_distance(window.first(2)) << '\n';
}
