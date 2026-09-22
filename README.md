# cmake-template

`ctpl` —— 交互式 CMake 工程模板工具：**用你自己写的模板，在任意路径生成一个"打开即用"的 CMake 工程。**

主要用来替代 VS Code CMake 扩展自带的 *CMake: Quick Start*：那个会把目录结构写死、`CMakeLists.txt` 不可定制，还总要你选编译器并生成 `CMakePresets.json`。

- **模板就是一个目录**：最低要求是有一个 `files/`，`template.json` 都可以不写
- **反向生成**：已有工程一条命令变成模板，目录层级与项目名都保持原样
- **不生成 `CMakePresets.json`**：生成器、构建目录交给 VS Code 全局设置
- **零依赖**：只用 Node 标准库，`git clone` 就能跑
- **模板不会丢**：内置模板被删会自动恢复；没改过就随工具升级；改过绝不覆盖

## 环境要求

- Node.js ≥ 18
- CMake ≥ 3.20（4.x 也可以）
- 可选：`git`、`ninja`、`gcc`/`g++`、VS Code 的 `code` 命令 —— `ctpl doctor` 可以体检

> 示例里的 `path/to/...` 换成你自己的绝对路径（Windows 上形如 `C:\path\to\MyRender`）。

## 安装

```bash
npm i -g @evan7der/cmake-template    # 之后任意目录都能直接用 ctpl

npx -p @evan7der/cmake-template ctpl --help   # 或者先不安装，直接试一下
```

从源码跑（改代码时用）：

```bash
git clone https://github.com/Nana7mi-swjtu/cmake-template.git && cd cmake-template
npm link                  # 之后任意目录都能直接用 ctpl

node bin/ctpl.mjs --help  # 或者不安装，直接跑
```

## 快速开始

```bash
ctpl new path/to/MyRender              # 首次会让你指定模板根目录（绝对路径，无默认值）
ctpl new path/to/MyRender --yes        # 全默认：创建 + git init + 用 VS Code 打开
ctpl new path/to/MyRender --yes --with tests   # 带上 CTest 冒烟测试
ctpl new path/to/MyRender --dry-run    # 只预览会创建什么，不写盘
```

```bash
cd path/to/MyRender
cmake -S . -B build -G Ninja -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build build
./build/bin/MyRender
```

在 VS Code 里打开该文件夹即可。弹窗选 Kit 时选 **Unspecified**，编译器会从 PATH 上的 `gcc`/`g++` 取。

默认模板 `default-cpp`（默认 C++11）产出：`CMakeLists.txt`、`.gitignore`、`README.md`、`src/main.cpp`，以及已进 include 路径的 `inc/` 目录。

## 命令

| 命令 | 作用 |
| --- | --- |
| `ctpl new [目录]` | 交互式创建工程（核心） |
| `ctpl init [工程目录]` | 把已有工程反向生成模板 |
| `ctpl import-cmake <路径>` | 把现成的 `CMakeLists.txt` 导入某个模板 |
| `ctpl list` / `ctpl show <id>` | 列出模板 / 查看模板详情与目录结构 |
| `ctpl edit <id>` | 用 VS Code 打开模板目录 |
| `ctpl duplicate <源id> <新id>` | 复制模板，作为新模板的起点 |
| `ctpl remove <id>` / `ctpl restore <id>` | 删除模板 / 从随包副本恢复内置模板 |
| `ctpl config` / `ctpl doctor` | 查看与修改配置 / 环境自检 |

别名：`ls` = `list`、`create` = `new`、`import` = `import-cmake`、`rm` = `remove`、`cp` = `duplicate`。
`--template-dir <路径>` 对所有模板命令都生效，只影响本次运行。

`ctpl new` 的常用选项：

