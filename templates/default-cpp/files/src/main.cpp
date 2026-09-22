#include <iostream>

// 版本号由 CMakeLists.txt 的 project(... VERSION 0.1.0) 注入；
// 下面这行只是单独编译本文件时的兜底值。
#if !defined({{projectNameUpper}}_VERSION)
#define {{projectNameUpper}}_VERSION "0.0.0-dev"
#endif

int main(int argc, char** argv) {
    std::cout << "{{projectName}} " << {{projectNameUpper}}_VERSION << std::endl;

    for (int i = 1; i < argc; ++i) {
        std::cout << "  argv[" << i << "] = " << argv[i] << std::endl;
    }
    return 0;
}
