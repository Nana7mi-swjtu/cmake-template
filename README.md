# cmake-template（命令：`ctpl`）

交互式 CMake 项目模板工具：**用你自己写的模板，在任意指定路径生成一个"打开即用"的 CMake 工程。**

它解决的是 VS Code CMake 扩展自带的 "CMake: Quick Start" 的问题：目录结构写死、`CMakeLists.txt` 内容不可定制、总是引导你选编译器并生成 `CMakePresets.json`。

---

## 特点

| | |
| --- | --- |
| **自定义模板** | 一个模板就是一个目录。要求低到只需一个 `files/`（连 `template.json` 都不用写） |
| **默认模板** | 随包内置 `default-cpp`：`src/main.cpp` + `inc/`（头文件目录，已进 include 路径）+ `.gitignore` + `CMakeLists.txt`，默认 **C++11** |
| **目录可定制** | 相对路径列表 / 嵌套树 / 带条件的条目，三种写法任选；可选目录组勾选 |
| **CMakeLists.txt** | 可以导入现成的，也可以直接在模板目录里当纯文本编辑（工具不做语法校验） |
| **不生成 presets** | 默认**永不**生成 `CMakePresets.json`，交给 VS Code 全局设置（`cmake.generator` / `cmake.configureArgs` / `cmake.buildDirectory`） |
| **零依赖** | 只用 Node 标准库，`git clone` 就能跑，不需要 `npm install` |
| **模板不会丢** | 首次使用让你指定模板根目录；目录被迁移会自动重新询问；内置默认模板被删会自动恢复 |

## 环境要求

- Node.js ≥ 18
- CMake ≥ 3.20（4.x 也可以；模板默认声明 3.20）
- 可选：`git`、`ninja`、`gcc`/`g++`、VS Code 的 `code` 命令 —— 用 `ctpl doctor` 体检

> 下面的示例路径都写成 `path/to/...`。Windows 上换成你自己的绝对路径即可
> （形如 `C:\path\to\MyRender`）。

## 安装

```bash
git clone <本仓库> cmake-template
cd cmake-template
npm link          # 之后任意目录都能用 ctpl
# 或者不安装，直接跑：
node bin/ctpl.mjs --help
```

## 快速开始

```bash
# 首次运行会让你填写模板根目录（必须手填绝对路径，没有默认值）
ctpl new path/to/MyRender

# 全默认、不问确认：创建 + git init + 用 VS Code 打开
ctpl new path/to/MyRender --yes

# 带上 CTest 测试
ctpl new path/to/MyRender --yes --with tests

# 只看会创建什么，不写盘
ctpl new path/to/MyRender --dry-run
```

生成之后：

```bash
cd path/to/MyRender
cmake -S . -B build -G Ninja -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build
./build/bin/MyRender
```

在 VS Code 里打开该文件夹即可 —— 若弹出选择 Kit，选 **Unspecified**，会从 PATH 上的 `gcc`/`g++` 取编译器。

## 命令

| 命令 | 作用 |
| --- | --- |
| `ctpl new [目录]` | 交互式创建工程（核心） |
| `ctpl list` | 列出模板根目录里的模板 |
| `ctpl show <id>` | 查看模板详情与目录结构（用占位项目名渲染） |
| `ctpl init [工程目录]` | **把已有工程反向生成模板**（目录层级原样保留，自动排除 build/git 产物，自动参数化项目名） |
| `ctpl import-cmake <路径>` | **把现成的 `CMakeLists.txt` 导入某个模板** |
| `ctpl edit <id>` | 用 VS Code 打开模板目录 |
| `ctpl duplicate <源> <新>` | 复制模板作为新模板的起点 |
| `ctpl remove <id>` | 删除模板（内置模板下次启动会自动恢复） |
| `ctpl restore <id>` | 从随包副本强制恢复内置模板（先备份你的版本） |
| `ctpl config` | 查看/修改配置 |
| `ctpl doctor` | 环境自检 |

命令别名：`ls`=`list`、`create`=`new`、`import`=`import-cmake`、`rm`=`remove`、`cp`=`duplicate`。

`--template-dir <路径>` 对所有模板命令都有效（`new` / `list` / `show` / `init` / `import-cmake` / `duplicate` / `remove` / `restore` / `edit`），只是本次运行临时生效，不写入配置。

`new` 的常用选项：

