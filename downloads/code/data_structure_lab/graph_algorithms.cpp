// C++17: BFS, Dijkstra, Kahn topological order, Kruskal minimum spanning forest.
// The main function verifies results with Floyd-Warshall and subset enumeration.
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <functional>
#include <iostream>
#include <limits>
#include <numeric>
#include <optional>
#include <queue>
#include <random>
#include <stdexcept>
#include <utility>
#include <vector>

using Weight = std::int64_t;
struct Arc { std::size_t to; Weight weight; };
using Graph = std::vector<std::vector<Arc>>;
using Distance = std::optional<Weight>;
struct UndirectedEdge { std::size_t u, v; Weight weight; };

Weight checked_add(Weight a, Weight b) {
    const auto low = std::numeric_limits<Weight>::min();
    const auto high = std::numeric_limits<Weight>::max();
    if ((b > 0 && a > high - b) || (b < 0 && a < low - b))
        throw std::overflow_error("weight sum is outside int64_t");
    return a + b;
}

void validate_graph(const Graph& g, bool require_nonnegative = false) {
    for (const auto& row : g)
        for (const auto& edge : row) {
            if (edge.to >= g.size())
                throw std::out_of_range("edge endpoint is outside the graph");
            if (require_nonnegative && edge.weight < 0)
                throw std::invalid_argument("Dijkstra requires nonnegative weights");
        }
}

std::vector<std::optional<std::size_t>> bfs(const Graph& g, std::size_t source) {
    validate_graph(g);
    if (source >= g.size()) throw std::out_of_range("invalid BFS source");
    std::vector<std::optional<std::size_t>> distance(g.size());
    std::queue<std::size_t> pending;
    distance[source] = 0;
    pending.push(source);
    while (!pending.empty()) {
        const auto u = pending.front();
        pending.pop();
        for (const auto& edge : g[u])
            if (!distance[edge.to]) {
                distance[edge.to] = *distance[u] + 1;
                pending.push(edge.to);
            }
    }
    return distance; // Counts edges; intentionally ignores weights.
}

struct Paths {
    std::vector<Distance> distance;
    std::vector<std::optional<std::size_t>> parent;
};

Paths dijkstra(const Graph& g, std::size_t source) {
    validate_graph(g, true); // Reject negative edges even in unreachable components.
    if (source >= g.size()) throw std::out_of_range("invalid Dijkstra source");
    Paths answer{std::vector<Distance>(g.size()),
                 std::vector<std::optional<std::size_t>>(g.size())};
    using Entry = std::pair<Weight, std::size_t>;
    std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> pending;
    answer.distance[source] = 0;
    pending.emplace(0, source);
    while (!pending.empty()) {
        const auto [du, u] = pending.top();
        pending.pop();
        if (!answer.distance[u] || du != *answer.distance[u]) continue;
        for (const auto& edge : g[u]) {
            const Weight candidate = checked_add(du, edge.weight);
            if (!answer.distance[edge.to] || candidate < *answer.distance[edge.to]) {
                answer.distance[edge.to] = candidate;
                answer.parent[edge.to] = u;
                pending.emplace(candidate, edge.to);
            }
        }
    }
    return answer;
}

std::vector<std::size_t> restore_path(const Paths& paths, std::size_t target) {
    if (target >= paths.distance.size()) throw std::out_of_range("invalid target");
    if (!paths.distance[target]) return {};
    std::vector<std::size_t> result;
    for (auto current = std::optional<std::size_t>{target}; current;
         current = paths.parent[*current])
        result.push_back(*current);
    std::reverse(result.begin(), result.end());
    return result;
}

// nullopt = cycle; an engaged empty vector = valid order for an empty graph.
std::optional<std::vector<std::size_t>> topological_order(const Graph& g) {
    validate_graph(g);
    std::vector<std::size_t> indegree(g.size(), 0);
    for (const auto& row : g)
        for (const auto& edge : row) {
            if (indegree[edge.to] == std::numeric_limits<std::size_t>::max())
                throw std::overflow_error("indegree overflow");
            ++indegree[edge.to];
        }
    std::queue<std::size_t> ready;
    for (std::size_t u = 0; u < g.size(); ++u)
        if (indegree[u] == 0) ready.push(u);
    std::vector<std::size_t> order;
    while (!ready.empty()) {
        const auto u = ready.front();
        ready.pop();
        order.push_back(u);
        for (const auto& edge : g[u])
            if (--indegree[edge.to] == 0) ready.push(edge.to);
    }
    if (order.size() != g.size()) return std::nullopt;
    return order;
}

