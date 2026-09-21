cmake_minimum_required(VERSION 3.16)
project(pinocchio_floating_base_notes LANGUAGES CXX)

# Run in a declared development container with the Pinocchio C++ SDK installed.
# This file neither downloads dependencies nor modifies the host environment.
find_package(pinocchio 3.8.0 EXACT REQUIRED CONFIG)

add_executable(floating_base_demo floating_base_demo.cpp)
target_compile_features(floating_base_demo PRIVATE cxx_std_17)
target_link_libraries(floating_base_demo PRIVATE pinocchio::pinocchio)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(floating_base_demo PRIVATE -Wall -Wextra -Wpedantic)
endif()

include(CTest)
if(BUILD_TESTING)
  add_test(NAME floating_base_api_consistency COMMAND floating_base_demo)
endif()