```
-t, --template <id>       指定模板
    --name <项目名>        指定项目名（跳过询问）
    --target <名字>        CMake target 名（默认与项目名完全一致，不做任何转换）
    --set k=v              设置任意变量（可重复），如 --set cppStandard=17
    --with a,b             勾选可选组（--without a,b 取消）
-y, --yes                  全部用默认值，不问确认
    --dry-run              只预览不写盘
    --json                 以 JSON 输出（可与 --dry-run 同用）
    --force                直接写进目标目录；同名文件覆盖前先备份
    --on-conflict=<abort|overwrite|skip>   非空目录的显式策略
    --git / --no-git       覆盖默认的 git init
    --open / --no-open     覆盖默认的"用 VS Code 打开"
    --configure            创建后跑一次 cmake 预配置
    --lenient              未定义变量不报错，替换为空串
```

### 目标目录非空会怎样

`ctpl new <目录>` 把文件写进 `<目录>`；**目录里已经有东西时不会往里塞**，而是新建一层 `<项目名>/`（`--name` 决定这层叫什么，缺省用目录名），现有文件一个字节不动。

| 情况 | 结果 |
| --- | --- |
| 不存在 / 空目录 / `ctpl new .` | 文件直接落在里面 |
| 非空目录 | 新建 `<目录>/<项目名>/`，文件放那里 |
| `--force` | 不新建一层，直接写进去（同名文件先备份为 `<名字>.bak-<时间戳>`） |
| `--on-conflict=skip` | 直接写进去，同名文件保留你的版本 |
| `--on-conflict=abort` | 拒绝，退出码 4（适合脚本） |

`--yes` 下不会停下来问，直接走默认（新建一层）并在输出里说明；交互模式会弹菜单让你选（新建一层 / 覆盖 / 跳过 / 中止），预览里列出**具体哪些文件**会冲突。

## 写自己的模板

三种方式，从最省事到最灵活。**只有想要"交互选项"时才需要碰 JSON。**

### A. 零 JSON：把自己的目录拷进去

模板就是一个目录，`files/` 里面的结构就是生成出来的工程结构：

```
path/to/templates/drop-in/
└─ files/                    ← 必须有
   ├─ CMakeLists.txt
   ├─ _gitignore             ← 前缀 _ 会还原成 .
   └─ src/core/engine.cpp    ← 嵌套层级原样保留
```

```bash
ctpl new path/to/X -t drop-in
```

不需要 `template.json`（`ctpl list` 会把它标成 `[裸模板]`）。目录约定：

| 模板里的名字 | 生成出来的名字 |
| --- | --- |
| `src/core/engine.cpp` | 原样（嵌套层级完全保留） |
| `include/{{projectNameSnake}}/app.hpp` | 目录名跟着项目名变 |
| `_gitignore` | `.gitignore` |
| `foo.txt.tpl` | `foo.txt`（去掉 `.tpl`，避开编辑器的语法检查） |
| `__if_withTests__tests/` | 条件成立时才出现的路径 |
| `_gitkeep` | 不产出文件，只用来保住空目录 |
| 完全没有文件的目录 | 自动放一个 `.gitkeep` 保住 |

内置变量可以直接用，不用声明：

`{{projectName}}`、`{{projectNameSnake}}`、`{{projectNameKebab}}`、`{{projectNameCamel}}`、`{{projectNamePascal}}`、`{{projectNameUpper}}`、`{{projectNameLower}}`、`{{targetName}}`、`{{dirName}}`、`{{author}}`、`{{email}}`、`{{year}}`、`{{date}}`、`{{datetime}}`、`{{cmakeMinVersion}}`、`{{cppStandard}}`、`{{buildDir}}`、`{{generator}}`、`{{templateId}}`、`{{templateName}}`、`{{ctplVersion}}`。

### B. 从现有工程反向生成

```bash
cd path/to/MyRender        # 一个已经调好的工程
ctpl init . --id my-render --name "渲染工程"
```

目录层级与嵌套目录原样保留；自动跳过 `build*/`、`.git/`、`.vscode/`、`compile_commands.json`、`CMakePresets.json`、`*.obj`/`*.exe` 等构建产物（`--exclude` / `--include` 可调）；从 `CMakeLists.txt` 读出 `project()` 名、`cmake_minimum_required`、`CMAKE_CXX_STANDARD`。

