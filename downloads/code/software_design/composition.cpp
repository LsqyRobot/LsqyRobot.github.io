#include <iostream>
#include <memory>
#include <stdexcept>
#include <utility>

struct SampleSource {
    virtual ~SampleSource() = default;
    virtual double read() const = 0;
};

class FixedSource final : public SampleSource {
    double value_;
public:
    explicit FixedSource(double value) : value_(value) {}
    double read() const override { return value_; }
};

class Monitor {
    std::unique_ptr<SampleSource> source_;
    double threshold_;
public:
    Monitor(std::unique_ptr<SampleSource> source, double threshold)
        : source_(std::move(source)), threshold_(threshold) {
        if (!source_) throw std::invalid_argument("source is required");
    }
    bool above_threshold() const { return source_->read() > threshold_; }
};

int main() {
    Monitor monitor(std::make_unique<FixedSource>(12.0), 10.0);
    std::cout << std::boolalpha << "above=" << monitor.above_threshold() << '\n';
    try {
        Monitor invalid(nullptr, 10.0);
    } catch (const std::invalid_argument& error) {
        std::cout << error.what() << '\n';
    }
}
