cmake_minimum_required(VERSION {{cmakeMinVersion}})

project({{projectName}}
    VERSION 0.1.0
    LANGUAGES CXX)

set(CMAKE_CXX_STANDARD {{cppStandard}})
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# 单配置生成器（Ninja）下统一产物目录
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

add_executable({{targetName}} src/main.cpp)

# 头文件放 inc/，这里已经把它加进头文件搜索路径
target_include_directories({{targetName}} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/inc)

# 版本号从上面 project(... VERSION) 传给源码，避免在代码里硬编码
target_compile_definitions({{targetName}} PRIVATE
    {{projectNameUpper}}_VERSION="${PROJECT_VERSION}")

if(MSVC)
    target_compile_options({{targetName}} PRIVATE /W4 /permissive-)
else()
    target_compile_options({{targetName}} PRIVATE -Wall -Wextra -Wpedantic)
endif()

{{#if withTests}}
enable_testing()
add_subdirectory(tests)
{{/if}}
