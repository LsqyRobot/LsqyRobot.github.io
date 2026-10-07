#include "linked_list.hpp"

#include <algorithm>
#include <iostream>
#include <limits>
#include <random>
#include <stdexcept>
#include <string>
#include <type_traits>

static_assert(!std::is_copy_constructible_v<LinkedList>);
static_assert(!std::is_move_constructible_v<LinkedList>);

void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

void expect_values(const LinkedList& list, const std::vector<int>& expected) {
    require(list.to_vector() == expected, "unexpected node sequence");
    require(list.size() == expected.size(), "size invariant broken");
    require(list.empty() == expected.empty(), "empty invariant broken");
}

template <typename Operation>
void expect_range_error(Operation operation) {
    try {
        operation();
    } catch (const std::out_of_range&) {
        return;
    }
    throw std::runtime_error("expected std::out_of_range");
}

void test_empty_and_boundaries() {
    LinkedList list;
    expect_values(list, {});
    list.reverse();
    list.clear();
    expect_range_error([&] { list.erase(0); });
    expect_range_error([&] { (void)list.at(0); });
    expect_range_error([&] { list.insert(1, 99); });
    expect_values(list, {});

    list.insert(0, 10);
    list.reverse();
    expect_values(list, {10});
    expect_range_error([&] { list.insert(2, 99); });
    expect_range_error([&] { list.erase(1); });
    expect_range_error([&] { (void)list.at(1); });
    expect_range_error([&] { list.insert(std::size_t(-1), 99); });
    expect_range_error([&] { list.erase(std::numeric_limits<std::size_t>::max()); });
    expect_values(list, {10});
    require(list.erase(0) == 10, "wrong removed singleton");
    expect_values(list, {});
}

void test_picture_sequence() {
    LinkedList list;
    list.append(10);
    list.append(20);
    list.append(30);
    list.insert(1, 15);
    expect_values(list, {10, 15, 20, 30});
    require(list.erase(2) == 20, "wrong middle removal");
    expect_values(list, {10, 15, 30});
    list.reverse();
    expect_values(list, {30, 15, 10});
    list.reverse();
    expect_values(list, {10, 15, 30});

    list.insert(0, 5);
    list.insert(list.size(), 40);
    expect_values(list, {5, 10, 15, 30, 40});
    require(list.erase(0) == 5, "wrong head removal");
    require(list.erase(list.size() - 1) == 40, "wrong tail removal");
    require(list.at(0) == 10 && list.at(2) == 30, "wrong indexed access");
    list.clear();
    list.clear();
    list.append(7);
    expect_values(list, {7});
}

void test_against_vector() {
    LinkedList list;
    std::vector<int> model;
    std::mt19937 rng(20261004);
    for (int step = 0; step < 5000; ++step) {
        const auto operation = rng() % 5;
        if (operation <= 1 || model.empty()) {
            const std::size_t index = rng() % (model.size() + 1);
            const int value = static_cast<int>(rng() % 1000);
            list.insert(index, value);
            model.insert(model.begin() + static_cast<std::ptrdiff_t>(index), value);
        } else if (operation == 2) {
            const std::size_t index = rng() % model.size();
            require(list.erase(index) == model[index], "erase disagrees with vector");
            model.erase(model.begin() + static_cast<std::ptrdiff_t>(index));
        } else if (operation == 3) {
            list.reverse();
            std::reverse(model.begin(), model.end());
        } else {
            const std::size_t index = rng() % model.size();
            require(list.at(index) == model[index], "at disagrees with vector");
        }
        expect_values(list, model);
    }
}

void test_long_chain_cleanup() {
    constexpr int count = 250000;
    LinkedList list;
    for (int i = 0; i < count; ++i) list.push_front(i);
    require(list.size() == static_cast<std::size_t>(count), "long chain size");
    list.reverse();
    require(list.at(0) == 0 && list.at(count - 1) == count - 1, "long chain reverse");
    list.clear();
    expect_values(list, {});
    for (int i = 0; i < count; ++i) list.push_front(i);
    // Scope exit exercises the destructor with a long chain, under sanitizers.
}

int main() {
    try {
        test_empty_and_boundaries();
        std::cout << "PASS empty, singleton, invalid indices and unchanged state\n";
        test_picture_sequence();
        std::cout << "PASS insertion, head/middle/tail deletion and reversal\n";
        test_against_vector();
        std::cout << "PASS 5000 reproducible operations against std::vector\n";
        test_long_chain_cleanup();
        std::cout << "PASS 250000-node reversal, clear and destructor\n";
    } catch (const std::exception& error) {
        std::cerr << "FAIL " << error.what() << '\n';
        return 1;
    }
}
