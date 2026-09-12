cmake_minimum_required(VERSION 3.15)
project(mymath LANGUAGES CXX)

if(NOT DEFINED MYMATH_VERSION)
  set(MYMATH_VERSION "1.0")
endif()

add_library(mymath src/mymath.cpp)
target_compile_features(mymath PUBLIC cxx_std_17)
target_include_directories(mymath PUBLIC
  "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
  "$<INSTALL_INTERFACE:include>")
target_compile_definitions(mymath PRIVATE
  MYMATH_VERSION="${MYMATH_VERSION}"
  MYMATH_BUILD_TYPE="$<CONFIG>")

install(TARGETS mymath
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin)
install(DIRECTORY include/ DESTINATION include)
