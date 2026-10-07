// C++17. Companion to: /2026/08/11/cpp_common_data_structures_visual_guide/
// Compile and run through the repository's data-structure lab Docker command.
#include <algorithm>
#include <array>
#include <cassert>
#include <functional>
#include <iostream>
#include <limits>
#include <memory>
#include <numeric>
#include <queue>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

class Trie {
    struct Node {
        std::array<std::unique_ptr<Node>, 26> child{};
        bool is_word = false;
    };
    Node root_;
    static void validate_word(std::string_view word) {
        for (char c : word) {
            if (c < 'a' || c > 'z')
                throw std::invalid_argument("expected lowercase a-z");
        }
    }
    const Node* walk(std::string_view word) const {
        validate_word(word);
        const Node* p = &root_;
        for (char c : word) {
            const auto& next = p->child[static_cast<std::size_t>(c - 'a')];
            if (!next) return nullptr;
            p = next.get();
        }
        return p;
    }
public:
    void insert(std::string_view word) {
        // Validate the WHOLE word before changing the tree.
        validate_word(word);
        Node* p = &root_;
        for (char c : word) {
            auto& next = p->child[static_cast<std::size_t>(c - 'a')];
            if (!next) next = std::make_unique<Node>();
            p = next.get();
        }
        p->is_word = true;
    }
    bool contains(std::string_view word) const {
        const Node* p = walk(word);
        return p && p->is_word;
    }
    bool starts_with(std::string_view prefix) const {
        return walk(prefix) != nullptr;
    }
};

using Graph = std::vector<std::vector<int>>;
void validate_graph(const Graph& graph, int start) {
    if (graph.size() > static_cast<std::size_t>(std::numeric_limits<int>::max()))
        throw std::length_error("graph is too large for int vertex IDs");
    if (start < 0 || static_cast<std::size_t>(start) >= graph.size())
        throw std::out_of_range("BFS start is outside the graph");
    // Check all components, not just the reachable one.
    for (const auto& neighbors : graph) {
        for (int v : neighbors) {
            if (v < 0 || static_cast<std::size_t>(v) >= graph.size())
                throw std::out_of_range("edge endpoint is outside the graph");
        }
    }
}
std::vector<int> bfs_distance(const Graph& graph, int start) {
    validate_graph(graph, start);
    std::vector<int> distance(graph.size(), -1);
    std::queue<int> pending;
    distance[start] = 0;
    pending.push(start);
    while (!pending.empty()) {
        int u = pending.front();
        pending.pop();
        for (int v : graph[u]) {
            if (distance[v] == -1) {
                distance[v] = distance[u] + 1;
                pending.push(v);
            }
        }
    }
    return distance;
}

class DisjointSet {
    std::vector<int> parent_;
    std::vector<int> size_;
    void validate_id(int x) const {
        if (x < 0 || static_cast<std::size_t>(x) >= parent_.size())
            throw std::out_of_range("DSU element is outside [0,n)");
    }
    int root(int x) {
        while (parent_[x] != x) {
            parent_[x] = parent_[parent_[x]]; // Path halving.
            x = parent_[x];
        }
        return x;
    }
public:
    explicit DisjointSet(int n) {
        // Avoid converting negative n to a huge unsigned allocation size.
        if (n < 0) throw std::invalid_argument("DSU size must be nonnegative");
        parent_.resize(static_cast<std::size_t>(n));
        size_.assign(static_cast<std::size_t>(n), 1);
        std::iota(parent_.begin(), parent_.end(), 0);
    }
    int find(int x) {
        validate_id(x);
        return root(x);
    }
    bool unite(int a, int b) {
        validate_id(a);
        validate_id(b);
        a = root(a);
        b = root(b);
        if (a == b) return false;
        if (size_[a] < size_[b]) std::swap(a, b);
        parent_[b] = a;
        size_[a] += size_[b];
        return true;
    }
    bool connected(int a, int b) {
        validate_id(a);
        validate_id(b);
        return root(a) == root(b);
    }
};

struct Point {
    int x, y;
    bool operator==(const Point& other) const noexcept {
        return x == other.x && y == other.y;
    }
};
struct PointHash {
    std::size_t operator()(const Point& p) const noexcept {
        return std::hash<int>{}(p.x) ^ (std::hash<int>{}(p.y) << 1);
    }
};

template<class Exception, class Action>
void expect_throw(Action action) {
    bool caught = false;
    try { action(); } catch (const Exception&) { caught = true; }
    assert(caught);
}

