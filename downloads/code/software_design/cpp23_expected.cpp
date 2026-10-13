#include <version>
#include <charconv>
#include <expected>
#include <functional>
#include <iostream>
#include <memory>
#include <string_view>
#include <system_error>
#include <utility>

#if !defined(__cpp_lib_expected) || __cpp_lib_expected < 202202L
#error "This example requires basic C++23 std::expected."
#endif
#if !defined(__cpp_lib_to_underlying) || __cpp_lib_to_underlying < 202102L
#error "This example requires C++23 std::to_underlying."
#endif
#if !defined(__cpp_lib_move_only_function) || __cpp_lib_move_only_function < 202110L
#error "This example requires C++23 std::move_only_function."
#endif

enum class Error : int { invalid_text = 1, out_of_range = 2 };
using Result = std::expected<int, Error>;

Result parse_mm(std::string_view text) {
    if (text.empty()) {
        return std::unexpected(Error::invalid_text);
    }
    int value = 0;
    const char* end = text.data() + text.size();
    const auto [position, error] = std::from_chars(text.data(), end, value);
    if (error != std::errc{} || position != end) {
        return std::unexpected(Error::invalid_text);
    }
    return value;
}

Result validate_mm(int value) {
    if (value < 0 || value > 1000) {
        return std::unexpected(Error::out_of_range);
    }
    return value;
}

Result distance_cm(std::string_view text) {
#if __cpp_lib_expected >= 202211L
    return parse_mm(text)
        .and_then(validate_mm)
        .transform([](int millimeters) { return millimeters / 10; });
#else
    auto parsed = parse_mm(text);
    if (!parsed) {
        return std::unexpected(parsed.error());
    }
    auto valid = validate_mm(*parsed);
    if (!valid) {
        return std::unexpected(valid.error());
    }
    return *valid / 10;
#endif
}

void print_result(std::string_view text) {
    const auto result = distance_cm(text);
    if (result) {
        std::cout << text << ": cm=" << *result << '\n';
    } else {
        std::cout << text << ": error="
                  << std::to_underlying(result.error()) << '\n';
    }
}

int main() {
    print_result("120");
    print_result("oops");
    print_result("1200");

    auto gain = std::make_unique<int>(3);
    std::move_only_function<int(int)> strategy =
        [owned_gain = std::move(gain)](int centimeters) {
            return centimeters * *owned_gain;
        };
    const auto result = distance_cm("120");
    if (result && strategy) {
        std::cout << "strategy=" << strategy(*result) << '\n';
    }
}