class DisjointSet {
    std::vector<std::size_t> parent_, size_;
    std::size_t components_;
public:
    explicit DisjointSet(std::size_t n) : parent_(n), size_(n, 1), components_(n) {
        std::iota(parent_.begin(), parent_.end(), 0);
    }
    std::size_t find(std::size_t u) {
        while (u != parent_[u]) {
            parent_[u] = parent_[parent_[u]];
            u = parent_[u];
        }
        return u;
    }
    bool unite(std::size_t u, std::size_t v) {
        u = find(u); v = find(v);
        if (u == v) return false;
        if (size_[u] < size_[v]) std::swap(u, v);
        parent_[v] = u;
        size_[u] += size_[v];
        --components_;
        return true;
    }
    std::size_t components() const { return components_; }
};

struct Forest {
    Weight total = 0;
    std::size_t components;
    std::vector<UndirectedEdge> edges;
};

Forest kruskal(std::size_t n, std::vector<UndirectedEdge> edges) {
    for (const auto& edge : edges)
        if (edge.u >= n || edge.v >= n)
            throw std::out_of_range("invalid undirected endpoint");
    std::sort(edges.begin(), edges.end(), [](const auto& a, const auto& b) {
        if (a.weight != b.weight) return a.weight < b.weight;
        if (a.u != b.u) return a.u < b.u;
        return a.v < b.v;
    });
    DisjointSet sets(n);
    Forest answer{0, n, {}};
    for (const auto& edge : edges)
        if (sets.unite(edge.u, edge.v)) {
            answer.total = checked_add(answer.total, edge.weight);
            answer.edges.push_back(edge);
        }
    answer.components = sets.components();
    return answer;
}

// Independent shortest-path oracle: dynamic programming over allowed intermediates.
std::vector<std::vector<Distance>> floyd_warshall(const Graph& g) {
    validate_graph(g, true);
    std::vector<std::vector<Distance>> d(g.size(), std::vector<Distance>(g.size()));
    for (std::size_t u = 0; u < g.size(); ++u) {
        d[u][u] = 0;
        for (const auto& edge : g[u])
            if (!d[u][edge.to] || edge.weight < *d[u][edge.to])
                d[u][edge.to] = edge.weight;
    }
    for (std::size_t k = 0; k < g.size(); ++k)
        for (std::size_t u = 0; u < g.size(); ++u)
            for (std::size_t v = 0; v < g.size(); ++v)
                if (d[u][k] && d[k][v]) {
                    const auto candidate = checked_add(*d[u][k], *d[k][v]);
                    if (!d[u][v] || candidate < *d[u][v]) d[u][v] = candidate;
                }
    return d;
}

// Independent connectivity oracle: queue traversal, with no disjoint set.
std::vector<std::size_t> component_labels(
    std::size_t n, const std::vector<UndirectedEdge>& edges) {
    std::vector<std::vector<std::size_t>> adjacency(n);
    for (const auto& edge : edges) {
        adjacency[edge.u].push_back(edge.v);
        adjacency[edge.v].push_back(edge.u);
    }
    std::vector<std::size_t> labels(n, n);
    for (std::size_t root = 0; root < n; ++root) {
        if (labels[root] != n) continue;
        std::queue<std::size_t> pending;
        labels[root] = root;
        pending.push(root);
        while (!pending.empty()) {
            const auto u = pending.front(); pending.pop();
            for (auto v : adjacency[u])
                if (labels[v] == n) {
                    labels[v] = root;
                    pending.push(v);
                }
        }
    }
    return labels;
}

unsigned bit_count(std::uint64_t mask) {
    unsigned count = 0;
    while (mask) { mask &= mask - 1; ++count; }
    return count;
}

Weight enumerate_forest(std::size_t n, const std::vector<UndirectedEdge>& edges) {
    if (n > 6 || edges.size() > 18)
        throw std::invalid_argument("enumeration oracle is for small graphs only");
    const auto expected_labels = component_labels(n, edges);
    std::size_t components = 0;
    for (std::size_t u = 0; u < n; ++u)
        if (expected_labels[u] == u) ++components;
    const auto required = n - components;
    Distance best;
    const auto limit = std::uint64_t{1} << edges.size();
    for (std::uint64_t mask = 0; mask < limit; ++mask) {
        if (bit_count(mask) != required) continue;
        std::vector<UndirectedEdge> selected;
        Weight total = 0;
        for (std::size_t i = 0; i < edges.size(); ++i)
            if (mask & (std::uint64_t{1} << i)) {
                selected.push_back(edges[i]);
                total = checked_add(total, edges[i].weight);
            }
        if (component_labels(n, selected) == expected_labels && (!best || total < *best))
            best = total;
    }
    assert(best); // Every undirected graph has a spanning forest, including n=0.
    return *best;
}

bool is_topological(const Graph& g, const std::vector<std::size_t>& order) {
    if (order.size() != g.size()) return false;
    std::vector<std::size_t> position(g.size(), g.size());
    for (std::size_t i = 0; i < order.size(); ++i) {
        if (order[i] >= g.size() || position[order[i]] != g.size()) return false;
        position[order[i]] = i;
    }
    for (std::size_t u = 0; u < g.size(); ++u)
        for (const auto& edge : g[u])
            if (position[u] >= position[edge.to]) return false;
    return true;
}

