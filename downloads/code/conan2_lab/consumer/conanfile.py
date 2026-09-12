from conan import ConanFile
from conan.tools.cmake import CMake, CMakeDeps, CMakeToolchain, cmake_layout


class ConsumerRecipe(ConanFile):
    settings = "os", "arch", "compiler", "build_type"
    # A range lets the experiment contrast unlocked resolution with a lockfile.
    requires = "mymath/[>=1.0 <2.0]"

    def layout(self):
        cmake_layout(self)

    def generate(self):
        CMakeDeps(self).generate()
        CMakeToolchain(self).generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()
