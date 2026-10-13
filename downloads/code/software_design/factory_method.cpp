#include <iostream>
#include <memory>

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

class SampleJob {
protected:
    virtual std::unique_ptr<Sensor> create_sensor() const = 0;
public:
    virtual ~SampleJob() = default;
    void run() const {
        auto sensor = create_sensor(); // Contract: a non-null product.
        std::cout << "sample=" << sensor->sample() << '\n';
    }
};
class SimJob final : public SampleJob {
    std::unique_ptr<Sensor> create_sensor() const override {
        return std::make_unique<SimSensor>();
    }
};
class ReplayJob final : public SampleJob {
    std::unique_ptr<Sensor> create_sensor() const override {
        return std::make_unique<ReplaySensor>();
    }
};

int main() {
    SimJob simulation;
    ReplayJob replay;
    const SampleJob& job = simulation;
    job.run();
    replay.run();
}