项目名**原样**映射成 `{{projectName}}`（不擅自转大小写或风格），源工程里出现的其它写法映射到对应的派生占位符：`MY_RENDER` → `{{projectNameUpper}}`、`my-render` → `{{projectNameKebab}}`、`myrender` → `{{projectNameLower}}`……生成的 `template.json` 不到 10 行，删掉也能用。

生成后建议走一遍：`ctpl show my-render` → `ctpl new <临时目录> -t my-render --dry-run`。

### C. 手写 JSON：需要"选项"时

用 `template.json`，或者 `template.jsonc`（可以写注释和尾逗号，手写更舒服）。每个字段都能省：

```jsonc
{
  // id / name 缺省时用目录名，schemaVersion 缺省按 1
  "variables": [
    { "key": "license", "prompt": "许可证", "type": "select",
      "choices": ["MIT", "Apache-2.0", "none"], "default": "MIT" }
  ],
  "optionalGroups": [
    { "id": "docs", "label": "文档目录", "files": ["docs/**"], "paths": ["docs"] }
  ]
}
```

对应 `ctpl new … --set license=Apache-2.0 --with docs`，或者交互式询问。完整字段表看 `schemas/template.schema.json`（指给编辑器就有补全与校验）。

文件内容里可以用 `{{变量}}`、`{{#if expr}}…{{else}}…{{/if}}`、`{{#unless expr}}…{{/unless}}`；`{{var?}}` 表示"为空时连紧邻的分隔符一起消失"。变量没定义会直接报错，并告诉你三种加法（声明 / `--set` / 改成 `{{x?}}`）。

### 微调已生成的模板

```bash
ctpl duplicate default-cpp mine    # 拿内置模板当起点
ctpl edit mine                     # 用 VS Code 打开模板目录
ctpl init . --id x --force         # 重新对着当前工程生成（原模板会先备份）
```

## 导入已有的 CMakeLists.txt

```bash
# 收进默认模板，顺便把工程名参数化
ctpl import-cmake path/to/other/CMakeLists.txt -t default-cpp --parameterize

# 放到模板内的其它位置，并加额外字面量替换
ctpl import-cmake ./ref/CMakeLists.txt -t default-cpp --to cmake/root.cmake \
  --replace-literal "old_proj_core={{targetName}}_core"
```

覆盖已有文件前会备份成 `<名字>.bak-<时间戳>`。模板里的 `CMakeLists.txt` 是纯文本，工具不做语法校验（也不需要 LSP）。

## 配置

`ctpl config` 展示当前配置。模板根目录里**只有**模板，工具自己的 `config.json` / `state.json` 放在配置目录，两者不混。

```bash
ctpl config --templates-dir path/to/templates   # 改模板根目录（会同步内置模板）
ctpl config --set defaultTemplateId=my-min
ctpl config --set defaultActions.git=false
```

内置模板的同步规则：**被删 → 自动恢复；没改过 → 随工具升级；改过 → 绝不覆盖**（只提示，`ctpl restore <id> --yes` 可以换回官方版，先备份你的）。每次运行 ctpl 都会检查一次，按内容哈希判断，不需要重启。

`ctpl init` 反向生成出来的模板是你自己的，不属于内置模板，工具不会动它。

环境变量：

| 变量 | 作用 |
| --- | --- |
| `CTPL_TEMPLATE_DIR` | 本次运行临时指定模板根目录 |
| `CTPL_CONFIG_HOME` | 覆盖配置目录（默认 `%APPDATA%\cmake-template` / `~/.config/cmake-template`） |
| `CTPL_NO_PROMPT=1`、`CI=true` | 强制非交互 |
| `NO_COLOR` | 关闭彩色输出 |
| `CTPL_FORCE_TTY=1` | 仅测试用 |

## 许可

[MIT](LICENSE) © 2026 KaaNoo
