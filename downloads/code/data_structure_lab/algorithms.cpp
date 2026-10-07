// C++17: lower_bound, stable insertion sort, unbounded minimum coin change.
#include <algorithm>
#include <cassert>
#include <iostream>
#include <optional>
#include <queue>
#include <random>
#include <stdexcept>
#include <utility>
#include <vector>

std::size_t lower_bound_index(const std::vector<int>& a, int target) {
    std::size_t lo = 0, hi = a.size();
    while (lo < hi) {
        const auto mid = lo + (hi - lo) / 2;
        if (a[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

template<class T, class Less>
void insertion_sort(std::vector<T>& a, Less less) {
    for (std::size_t i = 1; i < a.size(); ++i) {
        const auto key = a[i];
        auto j = i;
        while (j > 0 && less(key, a[j - 1])) {
            a[j] = a[j - 1];
            --j;
        }
        a[j] = key;
    }
}

struct Change { int count; std::vector<int> coins; };
std::optional<Change> coin_change(const std::vector<int>& coins, int amount) {
    // A deliberate resource bound for this teaching program.
    if (amount < 0 || amount > 1'000'000)
        throw std::out_of_range("amount must be in [0,1000000]");
    for (int c : coins)
        if (c <= 0) throw std::invalid_argument("coin values must be positive");
    const int unreachable = amount + 1;
    std::vector<int> dp(static_cast<std::size_t>(amount) + 1, unreachable);
    std::vector<int> last(dp.size(), 0);
    dp[0] = 0;
    for (int x = 1; x <= amount; ++x) {
        for (int c : coins) {
            if (c <= x && dp[x-c] != unreachable && dp[x-c] + 1 < dp[x]) {
                dp[x] = dp[x-c] + 1;
                last[x] = c;
            }
        }
    }
    if (dp[amount] == unreachable) return std::nullopt;
    Change result{dp[amount], {}};
    for (int x = amount; x > 0; x -= last[x]) {
        assert(last[x] > 0 && last[x] <= x);
        result.coins.push_back(last[x]);
    }
    return result;
}

// Independent oracle: shortest path on amounts 0..target, one coin per edge.
int coin_bfs(const std::vector<int>& coins, int target) {
    std::vector<int> distance(static_cast<std::size_t>(target) + 1, -1);
    std::queue<int> pending;
    distance[0] = 0;
    pending.push(0);
    while (!pending.empty()) {
        const int x = pending.front();
        pending.pop();
        for (int c : coins) {
            if (c <= target - x && distance[x+c] == -1) {
                distance[x+c] = distance[x] + 1;
                pending.push(x+c);
            }
        }
    }
    return distance[target];
}

int main() {
    assert(lower_bound_index({1,3,3,5,8}, 3) == 1);
    assert(lower_bound_index({}, 3) == 0);
    std::mt19937 rng(20261004);
    for (int trial = 0; trial < 300; ++trial) {
        std::vector<int> a(static_cast<std::size_t>(trial % 80));
        for (int& value : a) value = static_cast<int>(rng() % 31) - 15;
        std::sort(a.begin(), a.end());
        for (int target = -17; target <= 17; ++target)
            assert(lower_bound_index(a, target) == static_cast<std::size_t>(
                std::lower_bound(a.begin(), a.end(), target) - a.begin()));
        std::vector<std::pair<int,int>> records;
        for (int i = 0; i < trial % 80; ++i)
            records.emplace_back(static_cast<int>(rng() % 7), i);
        auto expected = records;
        const auto by_key = [](const auto& x, const auto& y) {
            return x.first < y.first;
        };
        std::stable_sort(expected.begin(), expected.end(), by_key);
        insertion_sort(records, by_key);
        assert(records == expected);
    }
    const auto six = coin_change({1,3,4}, 6);
    assert(six && six->count == 2 && six->coins == std::vector<int>({3,3}));
    assert(!coin_change({4,6}, 5));
    assert(coin_change({}, 0)->count == 0);
    assert(!coin_change({}, 3));
    for (int mask = 0; mask < 64; ++mask) {
        std::vector<int> coins;
        for (int c = 1; c <= 6; ++c)
            if (mask & (1 << (c-1))) coins.push_back(c);
        for (int amount = 0; amount <= 40; ++amount) {
            const auto result = coin_change(coins, amount);
            const int expected = coin_bfs(coins, amount);
            assert((result ? result->count : -1) == expected);
            if (result) {
                int sum = 0;
                for (int c : result->coins) {
                    assert(std::find(coins.begin(), coins.end(), c) != coins.end());
                    sum += c;
                }
                assert(sum == amount);
                assert(static_cast<int>(result->coins.size()) == result->count);
            }
        }
    }
    for (const auto& coins : {std::vector<int>{0}, std::vector<int>{-1,3}}) {
        bool caught = false;
        try { (void)coin_change(coins, 6); }
        catch (const std::invalid_argument&) { caught = true; }
        assert(caught);
    }
    for (int amount : {-1, 1'000'001}) {
        bool caught = false;
        try { (void)coin_change({1}, amount); }
        catch (const std::out_of_range&) { caught = true; }
        assert(caught);
    }
    std::cout << "algorithms: 10500 lower_bound queries, 300 stable sorts, "
                 "2624 coin-change oracle cases passed\n";
}
