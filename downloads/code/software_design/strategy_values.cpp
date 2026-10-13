#include <algorithm>
#include <functional>
#include <iostream>
#include <stdexcept>
#include <utility>

class CallablePipeline {
    std::function<double(double)> filter_;
public:
    explicit CallablePipeline(std::function<double(double)> filter) {
        set_filter(std::move(filter));
    }
    void set_filter(std::function<double(double)> next) {
        if (!next) throw std::invalid_argument("filter is required");
        filter_ = std::move(next);
    }
    double process(double value) const { return filter_(value); }
};

template<class Filter>
struct StaticPipeline {
    Filter filter;
    double process(double value) const { return filter(value); }
};
struct Twice {
    double operator()(double value) const { return value * 2; }
};
int main() {
    const double limit = 10;
    CallablePipeline dynamic([limit](double value) {
        return std::clamp(value, 0.0, limit);
    });
    std::cout << "callable=" << dynamic.process(12) << '\n';
    dynamic.set_filter(Twice{});
    std::cout << "replaced=" << dynamic.process(12) << '\n';
    StaticPipeline<Twice> fixed{Twice{}};
    std::cout << "static=" << fixed.process(12) << '\n';
    try {
        dynamic.set_filter({});
    } catch (const std::invalid_argument& error) {
        std::cout << error.what() << '\n';
    }
}
