// C++17: sequence algorithms with bounded inputs and independent small-input oracles.
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <optional>
#include <random>
#include <stdexcept>
#include <unordered_map>
#include <utility>
#include <vector>

using Values = std::vector<long long>;
void validate(const Values& a, bool nonnegative = false) {
    if (a.size() > 100000) throw std::length_error("at most 100000 values");
    for (auto x : a)
        if (x < (nonnegative ? 0 : -1000000) || x > 1000000)
            throw std::invalid_argument("value outside the documented range");
}
std::vector<long long> prefix_sums(const Values& a) {
    validate(a);
    Values p(a.size() + 1, 0);
    for (std::size_t i = 0; i < a.size(); ++i) p[i + 1] = p[i] + a[i];
    return p;
}
long long range_sum(const Values& p, std::size_t l, std::size_t r) {
    if (p.empty() || l > r || r >= p.size()) throw std::out_of_range("invalid [l,r)");
    return p[r] - p[l];
}
struct Update { std::size_t left, right; long long delta; };
Values range_add(const Values& a, const std::vector<Update>& updates) {
    validate(a);
    if (updates.size() > 100000) throw std::length_error("too many updates");
    Values diff(a.size() + 1, 0), result = a;
    for (const auto& u : updates) {
        if (u.left > u.right || u.right > a.size()) throw std::out_of_range("invalid update");
        if (u.delta < -1000000 || u.delta > 1000000) throw std::invalid_argument("delta too large");
        diff[u.left] += u.delta;
        diff[u.right] -= u.delta;
    }
    long long added = 0;
    for (std::size_t i = 0; i < a.size(); ++i) { added += diff[i]; result[i] += added; }
    return result;
}
std::optional<std::pair<std::size_t, std::size_t>> two_sum_sorted(const Values& a, long long target) {
    validate(a);
    if (!std::is_sorted(a.begin(), a.end())) throw std::invalid_argument("input must be sorted");
    if (a.size() < 2) return std::nullopt;
    std::size_t left = 0, right = a.size() - 1;
    while (left < right) {
        const auto sum = a[left] + a[right];
        if (sum == target) return std::pair{left, right};
        if (sum < target) ++left; else --right;
    }
    return std::nullopt;
}
std::size_t min_window(const Values& a, long long target) {
    validate(a, true);
    if (target <= 0) throw std::invalid_argument("target must be positive");
    std::size_t left = 0, best = a.size() + 1;
    long long sum = 0;
    for (std::size_t right = 0; right < a.size(); ++right) {
        sum += a[right];
        while (sum >= target) {
            best = std::min(best, right - left + 1);
            sum -= a[left++];
        }
    }
    return best == a.size() + 1 ? 0 : best;
}
long long count_exact_sum(const Values& a, long long target) {
    validate(a);
    if (target < -1000000000000LL || target > 1000000000000LL)
        throw std::invalid_argument("target too large");
    std::unordered_map<long long, long long> counts{{0, 1}};
    long long prefix = 0, answer = 0;
    for (auto x : a) {
        prefix += x;
        const auto found = counts.find(prefix - target);
        if (found != counts.end()) answer += found->second;
        ++counts[prefix]; // Query first: do not count the empty subarray ending here.
    }
    return answer;
}
bool feasible(const Values& a, std::size_t groups, long long capacity) {
    if (a.empty()) return true;
    std::size_t used = 1;
    long long load = 0;
    for (auto x : a) {
        if (x > capacity) return false;
        if (load + x > capacity) { ++used; load = x; } else load += x;
    }
    return used <= groups;
}
long long min_capacity(const Values& a, std::size_t groups) {
    validate(a, true);
    if (groups == 0) throw std::invalid_argument("groups must be positive");
    if (a.empty()) return 0;
    long long lo = *std::max_element(a.begin(), a.end()), hi = 0;
    for (auto x : a) hi += x;
    while (lo < hi) {
        const auto mid = lo + (hi - lo) / 2;
        if (feasible(a, groups, mid)) hi = mid; else lo = mid + 1;
    }
    return lo;
}

