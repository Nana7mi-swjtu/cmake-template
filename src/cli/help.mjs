import { c } from '../util/color.mjs';

export const USAGE = `${c.bold('ctpl')} —— 交互式 CMake 项目模板工具

${c.bold('用法')}
  ctpl <命令> [选项]

${c.bold('命令')}
  new [目录]                交互式创建工程（核心命令）
  list                      列出模板根目录下的模板
  show <id>                 查看某个模板的详情与目录结构
  init [工程目录]           把已有工程反向生成一个模板
  import-cmake <路径>       把现成的 CMakeLists.txt 导入某个模板
  edit <id>                 用 VS Code 打开模板目录
  duplicate <源id> <新id>   复制模板作为新模板的起点
  remove <id>               删除模板（内置模板下次启动会自动恢复）
  restore <id>              从随包副本强制恢复内置模板（先备份）
  config                    查看工具配置
  doctor                    环境自检（cmake / ninja / gcc / git / code）

${c.bold('init 常用选项')}
      --id <模板id>          模板 id（默认由项目名推导）
      --name <显示名>        模板显示名
      --exclude a,b          ...额外的排除 glob（可重复）
      --include a,b          反悔默认排除（可重复），如 .vscode/**
      --replace-literal o=v  额外字面量替换，如 MyRender_core={{targetName}}_core
      --no-parameterize      不做字面量替换，原样照搬
      --force                模板已存在时覆盖（先备份）
  -y, --yes                  不问确认

${c.bold('import-cmake 常用选项')}
      --template <id>        导入到哪个模板（默认用配置里的默认模板）
      --to <相对路径>        模板内的目标路径（默认 CMakeLists.txt）
      --parameterize         把工程名参数化成 {{projectName}}
      --replace-literal o=v  额外字面量替换（可重复）
  -y, --yes                  不问确认

${c.bold('new 常用选项')}
  -t, --template <id>       指定模板
      --name <项目名>        指定项目名（跳过询问）
      --target <target名>    指定 CMake target 名
      --set k=v              设置任意变量（可重复）
      --with a,b             勾选可选组
      --without a,b          取消勾选可选组
  -y, --yes                 全部使用默认值，不问确认
      --dry-run             只打印将要创建的内容，不写盘
      --json                以 JSON 输出结果
      --force               目标目录非空时覆盖
      --git / --no-git      是否 git init
      --open / --no-open    是否用 VS Code 打开
      --configure           创建后执行一次 cmake 预配置
      --template-dir <路径> 本次运行临时指定模板根目录（不写入配置）
      --lenient             未定义变量不报错，替换为空串

${c.bold('其他')}
  ctpl config --templates-dir <绝对路径>   修改模板根目录（会同步内置模板）
  ctpl config --set defaultTemplateId=<id>
  ctpl config --set defaultActions.git=false
  ctpl restore <id> --yes
  ctpl --version | -h
`;

export function commandHelp(command) {
  switch (command) {
    case 'new':
      return '用法：ctpl new [目录] [-t <模板id>] [--name 项目名] [--set k=v]... [-y] [--dry-run]';
    case 'list':
      return '用法：ctpl list [--json]';
    case 'show':
      return '用法：ctpl show <模板id> [--json]';
    case 'edit':
      return '用法：ctpl edit <模板id> [--plain]';
    case 'init':
      return '用法：ctpl init [工程目录] [--id <模板id>] [--name <显示名>] [--exclude a,b] [--include a,b] [--no-parameterize] [--force] [-y]';
    case 'import-cmake':
      return '用法：ctpl import-cmake <CMakeLists.txt 路径> [--template <id>] [--to <相对路径>] [--parameterize] [--replace-literal o=v]';
    case 'duplicate':
      return '用法：ctpl duplicate <源模板id> <新模板id> [--name <显示名>]';
    case 'remove':
      return '用法：ctpl remove <模板id> [--yes]';
    case 'restore':
      return '用法：ctpl restore <模板id> [--yes]';
    case 'config':
      return '用法：ctpl config [--templates-dir <绝对路径>] [--set key=value]';
    case 'doctor':
      return '用法：ctpl doctor [--json]';
    default:
      return USAGE;
  }
}