```
-t, --template <id>       指定模板
    --name <项目名>        跳过询问
    --target <target名>    指定 CMake target 名（默认与项目名完全一致，不做转换）
    --set k=v              设置任意变量（可重复），例如 --set cppStandard=17
    --with a,b / --without a,b
-y, --yes                 全部默认值，不问确认
    --dry-run             只预览不写盘
    --json                以 JSON 输出（含 --dry-run）
    --force               不新建一层，直接写进目标目录；同名文件覆盖前先备份
    --on-conflict=<abort|overwrite|skip>   非空目录的显式策略（abort = 拒绝）
    --git / --no-git      覆盖默认的 git init
    --open / --no-open    覆盖默认的"用 VS Code 打开"
    --configure           创建后跑一次 cmake 预配置
    --template-dir <路径> 本次运行临时指定模板根目录（不写入配置）
    --lenient             模板里的未定义变量不报错，替换为空串
```

### 目标目录不是空的，会发生什么？

`ctpl new <目录>` 把文件写进 `<目录>`；**但如果 `<目录>` 已经有东西了，它不会往里塞**，
而是默认在它下面新建一层 `<项目名>/`（现有文件一个字节不动）。所以：

| 你写的命令 | 结果 |
| --- | --- |
| `ctpl new path/to/NewApp`（不存在） | 建出 `NewApp/`，文件直接放在里面；项目名 = 目录名 |
| `ctpl new path/to/Busy`（存在且非空） | 建出 `Busy/<项目名>/`，文件放在那里；`Busy/` 里原有的东西不动 |
| `... --name Fresh` | 那层新目录就叫 `Fresh/`（不写 `--name` 时默认用目录名，即 `Busy/Busy/`） |
| `... --on-conflict=abort` | 拒绝并退出码 4（想“目录必须空否则别动”的脚本可以用它） |
| `... --force` | 不新建一层，直接把文件写进 `Busy/`；同名文件被覆盖，**覆盖前先备份成 `<名字>.bak-<时间戳>`** |
| `... --on-conflict=skip` | 写进 `Busy/`，但同名文件保留你的版本 |
| `cd 某个空目录 && ctpl new .` | 文件直接落在当前目录里，不会多出一层 |

想在装满东西的目录里另起一个工程，直接 `ctpl new path/to/Busy --name NewApp` 就行 ——
工具会建出 `path/to/Busy/NewApp/`，不会碰 `Busy/` 里的任何现有文件。

非交互（`--yes`）下不会停下来问你，直接走默认行为（新建一层）并在输出里告诉你；
交互模式下会弹一个选择：新建一层 / 覆盖同名文件 / 跳过同名文件 / 中止。
预览里会列出**具体哪些文件**会冲突。

## 写自己的模板

三种方式，从最省事到最灵活。**只有想要“交互选项”时才需要碰 JSON。**

### 方式 A：零 JSON —— 把自己的目录拷进去就行

```bash
# 模板 = 一个目录，里面必须有 files/
#   path/to/templates/drop-in/
#   └─ files/            ← 这里面的结构 = 生成出来的工程结构
#      ├─ CMakeLists.txt
#      ├─ _gitignore      ← 前缀 _ 会被还原成 .
#      └─ src/core/engine.cpp ← 嵌套目录原样保留（你自己的结构说了算）
ctpl new path/to/X -t drop-in
```

不需要 `template.json`。`ctpl list` 会标成 `[裸模板]`，`ctpl show drop-in` 一样能预览结构。

内置变量可以直接用（不用声明）：`{{projectName}}`、`{{projectNameSnake}}`、`{{projectNameKebab}}`、`{{projectNameCamel}}`、`{{projectNamePascal}}`、`{{projectNameUpper}}`、`{{projectNameLower}}`、`{{targetName}}`、`{{dirName}}`、`{{author}}`、`{{email}}`、`{{year}}`/`{{date}}`/`{{datetime}}`、`{{cmakeMinVersion}}`、`{{cppStandard}}`、`{{buildDir}}`、`{{generator}}`、`{{templateId}}`/`{{templateName}}`、`{{ctplVersion}}`。

目录约定的几个关键点：

| 模板里的名字 | 生成出来的名字 |
| --- | --- |
| `src/core/engine.cpp` | `src/core/engine.cpp`（**嵌套层级完全原样保留**） |
| `include/{{projectNameSnake}}/app.hpp` | 目录名跟着项目名变 |
| `_gitignore` | `.gitignore`（前缀 `_` → `.`） |
| `foo.txt.tpl` | `foo.txt`（去掉 `.tpl`，用于避开编辑器的语法检查） |
| `__if_withTests__tests/` | 条件成立时才出现的路径 |
| `_gitkeep` | 不产出文件，只用来保空目录 |
| 完全没有文件的目录（如 `docs/`） | 自动着 `.gitkeep` 保留（不会静静消失） |