int main() {
    std::array<int, 3> fixed{10, 20, 30};
    expect_throw<std::out_of_range>([&] { (void)fixed.at(3); });
    std::vector<int> values{10, 20, 30};
    values.reserve(8);
    assert(values.size() == 3 && values.capacity() >= 8);
    values.insert(values.begin() + 1, 15);
    assert((values == std::vector<int>{10, 15, 20, 30}));
    // Do not inspect invalid iterators after an insertion or reallocation.

    std::priority_queue<int, std::vector<int>, std::greater<int>> heap;
    for (int x : {5, 2, 9, 2}) heap.push(x);
    std::vector<int> extracted;
    while (!heap.empty()) {
        extracted.push_back(heap.top());
        heap.pop();
    }
    assert((extracted == std::vector<int>{2, 2, 5, 9}));
    std::unordered_map<Point, std::string, PointHash> labels;
    labels[{1, 2}] = "camera";
    labels[{-1, 2}] = "imu";
    assert(labels.at(Point{1, 2}) == "camera");
    assert(labels.at(Point{-1, 2}) == "imu");

    Trie dictionary;
    assert(!dictionary.contains(""));
    assert(dictionary.starts_with(""));
    dictionary.insert("cat");
    dictionary.insert("car");
    dictionary.insert("dog");
    dictionary.insert("cat");
    assert(dictionary.contains("cat") && dictionary.contains("car"));
    assert(dictionary.starts_with("ca") && !dictionary.contains("ca"));
    assert(!dictionary.contains("cart") && !dictionary.starts_with("z"));
    dictionary.insert("");
    assert(dictionary.contains(""));
    expect_throw<std::invalid_argument>([&] { dictionary.insert("zoo!"); });
    assert(!dictionary.starts_with("z")); // Rejected insertion made no partial path.
    expect_throw<std::invalid_argument>([&] { (void)dictionary.contains("Cat"); });
    expect_throw<std::invalid_argument>([&] { (void)dictionary.starts_with("a/"); });
    expect_throw<std::invalid_argument>([&] { dictionary.insert("中文"); });

    Graph graph{{1, 2}, {3}, {3, 4}, {}, {}}; // A..E; directed.
    assert((bfs_distance(graph, 0) == std::vector<int>{0, 1, 1, 2, 2}));
    graph.push_back({}); // F is unreachable.
    assert((bfs_distance(graph, 0) == std::vector<int>{0, 1, 1, 2, 2, -1}));
    graph[4].push_back(5);
    assert(bfs_distance(graph, 0).at(5) == 3);
    assert((bfs_distance(Graph{{0, 1, 1}, {0}, {}}, 0)
            == std::vector<int>{0, 1, -1})); // Self-loop, duplicates, cycle.
    assert((bfs_distance(Graph{{}}, 0) == std::vector<int>{0}));
    expect_throw<std::out_of_range>([] { (void)bfs_distance(Graph{}, 0); });
    expect_throw<std::out_of_range>([&] { (void)bfs_distance(graph, -1); });
    expect_throw<std::out_of_range>([&] { (void)bfs_distance(graph, 6); });
    expect_throw<std::out_of_range>([] { (void)bfs_distance(Graph{{-1}}, 0); });
    expect_throw<std::out_of_range>([] { (void)bfs_distance(Graph{{}, {2}}, 0); });

    DisjointSet groups(5);
    assert(groups.unite(0, 1));
    assert(groups.unite(2, 3));
    assert(!groups.connected(0, 3));
    assert(groups.unite(1, 2));
    assert(groups.connected(0, 3) && !groups.connected(0, 4));
    assert(!groups.unite(0, 3) && !groups.unite(2, 2));
    expect_throw<std::invalid_argument>([] { DisjointSet invalid(-1); });
    DisjointSet empty(0);
    expect_throw<std::out_of_range>([&] { (void)empty.find(0); });
    expect_throw<std::out_of_range>([&] { (void)groups.unite(-1, 0); });
    expect_throw<std::out_of_range>([&] { (void)groups.connected(0, 5); });

    // Compare incremental connectivity with a deliberately simple label model.
    constexpr int n = 12;
    DisjointSet incremental(n);
    std::array<int, n> label{};
    std::iota(label.begin(), label.end(), 0);
    for (int step = 0; step < 80; ++step) {
        int a = (step * 7 + 1) % n;
        int b = (step * 5 + step / 3) % n;
        int from = label[b], to = label[a];
        assert(incremental.unite(a, b) == (from != to));
        for (int& value : label) if (value == from) value = to;
        for (int i = 0; i < n; ++i)
            for (int j = 0; j < n; ++j)
                assert(incremental.connected(i, j) == (label[i] == label[j]));
    }
    std::cout << "structures: vector, heap, hash, Trie, BFS and DSU checks passed\n";
}
