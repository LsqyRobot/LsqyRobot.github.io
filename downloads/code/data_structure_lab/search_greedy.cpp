// C++17: divide and conquer, backtracking, and interval scheduling.
#include <algorithm>
#include <cassert>
#include <iostream>
#include <random>
#include <stdexcept>
#include <vector>

long long merge_count(std::vector<int>& a, std::vector<int>& temp, std::size_t lo, std::size_t hi) {
    if (hi - lo <= 1) return 0;
    const auto mid = lo + (hi - lo) / 2;
    auto count = merge_count(a, temp, lo, mid) + merge_count(a, temp, mid, hi);
    std::size_t i = lo, j = mid, out = lo;
    while (i < mid && j < hi) {
        if (a[i] <= a[j]) temp[out++] = a[i++];
        else { temp[out++] = a[j++]; count += static_cast<long long>(mid - i); }
    }
    while (i < mid) temp[out++] = a[i++];
    while (j < hi) temp[out++] = a[j++];
    std::copy(temp.begin() + static_cast<std::ptrdiff_t>(lo),
              temp.begin() + static_cast<std::ptrdiff_t>(hi), a.begin() + static_cast<std::ptrdiff_t>(lo));
    return count;
}
long long sort_and_count(std::vector<int>& a) {
    if (a.size() > 100000) throw std::length_error("at most 100000 values");
    std::vector<int> temp(a.size());
    return merge_count(a, temp, 0, a.size());
}
void permute(const std::vector<int>& a, std::vector<bool>& used, std::vector<int>& path,
             std::vector<std::vector<int>>& result) {
    if (path.size() == a.size()) { result.push_back(path); return; }
    for (std::size_t i = 0; i < a.size(); ++i) {
        if (used[i]) continue;
        if (i > 0 && a[i] == a[i - 1] && !used[i - 1]) continue;
        used[i] = true; path.push_back(a[i]);
        permute(a, used, path, result);
        path.pop_back(); used[i] = false;
    }
}
std::vector<std::vector<int>> unique_permutations(std::vector<int> a) {
    if (a.size() > 9) throw std::length_error("enumeration limited to 9 values");
    std::sort(a.begin(), a.end());
    std::vector<bool> used(a.size(), false);
    std::vector<int> path;
    std::vector<std::vector<int>> result;
    permute(a, used, path, result);
    return result;
}
struct Interval { int start, finish; };
std::vector<Interval> schedule(std::vector<Interval> intervals) {
    for (const auto& x : intervals)
        if (x.finish <= x.start) throw std::invalid_argument("intervals must have positive duration");
    std::sort(intervals.begin(), intervals.end(), [](auto a, auto b) {
        return a.finish != b.finish ? a.finish < b.finish : a.start < b.start;
    });
    std::vector<Interval> selected;
    for (const auto& x : intervals)
        if (selected.empty() || x.start >= selected.back().finish) selected.push_back(x);
    return selected;
}
std::size_t brute_schedule(const std::vector<Interval>& intervals) {
    std::size_t best = 0;
    for (unsigned mask = 0; mask < (1u << intervals.size()); ++mask) {
        std::size_t count = 0;
        bool valid = true;
        for (std::size_t i = 0; i < intervals.size(); ++i) if (mask & (1u << i)) {
            ++count;
            for (std::size_t j = 0; j < i; ++j) if (mask & (1u << j)) {
                if (!(intervals[i].finish <= intervals[j].start || intervals[j].finish <= intervals[i].start))
                    valid = false;
            }
        }
        if (valid) best = std::max(best, count);
    }
    return best;
}
int main() {
    std::vector<int> sample{3, 1, 2, 1};
    assert(sort_and_count(sample) == 4);
    assert((sample == std::vector<int>{1, 1, 2, 3}));
    assert((unique_permutations({1, 1, 2}) == std::vector<std::vector<int>>{{1, 1, 2}, {1, 2, 1}, {2, 1, 1}}));
    assert(unique_permutations({}).size() == 1); // The empty permutation is one valid result.
    assert(schedule({}).empty());
    assert(schedule({{0, 3}, {2, 4}, {3, 5}, {5, 7}, {0, 8}}).size() == 3);
    bool rejected = false;
    try { schedule({{1, 1}}); } catch (const std::invalid_argument&) { rejected = true; }
    assert(rejected);
    std::mt19937 generator(20261013);
    for (int trial = 0; trial < 1800; ++trial) {
        std::vector<int> a(generator() % 8);
        for (auto& x : a) x = static_cast<int>(generator() % 5) - 2;
        long long inversions = 0;
        for (std::size_t i = 0; i < a.size(); ++i)
            for (std::size_t j = i + 1; j < a.size(); ++j) inversions += a[i] > a[j];
        auto sorted = a;
        std::stable_sort(sorted.begin(), sorted.end());
        assert(sort_and_count(a) == inversions && a == sorted);
        auto permutations = unique_permutations(a);
        std::vector<std::vector<int>> expected;
        do { expected.push_back(a); } while (std::next_permutation(a.begin(), a.end()));
        assert(permutations == expected);
        std::vector<Interval> intervals(generator() % 11);
        for (auto& x : intervals) {
            x.start = static_cast<int>(generator() % 15) - 5;
            x.finish = x.start + 1 + static_cast<int>(generator() % 6);
        }
        const auto selected = schedule(intervals);
        assert(selected.size() == brute_schedule(intervals));
        for (std::size_t i = 1; i < selected.size(); ++i) assert(selected[i - 1].finish <= selected[i].start);
    }
    std::vector<int> reversed(100000);
    for (std::size_t i = 0; i < reversed.size(); ++i) reversed[i] = static_cast<int>(reversed.size() - i);
    assert(sort_and_count(reversed) == 4999950000LL);
    std::cout << "search and greedy: inversions=4, unique permutations=3, intervals=3; 1800 differential cases passed\n";
}
