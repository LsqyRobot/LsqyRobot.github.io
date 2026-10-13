// C++17: exact-weight knapsack, strict LIS, LCS, and coin counting.
// Resource limits and checked counting arithmetic are part of this example.
#include <algorithm>
#include <cstdint>
#include <iostream>
#include <limits>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

using Value = std::int64_t;
constexpr Value unreachable = -1;  // All admitted item values are nonnegative.
struct Item { int weight; Value value; };
struct Knapsack { Value value; std::vector<std::size_t> items; };

void validate_knapsack(const std::vector<Item>& items, int capacity) {
    if (items.size() > 200 || capacity < 0 || capacity > 5'000)
        throw std::out_of_range("knapsack: at most 200 items, capacity in [0,5000]");
    for (const auto& item : items)
        if (item.weight <= 0 || item.value < 0 || item.value > 1'000'000)
            throw std::invalid_argument("positive weights and values in [0,1000000] required");
}

std::optional<Value> knapsack01_value(const std::vector<Item>& items, int capacity) {
    validate_knapsack(items, capacity);
    std::vector<Value> dp(static_cast<std::size_t>(capacity) + 1, unreachable);
    dp[0] = 0;
    for (const auto& item : items) {
        for (int w = capacity; w >= item.weight; --w) {
            if (dp[w - item.weight] != unreachable)
                dp[w] = std::max(dp[w], dp[w - item.weight] + item.value);
        }
    }
    if (dp[capacity] == unreachable) return std::nullopt;
    return dp[capacity];
}

std::optional<Knapsack> knapsack01_restore(const std::vector<Item>& items, int capacity) {
    validate_knapsack(items, capacity);
    std::vector<std::vector<Value>> dp(items.size() + 1,
        std::vector<Value>(static_cast<std::size_t>(capacity) + 1, unreachable));
    dp[0][0] = 0;
    for (std::size_t i = 1; i <= items.size(); ++i) {
        const auto& item = items[i - 1];
        for (int w = 0; w <= capacity; ++w) {
            dp[i][w] = dp[i - 1][w];
            if (w >= item.weight && dp[i - 1][w - item.weight] != unreachable)
                dp[i][w] = std::max(dp[i][w],
                    dp[i - 1][w - item.weight] + item.value);
        }
    }
    if (dp.back()[capacity] == unreachable) return std::nullopt;
    Knapsack result{dp.back()[capacity], {}};
    int w = capacity;
    for (std::size_t i = items.size(); i > 0; --i) {
        if (dp[i][w] != dp[i - 1][w]) {
            result.items.push_back(i - 1);
            w -= items[i - 1].weight;
        }
    }
    std::reverse(result.items.begin(), result.items.end());
    return result;
}

std::optional<Value> knapsack_complete_value(const std::vector<Item>& items, int capacity) {
    validate_knapsack(items, capacity);
    std::vector<Value> dp(static_cast<std::size_t>(capacity) + 1, unreachable);
    dp[0] = 0;
    for (const auto& item : items) {
        for (int w = item.weight; w <= capacity; ++w) {
            if (dp[w - item.weight] != unreachable)
                dp[w] = std::max(dp[w], dp[w - item.weight] + item.value);
        }
    }
    if (dp[capacity] == unreachable) return std::nullopt;
    return dp[capacity];
}

struct Subsequence { std::vector<std::size_t> indices; };

Subsequence restore_indices(const std::vector<std::size_t>& parent,
                            std::size_t last, std::size_t missing) {
    Subsequence result;
    while (last != missing) {
        result.indices.push_back(last);
        last = parent[last];
    }
    std::reverse(result.indices.begin(), result.indices.end());
    return result;
}

Subsequence lis_quadratic(const std::vector<int>& a) {
    if (a.size() > 2'000) throw std::out_of_range("quadratic LIS: at most 2000 values");
    if (a.empty()) return {};
    std::vector<std::size_t> length(a.size(), 1), parent(a.size(), a.size());
    std::size_t last = 0;
    for (std::size_t i = 0; i < a.size(); ++i) {
        for (std::size_t j = 0; j < i; ++j) {
            if (a[j] < a[i] && length[j] + 1 > length[i]) {
                length[i] = length[j] + 1;
                parent[i] = j;
            }
        }
        if (length[i] > length[last]) last = i;
    }
    return restore_indices(parent, last, a.size());
}

Subsequence lis_binary(const std::vector<int>& a) {
    if (a.size() > 100'000) throw std::out_of_range("binary LIS: at most 100000 values");
    std::vector<int> tails;
    std::vector<std::size_t> tail_index, parent(a.size(), a.size());
    for (std::size_t i = 0; i < a.size(); ++i) {
        const auto it = std::lower_bound(tails.begin(), tails.end(), a[i]);
        const auto p = static_cast<std::size_t>(it - tails.begin());
        if (p > 0) parent[i] = tail_index[p - 1];
        if (it == tails.end()) {
            tails.push_back(a[i]);
            tail_index.push_back(i);
        } else {
            tails[p] = a[i];
            tail_index[p] = i;
        }
    }
    if (tail_index.empty()) return {};
    return restore_indices(parent, tail_index.back(), a.size());
}

void validate_lcs(const std::string& a, const std::string& b) {
    if (a.size() > 2'000 || b.size() > 2'000)
        throw std::out_of_range("LCS: each byte string has at most 2000 characters");
}

int lcs_length(const std::string& a, const std::string& b) {
    validate_lcs(a, b);
    const std::string* rows = &a;
    const std::string* cols = &b;
    if (rows->size() < cols->size()) std::swap(rows, cols);
    std::vector<int> dp(cols->size() + 1, 0);
    for (char x : *rows) {
        int diagonal = 0;
        for (std::size_t j = 1; j <= cols->size(); ++j) {
            const int above = dp[j];
            if (x == (*cols)[j - 1]) dp[j] = diagonal + 1;
            else dp[j] = std::max(dp[j], dp[j - 1]);
            diagonal = above;
        }
    }
    return dp.back();
}

std::string lcs_restore(const std::string& a, const std::string& b) {
    validate_lcs(a, b);
    std::vector<std::vector<int>> dp(a.size() + 1, std::vector<int>(b.size() + 1));
    for (std::size_t i = 1; i <= a.size(); ++i)
        for (std::size_t j = 1; j <= b.size(); ++j)
            dp[i][j] = a[i - 1] == b[j - 1] ? dp[i - 1][j - 1] + 1
                       : std::max(dp[i - 1][j], dp[i][j - 1]);
    std::string result;
    std::size_t i = a.size(), j = b.size();
    while (i > 0 && j > 0) {
        if (a[i - 1] == b[j - 1]) {
            result.push_back(a[i - 1]);
            --i;
            --j;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) --i;
        else --j;
    }
    std::reverse(result.begin(), result.end());
    return result;
}

using Count = std::uint64_t;
void checked_add(Count& a, Count b) {
    if (b > std::numeric_limits<Count>::max() - a)
        throw std::overflow_error("coin count exceeds uint64_t");
    a += b;
}

std::vector<int> normalize_coins(std::vector<int> coins, int amount) {
    if (coins.size() > 50 || amount < 0 || amount > 1'000)
        throw std::out_of_range("coin counting: at most 50 coins, amount in [0,1000]");
    for (int c : coins)
        if (c <= 0) throw std::invalid_argument("coin values must be positive");
    std::sort(coins.begin(), coins.end());
    coins.erase(std::unique(coins.begin(), coins.end()), coins.end());
    return coins;
}

Count coin_combinations(std::vector<int> coins, int amount) {
    coins = normalize_coins(std::move(coins), amount);
    std::vector<Count> dp(static_cast<std::size_t>(amount) + 1, 0);
    dp[0] = 1;
    for (int c : coins)
        for (int x = c; x <= amount; ++x)
            checked_add(dp[x], dp[x - c]);
    return dp[amount];
}

Count coin_ordered_sequences(std::vector<int> coins, int amount) {
    coins = normalize_coins(std::move(coins), amount);
    std::vector<Count> dp(static_cast<std::size_t>(amount) + 1, 0);
    dp[0] = 1;
    for (int x = 1; x <= amount; ++x)
        for (int c : coins)
            if (c <= x) checked_add(dp[x], dp[x - c]);
    return dp[amount];
}

// Independent small-input oracles: enumerate concrete choices, not DP tables.
std::optional<Value> knapsack_subset_oracle(const std::vector<Item>& items, int capacity) {
    validate_knapsack(items, capacity);
    if (items.size() > 8 || capacity > 12)
        throw std::out_of_range("subset oracle is restricted to 8 items and capacity 12");
    Value best = unreachable;
    const auto count = std::uint64_t{1} << items.size();
    for (std::uint64_t mask = 0; mask < count; ++mask) {
        Value weight = 0;
        Value value = 0;
        for (std::size_t i = 0; i < items.size(); ++i)
            if (mask & (std::uint64_t{1} << i)) {
                weight += items[i].weight;
                value += items[i].value;
            }
        if (weight == capacity) best = std::max(best, value);
    }
    if (best == unreachable) return std::nullopt;
    return best;
}

Value complete_choices_oracle(const std::vector<Item>& items, std::size_t i, int left) {
    if (i == 0) {
        validate_knapsack(items, left);
        if (items.size() > 6 || left > 12)
            throw std::out_of_range("complete oracle is restricted to 6 items and capacity 12");
    }
    if (i == items.size()) return left == 0 ? 0 : unreachable;
    Value best = unreachable;
    for (int used = 0; used <= left / items[i].weight; ++used) {
        const Value rest = complete_choices_oracle(items, i + 1,
                                                  left - used * items[i].weight);
        if (rest != unreachable) best = std::max(best, rest + used * items[i].value);
    }
    return best;
}

std::size_t lis_subset_oracle(const std::vector<int>& a) {
    if (a.size() > 8) throw std::out_of_range("LIS subset oracle: at most 8 values");
    std::size_t best = 0;
    const auto count = std::uint64_t{1} << a.size();
    for (std::uint64_t mask = 0; mask < count; ++mask) {
        std::size_t length = 0;
        std::optional<int> previous;
        bool valid = true;
        for (std::size_t i = 0; i < a.size(); ++i)
            if (mask & (std::uint64_t{1} << i)) {
                if (previous && *previous >= a[i]) valid = false;
                previous = a[i];
                ++length;
            }
        if (valid) best = std::max(best, length);
    }
    return best;
}

bool is_subsequence(const std::string& candidate, const std::string& text) {
    std::size_t i = 0;
    for (char c : text)
        if (i < candidate.size() && candidate[i] == c) ++i;
    return i == candidate.size();
}

std::size_t lcs_subset_oracle(const std::string& a, const std::string& b) {
    if (a.size() > 5 || b.size() > 5)
        throw std::out_of_range("LCS subset oracle: each string has at most 5 bytes");
    std::size_t best = 0;
    const auto count = std::uint64_t{1} << a.size();
    for (std::uint64_t mask = 0; mask < count; ++mask) {
        std::string candidate;
        for (std::size_t i = 0; i < a.size(); ++i)
            if (mask & (std::uint64_t{1} << i)) candidate.push_back(a[i]);
        if (is_subsequence(candidate, b)) best = std::max(best, candidate.size());
    }
    return best;
}

Count combination_choices_oracle(const std::vector<int>& coins, std::size_t i, int left) {
    if (i == 0) {
        if (left < 0 || left > 12 || coins.size() > 5)
            throw std::out_of_range("counting oracle is restricted to 5 denominations and amount 12");
        for (int c : coins)
            if (c <= 0 || c > 5) throw std::invalid_argument("oracle denominations in [1,5]");
    }
    if (i == coins.size()) return left == 0 ? 1 : 0;
    Count result = 0;
    for (int used = 0; used <= left / coins[i]; ++used)
        result += combination_choices_oracle(coins, i + 1, left - used * coins[i]);
    return result;
}

Count sequence_choices_oracle(const std::vector<int>& coins, int left) {
    if (left < 0 || left > 12 || coins.size() > 5)
        throw std::out_of_range("counting oracle is restricted to 5 denominations and amount 12");
    for (int c : coins)
        if (c <= 0 || c > 5) throw std::invalid_argument("oracle denominations in [1,5]");
    if (left == 0) return 1;
    Count result = 0;
    for (int c : coins)
        if (c <= left) result += sequence_choices_oracle(coins, left - c);
    return result;
}

void check(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}

template<class Exception, class Function>
void expect_throw(Function function) {
    bool caught = false;
    try { function(); }
    catch (const Exception&) { caught = true; }
    check(caught, "expected validation exception");
}

void validate_lis_result(const std::vector<int>& a, const Subsequence& result,
                         std::size_t expected) {
    check(result.indices.size() == expected, "LIS length mismatch");
    for (std::size_t k = 0; k < result.indices.size(); ++k) {
        check(result.indices[k] < a.size(), "LIS index out of bounds");
        if (k > 0) {
            check(result.indices[k - 1] < result.indices[k], "LIS indices not increasing");
            check(a[result.indices[k - 1]] < a[result.indices[k]], "LIS values not strict");
        }
    }
}

int main() {
    try {
        const std::vector<Item> example{{2, 3}, {3, 4}, {4, 5}};
        check(knapsack01_value(example, 5) == std::optional<Value>{7}, "knapsack example");
        check(!knapsack01_value({{2, 3}}, 4), "0/1 must not reuse an item");
        check(knapsack_complete_value({{2, 3}}, 4) == std::optional<Value>{6},
              "complete knapsack must allow reuse");
        check(!knapsack01_value({{2, 3}}, 1), "unreachable weight");
        check(knapsack01_value({}, 0) == std::optional<Value>{0}, "empty knapsack");
        check(knapsack01_value({{2, 0}}, 2) == std::optional<Value>{0},
              "reachable zero value must differ from unreachable");
        std::mt19937 rng(20261013);
        std::size_t knapsack_cases = 0;
        for (int trial = 0; trial < 120; ++trial) {
            std::vector<Item> items;
            for (int i = 0; i < trial % 7; ++i)
                items.push_back({1 + static_cast<int>(rng() % 5), static_cast<Value>(rng() % 8)});
            for (int capacity = 0; capacity <= 12; ++capacity) {
                const auto expected = knapsack_subset_oracle(items, capacity);
                check(knapsack01_value(items, capacity) == expected, "0/1 oracle mismatch");
                const auto restored = knapsack01_restore(items, capacity);
                check(static_cast<bool>(restored) == static_cast<bool>(expected),
                      "knapsack restore reachability");
                if (restored) {
                    int weight = 0;
                    Value value = 0;
                    std::vector<bool> seen(items.size(), false);
                    for (std::size_t i : restored->items) {
                        check(i < items.size() && !seen[i], "knapsack reused item");
                        seen[i] = true;
                        weight += items[i].weight;
                        value += items[i].value;
                    }
                    check(weight == capacity && value == *expected && restored->value == value,
                          "knapsack restored solution");
                }
                const auto unlimited = knapsack_complete_value(items, capacity);
                const Value unlimited_expected = complete_choices_oracle(items, 0, capacity);
                check((unlimited ? *unlimited : unreachable) == unlimited_expected,
                      "complete knapsack oracle mismatch");
                ++knapsack_cases;
            }
        }
        std::size_t lis_cases = 0;
        for (std::size_t n = 0; n <= 8; ++n) {
            std::size_t variations = 1;
            for (std::size_t i = 0; i < n; ++i) variations *= 3;
            for (std::size_t code = 0; code < variations; ++code) {
                std::vector<int> a(n);
                std::size_t remaining = code;
                for (int& x : a) { x = static_cast<int>(remaining % 3) - 1; remaining /= 3; }
                const auto expected = lis_subset_oracle(a);
                validate_lis_result(a, lis_quadratic(a), expected);
                validate_lis_result(a, lis_binary(a), expected);
                ++lis_cases;
            }
        }
        validate_lis_result({3, 5, 6, 2, 4}, lis_binary({3, 5, 6, 2, 4}), 3);
        std::vector<std::string> strings;
        for (std::size_t n = 0; n <= 5; ++n)
            for (std::size_t mask = 0; mask < (std::size_t{1} << n); ++mask) {
                std::string s(n, 'A');
                for (std::size_t i = 0; i < n; ++i)
                    if (mask & (std::size_t{1} << i)) s[i] = 'B';
                strings.push_back(s);
            }
        std::size_t lcs_cases = 0;
        for (const auto& a : strings)
            for (const auto& b : strings) {
                const auto expected = lcs_subset_oracle(a, b);
                const auto restored = lcs_restore(a, b);
                check(static_cast<std::size_t>(lcs_length(a, b)) == expected,
                      "rolling LCS oracle mismatch");
                check(restored.size() == expected && is_subsequence(restored, a)
                      && is_subsequence(restored, b), "LCS restored solution");
                ++lcs_cases;
            }
        check(lcs_restore("ABC", "BAC") == "AC", "LCS example");
        std::size_t counting_cases = 0;
        for (int mask = 0; mask < 32; ++mask) {
            std::vector<int> coins;
            for (int c = 1; c <= 5; ++c)
                if (mask & (1 << (c - 1))) coins.push_back(c);
            for (int amount = 0; amount <= 12; ++amount) {
                check(coin_combinations(coins, amount) == combination_choices_oracle(coins, 0, amount),
                      "combination counting oracle mismatch");
                check(coin_ordered_sequences(coins, amount) == sequence_choices_oracle(coins, amount),
                      "ordered counting oracle mismatch");
                ++counting_cases;
            }
        }
        check(coin_combinations({1, 1, 2}, 3) == 2, "duplicate denomination normalization");
        check(coin_ordered_sequences({1, 1, 2}, 3) == 3, "ordered denomination normalization");
        expect_throw<std::invalid_argument>([] { (void)knapsack01_value({{0, 3}}, 4); });
        expect_throw<std::invalid_argument>([] { (void)knapsack_complete_value({{1, -1}}, 4); });
        expect_throw<std::out_of_range>([] { (void)knapsack01_value({}, -1); });
        expect_throw<std::out_of_range>([] { (void)knapsack01_restore({}, 5'001); });
        expect_throw<std::out_of_range>([] { (void)lis_quadratic(std::vector<int>(2'001)); });
        expect_throw<std::out_of_range>([] { (void)lis_binary(std::vector<int>(100'001)); });
        expect_throw<std::out_of_range>([] { (void)lcs_length(std::string(2'001, 'A'), ""); });
        expect_throw<std::invalid_argument>([] { (void)coin_combinations({0}, 4); });
        expect_throw<std::out_of_range>([] { (void)coin_combinations({}, 1'001); });
        expect_throw<std::overflow_error>([] { (void)coin_ordered_sequences({1, 2}, 100); });
        std::cout << "dynamic programming: " << knapsack_cases << " knapsack cases, "
                  << lis_cases << " LIS exhaustive cases, " << lcs_cases << " LCS exhaustive pairs, "
                  << counting_cases << " counting cases; restoration and boundaries passed\n";
    } catch (const std::exception& error) {
        std::cerr << "dynamic programming failed: " << error.what() << '\n';
        return 1;
    }
}
