import { assertSafeRelPath } from '../fsx/safe.mjs';
import { fail } from '../util/errors.mjs';
import { renderText } from './render.mjs';

/**
 * 把 layout 的三种写法归一化成有序的显式条目列表：
 *   ["src", "src/app"]
 *   { "src": { "app": {} }, "docs": null }        // null / "_file" 表示文件占位
 *   [{ path: "src", keep: true, when: "withX" }]
 *
 * 返回 [{ rel, keep, when, optional, default, label, file }]
 */
export function normalizeLayout(layout, { vars = {} } = {}) {
  const rawItems = [];

  if (layout === undefined || layout === null) {
    return [];
  }

  if (Array.isArray(layout)) {
    for (const entry of layout) {
      if (typeof entry === 'string') rawItems.push({ path: entry });
      else if (entry && typeof entry === 'object' && !Array.isArray(entry)) rawItems.push({ ...entry });
      else fail(`layout 里的条目必须是字符串或对象：${JSON.stringify(entry)}`);
    }
  } else if (typeof layout === 'object') {
    const walk = (node, prefix) => {
      for (const [key, value] of Object.entries(node)) {
        const rel = prefix ? `${prefix}/${key}` : key;
        if (value === null || value === '_file') {
          rawItems.push({ path: rel, file: true });
          continue;
        }
        rawItems.push({ path: rel });
        if (value && typeof value === 'object') walk(value, rel);
      }
    };
    walk(layout, '');
  } else {
    fail('layout 必须是数组或对象');
  }

  const seen = new Set();
  const out = [];
  for (const item of rawItems) {
    if (!item.path) fail('layout 条目缺少 path');
    const rendered = renderText(item.path, vars, { pathMode: true });
    const rel = assertSafeRelPath(rendered, { what: 'layout 路径' });
    if (seen.has(rel)) fail(`layout 里重复声明了同一路径：${rel}`);
    seen.add(rel);
    out.push({
      rel,
      keep: Boolean(item.keep),
      when: item.when || null,
      optional: Boolean(item.optional),
      default: item.default === undefined ? false : Boolean(item.default),
      label: item.label || null,
      file: Boolean(item.file),
    });
  }

  out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return out;
}

/** 某条路径的所有父目录（从浅到深）。 */
export function parentDirs(rel) {
  const segs = String(rel).split('/').filter(Boolean);
  segs.pop();
  const out = [];
  for (let i = 1; i <= segs.length; i++) out.push(segs.slice(0, i).join('/'));
  return out;
}
