import fs from 'node:fs';
import path from 'node:path';
import { listDir, isFile } from '../util/fsutil.mjs';
import { matchAny, matchGlob } from '../util/glob.mjs';
import { deriveNames } from './naming.mjs';

/**
 * `ctpl init` 的反向工程：
 *   扫描已有工程 → 套用排除表 → 推断 CMake 元信息 → 把项目名字面量换成 {{占位符}}
 */

export const DEFAULT_EXCLUDE_DIRS = [
  /^\.git$/,
  /^\.vs$/,
  /^\.vscode$/,
  /^\.idea$/,
  /^\.cache$/,
  /^\.ctpl/,
  /^build$/,
  /^build-/,
  /^out$/,
  /^cmake-build-/,
  /^CMakeFiles$/,
  /^node_modules$/,
  /^__pycache__$/,
  /^\.mypy_cache$/,
];

export const DEFAULT_EXCLUDE_FILES = [
  /^CMakeCache\.txt$/,
  /^cmake_install\.cmake$/,
  /^CTestTestfile\.cmake$/,
  /^CTestCustom\.cmake$/,
  /^compile_commands\.json$/,
  /^CMakePresets\.json$/,
  /^CMakeUserPresets\.json$/,
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /\.(o|obj|exe|dll|lib|a|so|dylib|pdb|ilk|exp|d|swp|swo|tmp|log|ninja_deps|ninja_log)$/i,
];

/** include 里的模式是否“覆盖”了这条路径（用于 --include 反悔排除）。 */
function includeCovers(rel, include) {
  return include.some((pattern) => {
    if (matchGlob(rel, pattern)) return true;
    // ".vscode/**" 也要能放行目录本身
    const anchor = pattern.replace(/\/\*\*.*$/, '').replace(/\/\*$/, '');
    return anchor === rel || anchor.startsWith(`${rel}/`);
  });
}

/**
 * 扫描工程目录。
 * 返回 { files: [{rel, src}], dirs: [rel], excludedDirs: [], excludedFiles: [] }
 */
export function scanProject(srcDir, { exclude = [], include = [] } = {}) {
  const files = [];
  const dirs = [];
  const excludedDirs = [];
  const excludedFiles = [];

  const visit = (dir, prefix) => {
    const entries = listDir(dir).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of entries) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;

      if (ent.isDirectory()) {
        const byDefault = DEFAULT_EXCLUDE_DIRS.some((re) => re.test(ent.name));
        const byUser = matchAny(rel, exclude);
        if ((byDefault || byUser) && !includeCovers(rel, include)) {
          excludedDirs.push(rel);
          continue;
        }
        dirs.push(rel);
        visit(path.join(dir, ent.name), rel);
        continue;
      }

      if (ent.isFile()) {
        const byDefault = DEFAULT_EXCLUDE_FILES.some((re) => re.test(ent.name));
        const byUser = matchAny(rel, exclude);
        if ((byDefault || byUser) && !includeCovers(rel, include)) {
          excludedFiles.push(rel);
          continue;
        }
        files.push({ rel, src: path.join(dir, ent.name) });
      }
    }
  };

  visit(srcDir, '');
  return { files, dirs, excludedDirs, excludedFiles };
}

