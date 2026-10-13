#include <algorithm>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <utility>

struct Filter {
    virtual ~Filter() = default;
    virtual double apply(double value) const = 0;
};
struct Identity final : Filter {
    double apply(double value) const override { return value; }
};
class Clamp final : public Filter {
    double low_, high_;
public:
    Clamp(double low, double high) : low_(low), high_(high) {
        if (!(low <= high)) throw std::invalid_argument("invalid bounds");
    }
    double apply(double value) const override {
        return std::clamp(value, low_, high_);
    }
};
class Pipeline {
    std::unique_ptr<Filter> filter_;
public:
    explicit Pipeline(std::unique_ptr<Filter> filter) {
        set_filter(std::move(filter));
    }
    void set_filter(std::unique_ptr<Filter> next) {
        if (!next) throw std::invalid_argument("filter is required");
        filter_ = std::move(next);
    }
    double process(double value) const { return filter_->apply(value); }
};
int main() {
    Pipeline pipeline(std::make_unique<Identity>());
    std::cout << "identity=" << pipeline.process(12) << '\n';
    pipeline.set_filter(std::make_unique<Clamp>(0, 10));
    std::cout << "clamped=" << pipeline.process(12) << '\n';
    try {
        pipeline.set_filter(nullptr);
    } catch (const std::invalid_argument& error) {
        std::cout << error.what() << '\n';
    }
    std::cout << "still=" << pipeline.process(12) << '\n';
}
