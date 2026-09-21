cmake_minimum_required(VERSION 3.8)
project(lsqy_control_demo)

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)

add_executable(executor_demo src/executor_demo.cpp)
target_compile_features(executor_demo PUBLIC cxx_std_17)
ament_target_dependencies(executor_demo rclcpp)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(executor_demo PRIVATE -Wall -Wextra -Wpedantic)
endif()
install(TARGETS executor_demo DESTINATION lib/${PROJECT_NAME})
install(DIRECTORY urdf config launch DESTINATION share/${PROJECT_NAME})
install(FILES README.md DESTINATION share/${PROJECT_NAME})

ament_package()