/** 从 CMakeLists.txt 里抠出 project 名 / 最低版本 / C++ 标准。 */
export function inferCmakeMeta(text) {
  const src = String(text ?? '');
  const project = /^[ \t]*project\s*\(\s*([A-Za-z_][A-Za-z0-9_.+-]*)/m.exec(src);
  const minReq = /^[ \t]*cmake_minimum_required\s*\(\s*VERSION\s+([0-9]+(?:\.[0-9]+){0,2})/im.exec(src);
  const std =
    /set\s*\(\s*CMAKE_CXX_STANDARD\s+([0-9]{2})\s*\)/i.exec(src) ||
    /CXX_STANDARD\s+([0-9]{2})/.exec(src);
  return {
    projectName: project ? project[1] : null,
    minVersion: minReq ? minReq[1] : null,
    cxxStandard: std ? std[1] : null,
  };
}

export function readCmakeMeta(srcDir) {
  const root = path.join(srcDir, 'CMakeLists.txt');
  if (!isFile(root)) return { projectName: null, minVersion: null, cxxStandard: null, from: null };
  try {
    return { ...inferCmakeMeta(fs.readFileSync(root, 'utf8')), from: 'CMakeLists.txt' };
  } catch {
    return { projectName: null, minVersion: null, cxxStandard: null, from: null };
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 构建"字面量 → 占位符"映射表（长度降序，避免部分替换）。
 * 若项目名本身就是 snake_case，则精确字面量优先映射到 {{projectNameSnake}}，
 * 因为 snake 形式在代码/文件名里几乎总是"目录名/target 名"语境。
 */
export function buildLiterals(projectName, extra = {}) {
  const names = deriveNames(projectName);
  const exactIsSnake =
    projectName === names.projectNameSnake && projectName === projectName.toLowerCase();

  const map = new Map();
  const put = (literal, placeholder) => {
    if (!literal) return;
    if (!map.has(literal)) map.set(literal, placeholder);
  };

  put(projectName, exactIsSnake ? '{{projectNameSnake}}' : '{{projectName}}');
  put(names.projectNameSnake, '{{projectNameSnake}}');
  put(names.projectNameUpper, '{{projectNameUpper}}');
  put(names.projectNameKebab, '{{projectNameKebab}}');
  put(names.projectNameLower, '{{projectNameLower}}');
  put(names.projectNameCamel, '{{projectNameCamel}}');
  put(names.projectNamePascal, '{{projectNamePascal}}');

  for (const [literal, placeholder] of Object.entries(extra)) put(literal, placeholder);

  return [...map.entries()]
    .filter(([literal, placeholder]) => literal && placeholder)
    .sort((a, b) => b[0].length - a[0].length);
}

/** 目录名/文件名要优先按风格替换（目录里 snake/kebab 更常见）。 */
export function buildPathLiterals(projectName, extra = {}) {
  const names = deriveNames(projectName);
  const ordered = [
    [names.projectNameSnake, '{{projectNameSnake}}'],
    [names.projectNameKebab, '{{projectNameKebab}}'],
    [projectName, '{{projectName}}'],
    [names.projectNameUpper, '{{projectNameUpper}}'],
    [names.projectNameLower, '{{projectNameLower}}'],
    [names.projectNameCamel, '{{projectNameCamel}}'],
    [names.projectNamePascal, '{{projectNamePascal}}'],
    ...Object.entries(extra),
  ];
  const map = new Map();
  for (const [literal, placeholder] of ordered) {
    if (literal && !map.has(literal)) map.set(literal, placeholder);
  }
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length);
}

/**
 * 把字面量替换成占位符。
 *
 * 边界只算字母/数字（不算下划线），因为宏名/ target 名正是 `SRC_1_NAME`、`src_1_core`
 * 这种“字面量 + 下划线 + 后缀”的形状，必须能替换到；
 * 而 `MyRender2D` 里的 `MyRender` 会被后面的数字挡住，不会误伤。
 */
export function parameterizeText(text, literals) {
  let out = String(text);
  let count = 0;
  for (const [literal, placeholder] of literals) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(literal)}(?![A-Za-z0-9])`, 'g');
    out = out.replace(re, () => {
      count += 1;
      return placeholder;
    });
  }
  return { text: out, count };
}

/**
 * 模板内的文件名编码：`files/` 下以 `.` 开头的名字要写成 `_` 开头，
 * 因为模板约定 `_x` → `.x`。
 */
export function encodeSegment(name) {
  return name.startsWith('.') ? `_${name.slice(1)}` : name;
}

/** 逐段处理相对路径：编码点文件 + 替换变量。 */
export function encodeRelPath(rel, literals) {
  return rel
    .split('/')
    .map((seg) => {
      const { text } = parameterizeText(encodeSegment(seg), literals);
      return text;
    })
    .join('/');
}

/** 由项目名/目录名推一个合法的模板 id。 */
export function suggestTemplateId(input) {
  const id = deriveNames(String(input ?? '')).projectNameKebab
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-{2,}/g, '-')
    .replace(/[-.]+$/, '');
  return id || 'my-template';
}
