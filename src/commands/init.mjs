import fs from 'node:fs';
import path from 'node:path';
import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { splitCsv } from '../cli/args.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import {
  exists,
  ensureDir,
  expandHome,
  isDir,
  removeTree,
  timestamp,
  writeJson,
} from '../util/fsutil.mjs';
import { isBinaryFile } from '../fsx/binary.mjs';
import { assertSafeRelPath, suggestProjectName } from '../fsx/safe.mjs';
import {
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_EXCLUDE_FILES,
  buildLiterals,
  buildPathLiterals,
  encodeRelPath,
  parameterizeText,
  readCmakeMeta,
  scanProject,
  suggestTemplateId,
} from '../template/reverse.mjs';
import { validateTemplate } from '../template/schema.mjs';
import { assertWritableTemplatesDir } from '../template/sync.mjs';
import { text } from '../prompt/text.mjs';
import { confirm } from '../prompt/confirm.mjs';
import { isInteractive } from '../prompt/raw.mjs';

function cmpVersion(a, b) {
  const pa = String(a).split('.').map((n) => Number(n) || 0);
  const pb = String(b).split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

function parseLiteralPairs(values = []) {
  const out = {};
  for (const value of values) {
    for (const part of String(value).split(',')) {
      const s = part.trim();
      if (!s) continue;
      const eq = s.indexOf('=');
      if (eq < 0) {
        fail(`--replace-literal / 额外字面量需要 old={{占位符}} 形式，收到：${s}`, { exitCode: 2 });
      }
      const literal = s.slice(0, eq).trim();
      const placeholder = s.slice(eq + 1).trim();
      if (!literal || !placeholder) fail(`字面量或占位符为空：${s}`, { exitCode: 2 });
      out[literal] = placeholder;
    }
  }
  return out;
}

export async function run(args, { flags, lists }) {
  const srcArg = args[0] || '.';
  const srcDir = path.resolve(process.cwd(), expandHome(srcArg));
  if (!isDir(srcDir)) {
    fail(`要反向生成的工程目录不存在：${srcDir}`, { code: 'E_NO_DIR', exitCode: 2 });
  }

  const cfg = loadConfig();
  const noPrompt = Boolean(flags.yes) || !isInteractive();
  const templatesDir = await resolveTemplatesDir(cfg, { allowPrompt: !noPrompt, override: flags['template-dir'] });
  assertWritableTemplatesDir(templatesDir);

  // ── 扫描 ──────────────────────────────────────────────────────
  const exclude = splitCsv(flags.exclude);
  const include = splitCsv(flags.include);
  const scan = scanProject(srcDir, { exclude, include });

  if (scan.files.length === 0) {
    fail(`没有扫描到任何可用的文件：${srcDir}\n  检查一下 --exclude / --include`, {
      code: 'E_EMPTY_SCAN',
      exitCode: 2,
    });
  }

  if (!noPrompt) {
    log.plain('');
    log.info(`扫描到 ${scan.files.length} 个文件 / ${scan.dirs.length} 个目录`);
    log.hint(
      `  已自动排除：${DEFAULT_EXCLUDE_DIRS.length + DEFAULT_EXCLUDE_FILES.length} 条默认规则（build*/、.git/、.vscode/、compile_commands.json、*.obj…）`,
    );
    const sample = [...scan.excludedDirs, ...scan.excludedFiles].slice(0, 8);
    if (sample.length) {
      const total = scan.excludedDirs.length + scan.excludedFiles.length;
      log.hint(`  实际命中：${sample.join(', ')}${total > sample.length ? ' …' : ''}`);
    }
  }

  // ── 推断 CMake 元信息 ─────────────────────────────────────────
  const meta = readCmakeMeta(srcDir);
  if (meta.from) {
    log.hint(`  从 ${meta.from} 读到：project=${meta.projectName || '?'}  minVersion=${meta.minVersion || '?'}  CXX_STANDARD=${meta.cxxStandard || '?'}`);
  } else {
    log.warn('根目录没有 CMakeLists.txt —— 生成的模板里不会有 CMake 配置');
  }

  const projectName =
    meta.projectName || suggestProjectName(path.basename(srcDir)) || 'my_project';

  // ── id / name ────────────────────────────────────────────────
  let id = flags.id;
  if (!id && !noPrompt) {
    id = await text('模板 id', {
      defaultValue: suggestTemplateId(projectName),
      validate: (v) => (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(v).trim()) ? null : '只允许字母、数字、. _ -，且以字母或数字开头'),
    });
  }
  id = String(id || suggestTemplateId(projectName)).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    fail(`模板 id 非法：${id}（只允许字母、数字、. _ -，且以字母或数字开头）`, { exitCode: 2 });
  }

  let name = flags.name;
  if (!name && !noPrompt) {
    name = await text('模板名称', { defaultValue: `${path.basename(srcDir)} 工程` });
  }
  name = String(name || `${path.basename(srcDir)} 工程`).trim();

  // ── 是否参数化 ───────────────────────────────────────────────
  let parameterize = flags.parameterize === undefined ? Boolean(meta.projectName) : Boolean(flags.parameterize);
  if (!noPrompt && meta.projectName && flags.parameterize === undefined) {
    parameterize = await confirm(
      `把项目名字面量 "${meta.projectName}" 参数化成 {{projectName}} 系列占位符？`,
      { defaultValue: true },
    );
  }

  let extra = parseLiteralPairs(lists['replace-literal'] || []);
  if (parameterize && !noPrompt) {
    const answer = await text('要额外替换的字面量（逗号分隔，形如 MyRender_core={{targetName}}_core，可留空）', {
      defaultValue: '',
    });
    extra = { ...extra, ...parseLiteralPairs([answer]) };
  }

  const literals = buildLiterals(projectName, extra);
  const pathLiterals = buildPathLiterals(projectName, extra);

  // ── 目标模板目录 ─────────────────────────────────────────────
  const dest = path.join(templatesDir, id);
  if (exists(dest)) {
    if (!flags.force) {
      if (noPrompt) {
        fail(`模板已存在：${dest}\n  用 --force 覆盖（会先备份原模板）`, { exitCode: 4 });
      }
      const ok = await confirm(`模板已存在：${dest}\n覆盖它吗？（原模板会先备份）`, {
        defaultValue: false,
      });
      if (!ok) {
        log.info('已取消，未做任何改动。');
        return 3;
      }
    }
    fs.renameSync(dest, `${dest}.bak-${timestamp()}`);
    log.warn(`原模板已备份为 ${dest}.bak-${timestamp()}`);
  }

  const destFiles = path.join(dest, 'files');
  ensureDir(destFiles);

  // ── 复制 + 参数化 ────────────────────────────────────────────
  let replacements = 0;
  let binaryCount = 0;
  const copied = [];

  for (const file of scan.files) {
    const targetRel = assertSafeRelPath(encodeRelPath(file.rel, parameterize ? pathLiterals : []), {
      what: `文件 ${file.rel}`,
    });
    const destFile = path.join(destFiles, ...targetRel.split('/'));
    ensureDir(path.dirname(destFile));

    if (isBinaryFile(file.src)) {
      fs.copyFileSync(file.src, destFile);
      binaryCount += 1;
    } else {
      const raw = fs.readFileSync(file.src, 'utf8');
      if (parameterize) {
        const result = parameterizeText(raw, literals);
        replacements += result.count;
        fs.writeFileSync(destFile, result.text, 'utf8');
      } else {
        fs.writeFileSync(destFile, raw, 'utf8');
      }
    }
    copied.push(targetRel);
  }

  // ── layout（真实目录推导；空目录 keep） ───────────────────────
  const dirsWithFiles = new Set();
  for (const file of copied) {
    const segs = file.split('/');
    segs.pop();
    for (let i = 1; i <= segs.length; i++) dirsWithFiles.add(segs.slice(0, i).join('/'));
  }

  const layout = [];
  for (const dir of scan.dirs) {
    const rel = assertSafeRelPath(encodeRelPath(dir, parameterize ? pathLiterals : []), {
      what: `目录 ${dir}`,
    });
    if (layout.some((d) => d.path === rel)) continue;
    // 有文件的目录不用写：files/ 里的文件本来就会建出父目录
    if (dirsWithFiles.has(rel)) continue;
    layout.push({ path: rel, keep: true });
  }
  layout.sort((a, b) => (a.path < b.path ? -1 : 1));

  // ── template.json ────────────────────────────────────────────
  const minVersionOk = meta.minVersion && cmpVersion(meta.minVersion, '3.5') >= 0;
  const cmake = { buildDir: 'build', standard: meta.cxxStandard || '11', generator: 'Ninja' };
  if (minVersionOk) cmake.minVersion = meta.minVersion;
  if (meta.minVersion && !minVersionOk) {
    log.warn(
      `源工程声明的 cmake_minimum_required(VERSION ${meta.minVersion}) 过旧，` +
        `CMake 4.x 会直接报错 —— 已改用默认的 3.20（请手动确认）`,
    );
  } else if (minVersionOk && cmpVersion(meta.minVersion, '3.20') < 0) {
    log.warn(`cmake.minVersion=${meta.minVersion} 偏旧，建议改成 3.20`);
  }

  // 只写“有意义”的字段：其余全部按约定（files/ 目录 + 内置变量），
  // 所以这份 template.json 通常不到 10 行，而且删掉它也能用。
  // 不写 description：“由 X 反向生成（日期）”这种自动生成的说明是噪音，
  // 想要一句话说明就在 template.json 里自己加。
  const templateJson = {
    schemaVersion: 1,
    id,
    name,
    cmake,
  };
  if (layout.length) {
    templateJson.layout = layout; // 只为了保住空目录（keep）
  }

  const { errors, warnings } = validateTemplate(templateJson);
  if (errors.length) {
    removeTree(dest);
    fail(`生成的 template.json 没通过校验（已回滚）：\n${errors.map((e) => `  ✘ ${e}`).join('\n')}`, {
      code: 'E_BAD_TEMPLATE',
    });
  }

  writeJson(path.join(dest, 'template.json'), templateJson);

  // ── 报告 ─────────────────────────────────────────────────────
  log.ok(`已生成模板 ${id} → ${dest}`);
  log.plain(`   ${copied.length} 个文件已复制${binaryCount ? `（其中二进制 ${binaryCount} 个）` : ''}`);
  if (parameterize) log.plain(`   参数化替换 ${replacements} 处（字面量 ${literals.length} 条）`);
  if (layout.length) log.plain(`   空目录 ${layout.length} 个（layout 里用 keep 保住）`);
  for (const w of warnings) log.warn(w);

  log.plain('');
  log.hint('试试看：');
  log.hint(`  ctpl show ${id}                      # 检查渲染后的目录结构`);
  log.hint(`  ctpl new <某个临时目录> -t ${id} --dry-run`);
  log.hint(`  ctpl edit ${id}                      # 用 VS Code 打开继续调整`);
  log.hint('');
  log.hint('template.json 是可选的，里面只有 id/name/cmake 几条：');
  log.hint('  · 想加选项（变量、可选的 tests 组）→ 往 variables / optionalGroups 里加');
  log.hint('  · 想在 ctpl list 里显示一句说明 → 自己加一条 description');
  log.hint('  · 完全不想碰 JSON → 直接删掉 template.json，模板照样能用');
  log.hint('注意：模板里以 _ 开头的文件名会被约定还原成 . 开头（.gitignore → _gitignore），');
  log.hint('      源工程里本来就叫 _foo 的文件需要手动改名。');
  return 0;
}