long long brute_count(const Values& a, long long target) {
    long long count = 0;
    for (std::size_t l = 0; l < a.size(); ++l) {
        long long sum = 0;
        for (std::size_t r = l; r < a.size(); ++r) { sum += a[r]; count += sum == target; }
    }
    return count;
}
std::size_t brute_window(const Values& a, long long target) {
    std::size_t best = a.size() + 1;
    for (std::size_t l = 0; l < a.size(); ++l) {
        long long sum = 0;
        for (std::size_t r = l; r < a.size(); ++r) {
            sum += a[r];
            if (sum >= target) best = std::min(best, r - l + 1);
        }
    }
    return best == a.size() + 1 ? 0 : best;
}
long long brute_capacity(const Values& a, std::size_t groups) {
    if (a.empty()) return 0;
    long long best = 1000000000000LL;
    // Each of the n-1 gaps is either cut or joined; this oracle has no greedy scan.
    for (unsigned mask = 0; mask < (1u << (a.size() - 1)); ++mask) {
        std::size_t used = 1;
        long long sum = a[0], largest = 0;
        for (std::size_t i = 1; i < a.size(); ++i) {
            if (mask & (1u << (i - 1))) { largest = std::max(largest, sum); sum = 0; ++used; }
            sum += a[i];
        }
        largest = std::max(largest, sum);
        if (used <= groups) best = std::min(best, largest);
    }
    return best;
}
template<class Function> void must_reject(Function fn) {
    bool rejected = false;
    try { fn(); } catch (const std::logic_error&) { rejected = true; }
    assert(rejected);
}
int main() {
    const Values a{2, 3, 1, 2, 4, 3};
    assert(min_window(a, 7) == 2);
    assert(range_sum(prefix_sums(a), 1, 4) == 6);
    assert(count_exact_sum({1, -1, 1}, 1) == 3);
    assert(count_exact_sum({0, 0, 0}, 0) == 6);
    assert(min_capacity({7, 2, 5, 10, 8}, 2) == 18);
    assert((range_add({2, 1, 3, 4}, {{1, 3, 2}, {2, 4, -1}}) == Values{2, 3, 4, 3}));
    assert(min_window({}, 1) == 0 && min_capacity({}, 1) == 0);
    assert(range_sum(prefix_sums({}), 0, 0) == 0);
    assert(range_add({}, {{0, 0, 2}}).empty());
    must_reject([] { min_window({1, -1}, 2); });
    must_reject([] { min_window({1}, 0); });
    must_reject([] { min_capacity({1}, 0); });
    must_reject([] { two_sum_sorted({2, 1}, 3); });
    must_reject([] { range_add({1}, {{0, 2, 1}}); });
    must_reject([] { range_sum(prefix_sums({1}), 1, 0); });
    must_reject([] { prefix_sums({1000001}); });
    std::mt19937 generator(20261013);
    for (int trial = 0; trial < 2500; ++trial) {
        Values input(generator() % 9);
        for (auto& x : input) x = static_cast<int>(generator() % 7) - 3;
        const auto p = prefix_sums(input);
        for (std::size_t l = 0; l <= input.size(); ++l) {
            long long expected = 0;
            for (std::size_t r = l; r <= input.size(); ++r) {
                assert(range_sum(p, l, r) == expected);
                if (r < input.size()) expected += input[r];
            }
        }
        for (long long target = -5; target <= 5; ++target)
            assert(count_exact_sum(input, target) == brute_count(input, target));
        std::sort(input.begin(), input.end());
        for (long long target = -5; target <= 5; ++target) {
            bool exists = false;
            for (std::size_t i = 0; i < input.size(); ++i)
                for (std::size_t j = i + 1; j < input.size(); ++j)
                    exists = exists || input[i] + input[j] == target;
            const auto found = two_sum_sorted(input, target);
            assert(found.has_value() == exists);
            if (found) assert(found->first < found->second && input[found->first] + input[found->second] == target);
        }
        for (auto& x : input) x = static_cast<long long>(generator() % 6);
        for (long long target = 1; target <= 15; ++target)
            assert(min_window(input, target) == brute_window(input, target));
        for (std::size_t groups = 1; groups <= input.size() + 1; ++groups)
            assert(min_capacity(input, groups) == brute_capacity(input, groups));
        Values expected = input;
        std::vector<Update> updates;
        for (int step = 0; step < 6; ++step) {
            std::size_t l = generator() % (input.size() + 1), r = generator() % (input.size() + 1);
            if (l > r) std::swap(l, r);
            const long long delta = static_cast<int>(generator() % 7) - 3;
            updates.push_back({l, r, delta});
            for (auto i = l; i < r; ++i) expected[i] += delta;
        }
        assert(range_add(input, updates) == expected);
    }
    const Values large(100000, 1000000);
    assert(prefix_sums(large).back() == 100000000000LL);
    assert(count_exact_sum(Values(100000, 0), 0) == 5000050000LL);
    std::cout << "sequence algorithms: window=2, exact_sum=3, capacity=18; 2500 differential cases passed\n";
}
