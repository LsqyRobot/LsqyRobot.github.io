from conan import ConanFile
from conan.tools.cmake import CMake, CMakeDeps, CMakeToolchain, cmake_layout
from conan.tools.files import copy
import os


class MyMathRecipe(ConanFile):
    name = "mymath"
    package_type = "library"
    license = "MIT"
    description = "Small local-only library for the Conan 2 teaching lab"
    settings = "os", "arch", "compiler", "build_type"
    options = {"shared": [True, False], "fPIC": [True, False]}
    default_options = {"shared": False, "fPIC": True}
    exports_sources = "CMakeLists.txt", "include/*", "src/*", "LICENSE"

    def set_version(self):
        # Keep 1.0 as the default, while accepting an explicit --version=1.1.
        self.version = self.version or "1.0"

    def config_options(self):
        if self.settings.os == "Windows":
            self.options.rm_safe("fPIC")

    def configure(self):
        if self.options.shared:
            self.options.rm_safe("fPIC")

    def layout(self):
        cmake_layout(self)

    def generate(self):
        CMakeDeps(self).generate()
        toolchain = CMakeToolchain(self)
        toolchain.variables["MYMATH_VERSION"] = str(self.version)
        toolchain.generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        CMake(self).install()
        copy(self, "LICENSE", src=self.source_folder,
             dst=os.path.join(self.package_folder, "licenses"))

    def package_info(self):
        self.cpp_info.libs = ["mymath"]
        self.cpp_info.set_property("cmake_file_name", "mymath")
        self.cpp_info.set_property("cmake_target_name", "mymath::mymath")
