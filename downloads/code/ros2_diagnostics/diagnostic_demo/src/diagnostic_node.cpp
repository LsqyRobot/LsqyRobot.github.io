#include <chrono>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

using namespace std::chrono_literals;

class DiagnosticNode : public rclcpp::Node
{
public:
  DiagnosticNode() : Node("diagnostic_demo")
  {
    mode_ = declare_parameter<std::string>("mode", "normal");
    publisher_ = create_publisher<std_msgs::msg::String>("heartbeat", 10);
    timer_ = create_wall_timer(100ms, std::bind(&DiagnosticNode::tick, this));
  }

private:
  void tick()
  {
    ++count_;
    const auto begin = std::chrono::steady_clock::now();
    RCLCPP_DEBUG(get_logger(), "tick begin count=%d mode=%s", count_, mode_.c_str());
    if (mode_ == "crash" && count_ == 5) {
      // Intentional, deterministic out_of_range exception for GDB practice.
      std::vector<int> values{10, 20, 30};
      RCLCPP_INFO(get_logger(), "value=%d", values.at(5));
    }
    if (mode_ == "slow") {
      std::this_thread::sleep_for(80ms);
    }
    std_msgs::msg::String message;
    message.data = "tick=" + std::to_string(count_);
    publisher_->publish(message);
    const double elapsed_ms = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - begin).count();
    RCLCPP_INFO(get_logger(), "count=%d elapsed_ms=%.3f", count_, elapsed_ms);
  }

  std::string mode_;
  int count_{0};
  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;
  rclcpp::TimerBase::SharedPtr timer_;
};

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<DiagnosticNode>());
  rclcpp::shutdown();
  return 0;
}
