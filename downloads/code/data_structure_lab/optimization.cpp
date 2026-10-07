#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

double objective(double x) {
    const double error = x - 3.0;
    return 0.5 * error * error;
}

double gradient(double x) { return x - 3.0; }

std::vector<double> simulate(double eta, int steps) {
    if (!std::isfinite(eta) || eta <= 0.0 || steps < 0) {
        throw std::invalid_argument("positive finite step size and nonnegative steps required");
    }
    std::vector<double> trace{0.0};
    for (int k = 0; k < steps; ++k) {
        const double current = trace.back();
        const double next = current - eta * gradient(current);
        if (!std::isfinite(next) || !std::isfinite(objective(next))) {
            throw std::overflow_error("non-finite iterate or objective");
        }
        trace.push_back(next);
    }
    return trace;
}

bool close(double actual, double expected, double tolerance = 1e-12) {
    return std::abs(actual - expected) <= tolerance;
}

// Solve H p = -g by a 2x2 Cholesky factorization, not by forming H inverse.
// Example F(x,y) = 0.5*(x-3)^2 + 2*(y+1)^2 has H = diag(1,4).
std::array<double, 2> newton_direction(double x, double y) {
    const double h00 = 1.0, h10 = 0.0, h11 = 4.0;
    const double g0 = x - 3.0, g1 = 4.0 * (y + 1.0);
    const double l00 = std::sqrt(h00);
    const double l10 = h10 / l00;
    const double l11 = std::sqrt(h11 - l10 * l10);
    const double z0 = -g0 / l00;
    const double z1 = (-g1 - l10 * z0) / l11;
    const double p1 = z1 / l11;
    const double p0 = (z0 - l10 * p1) / l00;
    return {p0, p1};
}

int main() {
#ifdef NDEBUG
    throw std::logic_error("compile this teaching test without -DNDEBUG");
#endif
    const auto convergent = simulate(0.5, 50);
    assert(close(convergent[1], 1.5));
    assert(close(convergent[2], 2.25));
    assert(close(convergent[3], 2.625));
    assert(std::abs(convergent.back() - 3.0) < 1e-12);
    for (std::size_t k = 1; k < convergent.size(); ++k) {
        assert(objective(convergent[k]) <= objective(convergent[k - 1]));
    }

    const auto oscillating = simulate(2.0, 10);
    for (std::size_t k = 0; k < oscillating.size(); ++k) {
        assert(close(oscillating[k], k % 2 == 0 ? 0.0 : 6.0));
        assert(close(objective(oscillating[k]), 4.5));
    }

    const auto diverging = simulate(2.2, 20);
    assert(close(diverging[1], 6.6));
    assert(close(diverging[2], -1.32));
    assert(close(diverging[3], 8.184));
    for (std::size_t k = 1; k < diverging.size(); ++k) {
        assert(std::abs(diverging[k] - 3.0) > std::abs(diverging[k - 1] - 3.0));
    }
    const auto direction = newton_direction(0.0, 0.0);
    assert(close(direction[0], 3.0));
    assert(close(direction[1], -1.0));

    std::cout << std::fixed << std::setprecision(6);
    for (const double eta : {0.5, 2.0, 2.2}) {
        const auto trace = simulate(eta, 3);
        std::cout << "eta=" << eta << ": ";
        for (const double x : trace) std::cout << x << ' ';
        std::cout << '\n';
    }
    std::cout << "PASS convergence, oscillation, divergence and Newton solve\n";
}
