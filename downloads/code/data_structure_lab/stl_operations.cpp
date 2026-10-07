// C++17. Companion to: /2024/10/28/archived_CPP_STL_容器/
#include <algorithm>
#include <cassert>
#include <iostream>
#include <iterator>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <vector>

std::vector<int> clean_sorted_unique(std::vector<int> readings) {
    readings.erase(std::remove_if(readings.begin(), readings.end(),
                                 [](int x) { return x < 0; }), readings.end());
    std::sort(readings.begin(), readings.end());
    readings.erase(std::unique(readings.begin(), readings.end()), readings.end());
    return readings;
}
std::vector<int> first_occurrences(const std::vector<int>& values) {
    std::unordered_set<int> seen;
    std::vector<int> result;
    for (int value : values)
        if (seen.insert(value).second) result.push_back(value);
    return result;
}
std::vector<int> keys_in_range(const std::map<int, std::string>& events,
                               int low, int high) {
    std::vector<int> result;
    for (auto it = events.lower_bound(low);
         it != events.end() && it->first < high; ++it)
        result.push_back(it->first);
    return result;
}
struct Person { std::string name; int age; };
struct PersonLess {
    bool operator()(const Person& a, const Person& b) const {
        return std::tie(a.age, a.name) < std::tie(b.age, b.name);
    }
};

int main() {
    std::vector<int> readings{7, -1, 3, 7, 2, -5};
    auto new_end = std::remove_if(readings.begin(), readings.end(),
                                  [](int x) { return x < 0; });
    assert(readings.size() == 6); // Algorithm alone did not change ownership.
    assert(std::distance(readings.begin(), new_end) == 4);
    assert((std::vector<int>(readings.begin(), new_end) == std::vector<int>{7, 3, 7, 2}));
    // No assumptions about the values in [new_end, end).
    readings.erase(new_end, readings.end());
    assert((readings == std::vector<int>{7, 3, 7, 2}));
    assert((first_occurrences(readings) == std::vector<int>{7, 3, 2}));
    assert((clean_sorted_unique({7, -1, 3, 7, 2, -5}) == std::vector<int>{2, 3, 7}));
    assert(clean_sorted_unique({}).empty());
    assert(clean_sorted_unique({-1, -2}).empty());
    assert((clean_sorted_unique({0, 0, -1}) == std::vector<int>{0}));
    assert((first_occurrences({3, 3, 2, 3, 1, 2}) == std::vector<int>{3, 2, 1}));
    assert(first_occurrences({}).empty());
    std::vector<int> separated{7, 3, 7};
    auto after_unique = std::unique(separated.begin(), separated.end());
    assert(after_unique == separated.end()); // Non-adjacent duplicates remain.

    // Independent oracle: a set of valid input values, including many duplicates.
    for (int trial = 0; trial < 50; ++trial) {
        std::vector<int> input;
        std::set<int> expected;
        for (int i = 0; i < trial; ++i) {
            int value = (i * 7 + trial * 3) % 19 - 6;
            input.push_back(value);
            if (value >= 0) expected.insert(value);
        }
        assert(clean_sorted_unique(input) == std::vector<int>(expected.begin(), expected.end()));
    }

    std::vector<int> sorted{2, 3, 7};
    assert(std::lower_bound(sorted.begin(), sorted.end(), 1) == sorted.begin());
    assert(std::lower_bound(sorted.begin(), sorted.end(), 3) == sorted.begin() + 1);
    assert(std::lower_bound(sorted.begin(), sorted.end(), 5) == sorted.begin() + 2);
    assert(std::lower_bound(sorted.begin(), sorted.end(), 9) == sorted.end());

    std::map<int, int> frequency;
    for (int x : readings) ++frequency[x];
    assert(frequency.at(7) == 2 && frequency.at(2) == 1);
    for (auto it = frequency.begin(); it != frequency.end(); ) {
        if (it->second < 2) it = frequency.erase(it);
        else ++it;
    }
    assert(frequency.size() == 1 && frequency.at(7) == 2);
    std::map<std::string, int> limits{{"imu", 100}};
    auto before = limits.size();
    assert(limits.find("camera") == limits.end() && limits.size() == before);
    assert(limits["camera"] == 0 && limits.size() == before + 1);
    limits.insert_or_assign("camera", 30);
    auto insertion = limits.try_emplace("camera", 60);
    assert(!insertion.second && limits.at("camera") == 30);

    std::set<Person, PersonLess> people;
    people.insert({"Alice", 20});
    people.insert({"Bob", 20});
    people.insert({"Alice", 20});
    assert(people.size() == 2); // Equal age alone is not the chosen identity.
    assert(people.begin()->name == "Alice");

    std::unordered_map<int, std::string> names{{1, "imu"}};
    auto old_position = names.find(1);
    std::string& saved_value = old_position->second;
    const auto* saved_address = &saved_value;
    names.rehash(names.bucket_count() * 2 + 1);
    // Do not access old_position after rehash; reacquire it.
    auto new_position = names.find(1);
    assert(new_position != names.end());
    assert(saved_address == &new_position->second && saved_value == "imu");

    std::map<int, std::string> events{{10, "start"}, {20, "sample"},
                                     {25, "warning"}, {40, "stop"}};
    assert((keys_in_range(events, 15, 30) == std::vector<int>{20, 25}));
    assert((keys_in_range(events, 20, 25) == std::vector<int>{20}));
    assert(keys_in_range(events, 30, 30).empty());
    assert(keys_in_range(events, 50, 70).empty());
    assert(keys_in_range({}, 0, 100).empty());
    std::list<int> linked{3, 1, 2};
    linked.sort(); // std::sort(linked.begin(), linked.end()) is ill-formed.
    assert((std::vector<int>(linked.begin(), linked.end()) == std::vector<int>{1, 2, 3}));
    std::priority_queue<int> priorities;
    for (int p : {3, 9, 1}) priorities.push(p);
    std::vector<int> ordered;
    while (!priorities.empty()) {
        ordered.push_back(priorities.top());
        priorities.pop();
    }
    assert((ordered == std::vector<int>{9, 3, 1}));
    std::cout << "STL: filtering, deduplication, bounds, dictionaries and safe mutation checks passed\n";
}
