# {{projectName}}

- 生成时间：{{date}}
- 模板：{{templateId}}（ctpl {{ctplVersion}}）
- 语言标准：C++{{cppStandard}}

## 构建

```bash
cmake -S . -B build -G Ninja -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build
```

产物在 `build/bin/`。

## 目录

- `src/main.cpp` —— 唯一的源文件，可执行入口 `{{targetName}}`
- `inc/` —— 头文件目录（已经在 `CMakeLists.txt` 里加进 include 路径，
  直接 `#include "xxx.hpp"` 即可；现在是空的，只放了个 `.gitkeep`）

加更多源文件就在 `CMakeLists.txt` 的 `add_executable(...)` 里补上文件名；
要拆成库时用 `add_library` + `target_link_libraries`。

## 说明

- 本工程不含 `CMakePresets.json`：VS Code 的 CMake Tools 用全局设置
  （`cmake.generator`、`cmake.configureArgs`、`cmake.buildDirectory`）来配置。
- 工程里的 `.vscode/settings.json` 设了 `"cmake.configureOnOpen": false`：
  **打开工程不会自动 configure**（Kit / 生成器没选好就 configure 容易报错）。
  想配置：命令面板 `CMake: Configure`，或把这一项改成 `true`。
- 首次在 VS Code 里打开时，若提示选择 Kit，选 **Unspecified**（未指定）即可，
  编译器会从 PATH 上的 `gcc` / `g++` 取（用 `ctpl doctor` 检查工具链）。
