#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <variant>
#include <vector>

using Samples = std::vector<std::pair<int, int>>;

std::optional<int> find_distance(const Samples& samples, int wanted_id) {
    for (const auto& [id, millimeters] : samples) {
        if (id == wanted_id && millimeters >= 0) {
            return millimeters;
        }
    }
    return std::nullopt;
}

struct Reading {
    int millimeters;
};

struct Missing {
    std::string reason;
};

using Event = std::variant<Reading, Missing>;

Event make_event(const Samples& samples, int id) {
    if (auto distance = find_distance(samples, id); distance) {
        return Reading{*distance};
    }
    return Missing{"no sample"};
}

void print_event(const Event& event) {
    std::visit([](const auto& item) {
        using T = std::decay_t<decltype(item)>;
        if constexpr (std::is_same_v<T, Reading>) {
            std::cout << "value=" << item.millimeters << " mm\n";
        } else {
            std::cout << "missing=" << item.reason << '\n';
        }
    }, event);
}

void print_sensor(std::string_view name) {
    std::cout << "sensor=" << name << '\n';
}

int main() {
    const std::string full_name = "front:distance";
    const std::string_view name{full_name};
    print_sensor(name.substr(0, name.find(':')));

    const Samples samples{{1, 120}, {2, 110}, {3, -1}};
    int valid = 0;
    int total = 0;
    for (const auto& [id, millimeters] : samples) {
        if (id > 0 && millimeters >= 0) {
            ++valid;
            total += millimeters;
        }
    }
    std::cout << "valid=" << valid << " total_mm=" << total << '\n';
    print_event(make_event(samples, 1));
    print_event(make_event(samples, 3));
}