template<class Exception, class Action>
void expect_throw(Action action) {
    bool caught = false;
    try { action(); }
    catch (const Exception&) { caught = true; }
    assert(caught);
}

int main() {
    // A=0, B=1, C=2, D=3, E=4, F=5; F is isolated.
    const Graph example{{{1,6},{2,1}}, {{3,1}}, {{1,2},{3,5}}, {{4,3}}, {}, {}};
    const auto paths = dijkstra(example, 0);
    assert((paths.distance == std::vector<Distance>{0,3,1,4,7,std::nullopt}));
    assert((restore_path(paths, 4) == std::vector<std::size_t>{0,2,1,3,4}));
    assert(restore_path(paths, 5).empty());
    const auto layers = bfs(example, 0);
    assert(layers[1] == 1 && layers[3] == 2 && layers[4] == 3 && !layers[5]);
    const auto order = topological_order(example);
    assert(order && is_topological(example, *order));
    assert(!topological_order(Graph{{{0,0}}})); // Self-loop is a directed cycle.
    assert(!topological_order(Graph{{{1,1}},{{0,1}}, {}}));
    assert(topological_order(Graph{})->empty());
    const Graph parallel{{{1,7},{1,2},{0,0}}, {}};
    assert(dijkstra(parallel, 0).distance[1] == 2);
    assert(!topological_order(parallel));
    assert(topological_order(Graph{{{1,1},{1,1}}, {}}));
    expect_throw<std::invalid_argument>([] { (void)dijkstra(Graph{{},{{1,-1}}},0); });
    expect_throw<std::out_of_range>([] { (void)dijkstra(Graph{},0); });
    expect_throw<std::out_of_range>([] { (void)bfs(Graph{},0); });
    expect_throw<std::out_of_range>([] { (void)dijkstra(Graph{{{2,1}}},0); });
    expect_throw<std::out_of_range>([] { (void)topological_order(Graph{{{1,1}}}); });
    const auto maximum = std::numeric_limits<Weight>::max();
    assert(dijkstra(Graph{{{1,maximum}},{}},0).distance[1] == maximum);
    expect_throw<std::overflow_error>([maximum] {
        (void)dijkstra(Graph{{{1,maximum}},{{2,1}},{}},0);
    });

    const std::vector<UndirectedEdge> mst_edges{
        {0,2,1},{1,3,1},{1,2,2},{3,4,3},{2,3,5},{0,1,6}};
    const auto forest = kruskal(6, mst_edges);
    assert(forest.total == 7 && forest.edges.size() == 4 && forest.components == 2);
    assert(kruskal(0, {}).components == 0);
    assert(kruskal(3, {}).components == 3);
    assert(kruskal(2, {{0,0,-100},{0,1,3},{0,1,-2}}).total == -2);
    expect_throw<std::out_of_range>([] { (void)kruskal(2,{{0,2,1}}); });
    expect_throw<std::overflow_error>([maximum] {
        (void)kruskal(3,{{0,1,maximum},{1,2,maximum}});
    });
    expect_throw<std::overflow_error>([] {
        (void)checked_add(std::numeric_limits<Weight>::min(), -1);
    });

    std::mt19937 rng(20261013);
    std::size_t shortest_path_checks = 0;
    for (int trial = 0; trial < 300; ++trial) {
        const auto n = static_cast<std::size_t>(1 + rng() % 6);
        Graph g(n), dag(n);
        for (std::size_t u = 0; u < n; ++u)
            for (std::size_t v = 0; v < n; ++v)
                if (rng() % 4 == 0) {
                    g[u].push_back({v,static_cast<Weight>(rng() % 11)});
                    if (u < v) dag[u].push_back({v,1});
                    if (rng() % 4 == 0) g[u].push_back({v,2});
                }
        const auto expected = floyd_warshall(g);
        for (std::size_t source = 0; source < n; ++source) {
            assert(dijkstra(g,source).distance == expected[source]);
            ++shortest_path_checks;
        }
        const auto dag_order = topological_order(dag);
        assert(dag_order && is_topological(dag, *dag_order));
    }
    for (int trial = 0; trial < 160; ++trial) {
        const auto n = static_cast<std::size_t>(rng() % 6);
        std::vector<UndirectedEdge> edges;
        if (n > 0)
            for (unsigned i = 0, m = rng() % 11; i < m; ++i)
                edges.push_back({rng() % n, rng() % n,static_cast<Weight>(rng() % 17)-8});
        const auto result = kruskal(n,edges);
        assert(result.total == enumerate_forest(n,edges));
        assert(component_labels(n,result.edges) == component_labels(n,edges));
        assert(result.edges.size() == n - result.components);
    }
    std::cout << "graph algorithms: " << shortest_path_checks
              << " Floyd shortest-path comparisons, 300 DAG orders, "
                 "160 enumerated forests and boundary cases passed\n";
}
