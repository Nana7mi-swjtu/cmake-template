import fs from 'node:fs';
import path from 'node:path';
import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { findTemplate } from '../template/registry.mjs';
import { ensureDir, exists, expandHome, isDir, isFile, timestamp } from '../util/fsutil.mjs';
import { assertSafeRelPath } from '../fsx/safe.mjs';
import { assertWritableTemplatesDir } from '../template/sync.mjs';
import { buildLiterals, inferCmakeMeta, parameterizeText } from '../template/reverse.mjs';
import { text } from '../prompt/text.mjs';
import { confirm } from '../prompt/confirm.mjs';
import { isInteractive } from '../prompt/raw.mjs';

function parseLiteralPairs(values = []) {
  const out = {};
  for (const value of values) {
    for (const part of String(value).split(',')) {
      const s = part.trim();
      if (!s) continue;
      const eq = s.indexOf('=');
      if (eq < 0) fail(`--replace-literal 需要 old={{占位符}} 形式：${s}`, { exitCode: 2 });
      out[s.slice(0, eq).trim()] = s.slice(eq + 1).trim();
    }
  }
  return out;
}

/**
 * `ctpl import-cmake <路径>`：把现成的 CMakeLists.txt 导入某个模板（R4 的"导入"半边）。
 */
export async function run(args, { flags, lists }) {
  const srcArg = args[0];
  if (!srcArg) {
    fail(
      '用法：ctpl import-cmake <CMakeLists.txt 路径> [--template <id>] [--to <相对路径>] [--parameterize]',
      { exitCode: 2 },
    );
  }

  let srcFile = path.resolve(process.cwd(), expandHome(srcArg));
  if (isDir(srcFile)) srcFile = path.join(srcFile, 'CMakeLists.txt');
  if (!isFile(srcFile)) fail(`找不到文件：${srcFile}`, { code: 'E_NO_FILE', exitCode: 2 });

  const cfg = loadConfig();
  const noPrompt = Boolean(flags.yes) || !isInteractive();
  const templatesDir = await resolveTemplatesDir(cfg, { allowPrompt: !noPrompt, override: flags['template-dir'] });
  assertWritableTemplatesDir(templatesDir);
  const template = findTemplate(templatesDir, flags.template || cfg.defaultTemplateId);

  const to = assertSafeRelPath(String(flags.to || 'CMakeLists.txt'), { what: '--to' });
  const dest = path.join(template.dir, 'files', ...to.split('/'));

  const raw = fs.readFileSync(srcFile, 'utf8');
  const meta = inferCmakeMeta(raw);

  // ── 参数化 ───────────────────────────────────────────────────
  let extra = parseLiteralPairs(lists['replace-literal'] || []);
  const hasExtra = Object.keys(extra).length > 0;

  // 显式 --no-parameterize 优先；--parameterize 或给了字面量则必定参数化
  let parameterize =
    flags.parameterize === undefined
      ? hasExtra || Boolean(meta.projectName)
      : Boolean(flags.parameterize);

  let literalToReplace = meta.projectName;

  if (parameterize && !noPrompt && !hasExtra) {
    if (meta.projectName) {
      parameterize = await confirm(
        `把工程名 "${meta.projectName}" 参数化成 {{projectName}} 系列占位符？`,
        { defaultValue: true },
      );
    } else {
      literalToReplace = await text('要参数化的字面量（留空 = 只做原样导入）', {
        defaultValue: '',
      });
      parameterize = Boolean(String(literalToReplace).trim());
    }
  }

  if (parameterize && !noPrompt) {
    const answer = await text('要额外替换的字面量（逗号分隔，形如 MyRender_core={{targetName}}_core，可留空）', {
      defaultValue: '',
    });
    extra = { ...extra, ...parseLiteralPairs([answer]) };
  }

  // ── 写入 ─────────────────────────────────────────────────────
  if (exists(dest)) {
    if (!noPrompt) {
      const ok = await confirm(`将覆盖 ${dest}（原内容会先备份）`, { defaultValue: true });
      if (!ok) {
        log.info('已取消，未做任何改动。');
        return 3;
      }
    }
    const backup = `${dest}.bak-${timestamp()}`;
    fs.copyFileSync(dest, backup);
    log.warn(`原文件已备份为 ${path.basename(backup)}`);
  }

  ensureDir(path.dirname(dest));

  let finalText = raw;
  let replacements = 0;
  if (parameterize) {
    const literals = buildLiterals(literalToReplace || meta.projectName || '', extra);
    const result = parameterizeText(raw, literals);
    finalText = result.text;
    replacements = result.count;
  }
  fs.writeFileSync(dest, finalText, 'utf8');

  log.ok(`已导入 ${srcFile} → ${dest}`);
  log.plain(
    `   ${finalText.split('\n').length} 行${parameterize ? `，参数化替换 ${replacements} 处` : '，原样导入（未参数化）'}`,
  );
  log.plain(`   目标模板：${template.id}${template.builtin ? '（内置）' : ''}；模板内路径：files/${to}`);

  if (parameterize && replacements === 0) {
    log.warn('一处都没替换到 —— 检查字面量是否写对了（大小写敏感）');
  }

  log.plain('');
  log.hint(`检查：ctpl show ${template.id}`);
  log.hint(`试跑：ctpl new <临时目录> -t ${template.id} --dry-run`);
  log.hint('提示：模板内的 CMakeLists.txt 以纯文本维护，工具不做语法校验。');
  return 0;
}