### 方式 B：从现有工程反向生成（最推荐）

```bash
cd path/to/MyRender            # 一个已经调好的工程
ctpl init . --id my-render --name "渲染工程"
```

它会自动：

- **目录层级一模一样**：`src/core/engine.cpp` → `files/src/core/engine.cpp`，`include/` 跟着改名；
- 跳过 `build*/`、`.git/`、`.vscode/`、`compile_commands.json`、`CMakePresets.json`、`*.obj/*.exe` 等构建产物（`--exclude` / `--include` 可调）；
- 从 `CMakeLists.txt` 读出 `project()` 名、`cmake_minimum_required`、`CMAKE_CXX_STANDARD`；
- 把项目名字面量参数化：**项目名原样映射成 `{{projectName}}`**（不擅自转大小写/风格）；源工程里出现的其它写法映射到对应派生占位符（`MY_RENDER` → `{{projectNameUpper}}`、`my-render` → `{{projectNameKebab}}`、`myrender` → `{{projectNameLower}}`…；边界只算字母/数字，所以 `src_1_name` 也能替换到）
- 把 `.gitignore` 这类点文件编码成 `_gitignore`；
- 生成的 `template.json` **不到 10 行**，而且删掉也能用。

生成后建议走一遍：`ctpl show my-render` → `ctpl new <临时目录> -t my-render --dry-run`。

### 方式 C：手写 JSON（只在需要选项时）

用 `template.json`，或者用 **`template.jsonc`**（可以写注释和尾逗号，手写更舒服）。每个字段都能省：

```jsonc
{
  // id / name 缺省就用目录名，schemaVersion 缺省按 1
  "variables": [
    { "key": "license", "prompt": "许可证", "type": "select",
      "choices": ["MIT", "Apache-2.0", "none"], "default": "MIT" }
  ],
  "optionalGroups": [
    { "id": "docs", "label": "文档目录", "files": ["docs/**"], "paths": ["docs"] }
  ]
}
```

对应的就是 `ctpl new … --set license=Apache-2.0 --with docs`，或者交互式询问。完整字段表与取值约束看 `schemas/template.schema.json`（指给编辑器就有补全与校验）。

文件内容里可用 `{{变量}}`、`{{#if expr}}…{{else}}…{{/if}}`、`{{#unless expr}}…{{/unless}}`、`{{! 注释 }}`；`{{var?}}` 表示“空则整个片段连带分隔符一起消失”。变量没定义时会直接报错，并告诉你三种加法（声明 / `--set` / 改 `{{x?}}`）。

### 微调已生成的模板

```bash
ctpl duplicate default-cpp mine    # 拿内置模板当起点
ctpl edit mine                     # 用 VS Code 打开模板目录
ctpl init . --id x --force         # 重新对着当前工程生成（原模板会备份）
```

## 导入已有的 CMakeLists.txt

```bash
# 把别的工程的 CMakeLists.txt 收进默认模板，顺便把工程名参数化
ctpl import-cmake path/to/other/CMakeLists.txt --template default-cpp --parameterize

# 放到模板内的其它位置 + 额外字面量替换
ctpl import-cmake ./ref/CMakeLists.txt -t default-cpp --to cmake/root.cmake \
  --replace-literal "old_proj_core={{targetName}}_core"
```

覆盖已有文件时会先备份成 `<名字>.bak-<时间戳>`。模板里的 `CMakeLists.txt` 是纯文本，工具不做语法校验（也不需要 LSP）。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `CTPL_CONFIG_HOME` | 覆盖工具配置目录（默认 `%APPDATA%\cmake-template` 或 `~/.config/cmake-template`） |
| `CTPL_TEMPLATE_DIR` | 本次运行临时指定模板根目录（不写入配置） |
| `CTPL_NO_PROMPT=1` | 强制非交互（等同无 TTY） |
| `CTPL_FORCE_TTY=1` | 仅测试用：让管道输入也走交互分支 |
| `NO_COLOR` | 关闭彩色输出 |
| `CI=true` | 视为非交互环境 |

## 配置

`ctpl config` 展示当前配置；模板根目录里**只有**模板，工具自身的 `config.json` / `state.json` 放在配置目录，两者不混。

```bash
ctpl config --templates-dir path/to/templates   # 改模板根目录（会同步内置模板）
ctpl config --set defaultTemplateId=my-min
ctpl config --set defaultActions.git=false
```

内置默认模板的同步规则：**被删 → 自动恢复；没改过 → 随工具升级；改过 → 绝不覆盖**（只提示，并可用 `ctpl restore` 主动恢复）。

## 许可

[MIT](LICENSE) © 2026 KaaNoo
