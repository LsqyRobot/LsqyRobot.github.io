#include <iostream>
#include <memory>
#include <string>

struct Sensor {
    virtual ~Sensor() = default;
    virtual int sample() const = 0;
};
struct Formatter {
    virtual ~Formatter() = default;
    virtual std::string format(int value) const = 0;
};
struct DeviceFamily {
    virtual ~DeviceFamily() = default;
    virtual std::unique_ptr<Sensor> make_sensor() const = 0;
    virtual std::unique_ptr<Formatter> make_formatter() const = 0;
};
struct CelsiusSensor final : Sensor {
    int sample() const override { return 20; }
};
struct CelsiusFormatter final : Formatter {
    std::string format(int value) const override {
        return std::to_string(value) + " C";
    }
};
struct FahrenheitSensor final : Sensor {
    int sample() const override { return 68; }
};
struct FahrenheitFormatter final : Formatter {
    std::string format(int value) const override {
        return std::to_string(value) + " F";
    }
};
struct CelsiusFamily final : DeviceFamily {
    std::unique_ptr<Sensor> make_sensor() const override {
        return std::make_unique<CelsiusSensor>();
    }
    std::unique_ptr<Formatter> make_formatter() const override {
        return std::make_unique<CelsiusFormatter>();
    }
};
struct FahrenheitFamily final : DeviceFamily {
    std::unique_ptr<Sensor> make_sensor() const override {
        return std::make_unique<FahrenheitSensor>();
    }
    std::unique_ptr<Formatter> make_formatter() const override {
        return std::make_unique<FahrenheitFormatter>();
    }
};
void report(const DeviceFamily& family) {
    auto sensor = family.make_sensor();
    auto formatter = family.make_formatter();
    std::cout << formatter->format(sensor->sample()) << '\n';
}
int main() {
    report(CelsiusFamily{});
    report(FahrenheitFamily{});
}
