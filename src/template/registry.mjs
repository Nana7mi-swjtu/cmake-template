import path from 'node:path';
import { isDir, listDir } from '../util/fsutil.mjs';
import { fail } from '../util/errors.mjs';
import { tryLoadTemplate } from './loader.mjs';

/** `ctpl restore` 产生的备份目录，不能当成模板。 */
const BACKUP_DIR_RE = /\.bak-\d{8}-\d{6}$/;

/**
 * 扫描模板根目录。模板一律来自这一个目录（§3.2 决策 #4），
 * 不做多来源合并。
 */
export function listTemplates(templatesDir) {
  if (!isDir(templatesDir)) {
    fail(`模板根目录不存在：${templatesDir}\n  用 ctpl config --templates-dir <绝对路径> 重新指定`, {
      code: 'E_NO_DIR',
      exitCode: 2,
    });
  }

  const entries = listDir(templatesDir)
    .filter((e) => e.isDirectory())
    .filter((e) => !e.name.startsWith('.') && !BACKUP_DIR_RE.test(e.name))
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  const out = [];
  for (const ent of entries) {
    const dir = path.join(templatesDir, ent.name);
    const loaded = tryLoadTemplate(dir);
    if (loaded.ok) {
      out.push({
        id: loaded.json.id || ent.name,
        dirName: ent.name,
        dir,
        json: loaded.json,
        warnings: loaded.warnings,
        builtin: Boolean(loaded.json._builtin),
        bare: Boolean(loaded.bare),
        source: loaded.source,
        error: null,
      });
    } else {
      out.push({
        id: ent.name,
        dirName: ent.name,
        dir,
        json: null,
        warnings: [],
        builtin: false,
        bare: false,
        source: null,
        error: loaded.error,
      });
    }
  }
  return out;
}

export function findTemplate(templatesDir, id) {
  const all = listTemplates(templatesDir);
  const wanted = String(id);
  const lower = wanted.toLowerCase();
  const hit =
    all.find((t) => t.id === wanted || t.dirName === wanted) ||
    // 模板 id 允许大小写混合，所以大小写不一致也认（仅作退而求其次）
    all.find((t) =>
      t.error ? false : t.id.toLowerCase() === lower || t.dirName.toLowerCase() === lower,
    );
  if (!hit) {
    const ids = all.map((t) => t.id).join(', ') || '(空目录)';
    fail(`找不到模板 "${id}"。\n  模板根目录：${templatesDir}\n  可用模板：${ids}`, {
      code: 'E_NO_TEMPLATE',
      exitCode: 2,
    });
  }
  if (hit.error) {
    fail(`模板 "${hit.id}" 无法使用：\n  ${hit.error}`, { code: 'E_BAD_TEMPLATE' });
  }
  return hit;
}
