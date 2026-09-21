// SPDX-License-Identifier: Apache-2.0
// Teaching only: the slow callback intentionally blocks. Never copy its sleep
// or per-cycle logging into a hardware read/update/write real-time loop.
#include <chrono>
#include <exception>
#include <memory>
#include <sstream>
#include <string>
#include <thread>

#include "rclcpp/rclcpp.hpp"
#include "rclcpp/executors/multi_threaded_executor.hpp"
#include "rclcpp/executors/single_threaded_executor.hpp"

using namespace std::chrono_literals;

class ExecutorDemo final : public rclcpp::Node
{
public:
  ExecutorDemo()
  : Node("executor_demo"), start_(Clock::now()), last_fast_(start_)
  {
    declare_parameter<std::string>("executor", "single");
    const bool same_group = declare_parameter<bool>("same_group", false);

    slow_group_ = create_callback_group(rclcpp::CallbackGroupType::MutuallyExclusive);
    fast_group_ = same_group ? slow_group_ :
      create_callback_group(rclcpp::CallbackGroupType::MutuallyExclusive);

    slow_timer_ = create_wall_timer(1000ms, [this]() {
      const auto tid = thread_id();
      RCLCPP_INFO(get_logger(), "slow BEGIN t=%.1f ms thread=%s", elapsed_ms(), tid.c_str());
      std::this_thread::sleep_for(700ms);  // Emulate a blocking non-real-time I/O task.
      RCLCPP_INFO(get_logger(), "slow END   t=%.1f ms thread=%s", elapsed_ms(), tid.c_str());
    }, slow_group_);

    fast_timer_ = create_wall_timer(100ms, [this]() {
      const auto now = Clock::now();
      const double gap_ms = std::chrono::duration<double, std::milli>(now - last_fast_).count();
      last_fast_ = now;  // Only this callback touches it; its group is mutually exclusive.
      const auto tid = thread_id();
      RCLCPP_INFO(get_logger(), "fast       t=%.1f ms gap=%.1f ms thread=%s",
        elapsed_ms(), gap_ms, tid.c_str());
    }, fast_group_);

    RCLCPP_INFO(get_logger(), "same_group=%s; stop with Ctrl-C",
      same_group ? "true" : "false");
  }

private:
  using Clock = std::chrono::steady_clock;

  double elapsed_ms() const
  {
    return std::chrono::duration<double, std::milli>(Clock::now() - start_).count();
  }

  static std::string thread_id()
  {
    std::ostringstream stream;
    stream << std::this_thread::get_id();
    return stream.str();
  }

  const Clock::time_point start_;
  Clock::time_point last_fast_;
  // Keep ownership for the full node lifetime. Do not leave groups as local variables.
  rclcpp::CallbackGroup::SharedPtr slow_group_;
  rclcpp::CallbackGroup::SharedPtr fast_group_;
  rclcpp::TimerBase::SharedPtr slow_timer_;
  rclcpp::TimerBase::SharedPtr fast_timer_;
};

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  int exit_code = 0;
  try {
    auto node = std::make_shared<ExecutorDemo>();
    const auto mode = node->get_parameter("executor").as_string();
    if (mode == "single") {
      rclcpp::executors::SingleThreadedExecutor executor;
      executor.add_node(node);
      RCLCPP_INFO(node->get_logger(), "SingleThreadedExecutor: one callback thread");
      executor.spin();
    } else if (mode == "multi") {
      rclcpp::executors::MultiThreadedExecutor executor(rclcpp::ExecutorOptions(), 2);
      executor.add_node(node);
      RCLCPP_INFO(node->get_logger(), "MultiThreadedExecutor: two callback threads");
      executor.spin();
    } else {
      RCLCPP_ERROR(node->get_logger(), "executor must be single or multi, got '%s'", mode.c_str());
      exit_code = 2;
    }
  } catch (const std::exception & error) {
    RCLCPP_ERROR(rclcpp::get_logger("executor_demo"), "%s", error.what());
    exit_code = 1;
  }
  rclcpp::shutdown();
  return exit_code;
}
