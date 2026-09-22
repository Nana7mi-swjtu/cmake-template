import path from 'node:path';
import { isDir, exists, ensureDir, expandHome, isEmptyDir, listDir } from '../util/fsutil.mjs';
import { fail } from '../util/errors.mjs';
import { log } from '../util/log.mjs';
import { saveConfig } from './store.mjs';
import { syncBuiltinTemplates } from '../template/sync.mjs';
import { text } from '../prompt/text.mjs';
import { confirm } from '../prompt/confirm.mjs';
import { isInteractive } from '../prompt/raw.mjs';

/**
 * 模板根目录的校验：非空 + 绝对路径 + 不是文件。
 * 决策 #7：不提供任何默认值，必须用户手填。
 */
export function validateTemplatesDirInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '不能为空 —— 模板根目录没有默认值，必须自己填写绝对路径';
  const expanded = expandHome(raw);
  if (!path.isAbsolute(expanded)) {
    return `必须是绝对路径，例如 C:\\path\\to\\templates（你填的是 ${raw}）`;
  }
  if (exists(expanded) && !isDir(expanded)) {
    return '该路径已存在但不是一个目录';
  }
  if (expanded.length > 180) {
    return '路径过长（超过 180 字符），换一个更浅的目录';
  }
  return null;
}

/**
 * 取得可用的模板根目录：
 *   1. 已配置且存在        → 直接用
 *   2. 已配置但不存在      → 重新询问（决策 #7：不预填，也不自动挑目录）
 *   3. 从未配置            → 询问
 * 询问成功后会创建目录、写入 config.json、并把内置模板同步进去。
 */
export async function resolveTemplatesDir(cfg, { allowPrompt = true, override = null } = {}) {
  // --template-dir：单次运行的临时覆盖（优先级最高，不写入配置）
  if (override) {
    const dir = path.resolve(process.cwd(), expandHome(String(override)));
    if (!isDir(dir)) {
      fail(`--template-dir 指向的目录不存在：${dir}`, { code: 'E_NO_DIR', exitCode: 2 });
    }
    syncBuiltinTemplates(dir, { log });
    return dir;
  }

  // 单次运行的临时覆盖（不写入配置），见 §3.2
  const envDir = process.env.CTPL_TEMPLATE_DIR;
  if (envDir && envDir.trim()) {
    const dir = path.resolve(expandHome(envDir.trim()));
    if (!isDir(dir)) {
      fail(`环境变量 CTPL_TEMPLATE_DIR 指向的目录不存在：${dir}`, {
        code: 'E_NO_DIR',
        exitCode: 2,
      });
    }
    syncBuiltinTemplates(dir, { log });
    return dir;
  }

  const configured = cfg.templatesDir;

  if (configured && isDir(configured)) {
    syncBuiltinTemplates(configured, { log });
    return configured;
  }

  if (configured && !isDir(configured)) {
    log.warn(`模板根目录已不存在：${configured}`);
    log.hint('可能被移动或删除了 —— 请重新指定一个目录（不会自动帮你挑）。');
  }

  if (!allowPrompt || !isInteractive()) {
    fail(
      '尚未配置模板根目录，且当前是非交互环境。\n' +
        '  请先执行： ctpl config --templates-dir <绝对路径>\n' +
        '  或用本次运行临时覆盖： ctpl <命令> --template-dir <绝对路径>',
      { code: 'E_NO_TEMPLATES_DIR', exitCode: 2 },
    );
  }

  log.plain('');
  log.info('第一次使用需要指定模板存放目录。');
  log.hint('提示：这一项没有默认值，必须手动填写；按 Ctrl+C 可退出。');

  for (;;) {
    const answer = await text('模板根目录（绝对路径）', {
      required: true,
      validate: validateTemplatesDirInput,
    });
    const dir = path.resolve(expandHome(String(answer).trim()));

    if (!exists(dir)) {
      const create = await confirm(`目录不存在，创建它？ ${dir}`, { defaultValue: true });
      if (!create) continue;
      ensureDir(dir);
      log.ok(`已创建 ${dir}`);
    } else if (isEmptyDir(dir)) {
      log.hint(`目录已存在且为空，直接使用：${dir}`);
    } else {
      const names = listDir(dir).filter((e) => e.isDirectory()).map((e) => e.name);
      log.warn(`目录已存在且非空（${names.length} 个子目录）。`);
      const use = await confirm('仍然使用它？', { defaultValue: true });
      if (!use) continue;
    }

    cfg.templatesDir = dir;
    const saved = saveConfig(cfg);
    log.ok(`模板根目录已记录到 ${saved}`);
    syncBuiltinTemplates(dir, { log });
    return dir;
  }
}

/** 修改模板根目录（`ctpl config --templates-dir`），同样要求手填。 */
export async function changeTemplatesDir(cfg, newDir, { assumeYes = false } = {}) {
  const problem = validateTemplatesDirInput(newDir);
  if (problem) fail(problem, { code: 'E_BAD_DIR', exitCode: 2 });
  const dir = path.resolve(expandHome(String(newDir).trim()));

  if (cfg.templatesDir && cfg.templatesDir !== dir && isDir(cfg.templatesDir)) {
    log.warn(`当前模板根目录：${cfg.templatesDir}`);
    if (!assumeYes) {
      const copy = await confirm('要把已有模板复制到新目录吗？（否则只切换路径）', {
        defaultValue: true,
      });
      if (copy) {
        const { copyTree } = await import('../util/fsutil.mjs');
        for (const ent of listDir(cfg.templatesDir)) {
          if (!ent.isDirectory()) continue;
          copyTree(path.join(cfg.templatesDir, ent.name), path.join(dir, ent.name));
          log.ok(`已复制 ${ent.name}`);
        }
      }
    }
  }

  ensureDir(dir);
  cfg.templatesDir = dir;
  saveConfig(cfg);
  syncBuiltinTemplates(dir, { log });
  return dir;
}
