#include <iostream>
#include <memory>
#include <stdexcept>

struct Sensor {
    virtual ~Sensor() = default;
    virtual int sample() const = 0;
};
struct SimSensor final : Sensor {
    int sample() const override { return 12; }
};
struct ReplaySensor final : Sensor {
    int sample() const override { return 7; }
};
enum class Source { simulation, replay };

std::unique_ptr<Sensor> make_sensor(Source source) {
    switch (source) {
    case Source::simulation: return std::make_unique<SimSensor>();
    case Source::replay: return std::make_unique<ReplaySensor>();
    }
    throw std::invalid_argument("unknown source");
}

int main() {
    for (Source source : {Source::simulation, Source::replay}) {
        auto sensor = make_sensor(source);
        std::cout << sensor->sample() << '\n';
    }
    try {
        auto sensor = make_sensor(static_cast<Source>(99));
        std::cout << sensor->sample() << '\n';
    } catch (const std::invalid_argument& error) {
        std::cout << error.what() << '\n';
    }
}
