import path from 'node:path';
import { walkFiles, isDir, listDir } from '../util/fsutil.mjs';
import { fail } from '../util/errors.mjs';
import { assertSafeRelPath } from '../fsx/safe.mjs';
import { isBinaryFile } from '../fsx/binary.mjs';
import { renderText } from './render.mjs';
import { evalExpr } from './expr.mjs';
import { matchGlob } from '../util/glob.mjs';

const IF_PREFIX = /^__if_(.+?)__(.*)$/;

/**
 * 把一个相对路径逐段套上约定：
 *   __if_x__name  条件段（为假则整条跳过）
 *   _name         → .name（.gitignore → _gitignore）
 *   {{var}}       渲染
 * _gitkeep 是特例：它不生成文件，只表示“这个目录要保留”。
 */
function applyConventions(rel, vars) {
  const outSegs = [];
  for (const seg of String(rel).split('/')) {
    let s = seg;
    const cond = IF_PREFIX.exec(s);
    if (cond) {
      if (!evalExpr(cond[1], vars)) return { skip: true };
      s = cond[2];
    }
    if (s === '_gitkeep') return { skip: true, keep: outSegs.join('/') };
    s = renderText(s, vars, { pathMode: true });
    if (s.startsWith('_')) s = '.' + s.slice(1);
    outSegs.push(s);
  }
  return { skip: false, segs: outSegs };
}

/**
 * files/ 里“完全没有文件”的目录（递归看）。
 * 空目录没法靠复制保留，得靠 .gitkeep —— 否则用户建的空目录会静静消失。
 */
function emptyDirs(filesRoot) {
  const out = [];
  const visit = (dir, prefix) => {
    let hasFile = false;
    for (const ent of listDir(dir).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!ent.isDirectory()) {
        hasFile = true;
        continue;
      }
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (visit(path.join(dir, ent.name), rel)) hasFile = true;
    }
    if (prefix && !hasFile) out.push(prefix);
    return hasFile;
  };
  visit(filesRoot, '');
  return out.sort();
}

/**
 * 展开模板的 files/ 目录（约定映射）+ 模板里声明的 files[] 显式规则。
 * 返回 { files, keepDirs }
 *   files:    [{ src, rel, render, binary, group, when, onConflict, eol }]
 *   keepDirs: 需要写 .gitkeep 的相对目录集合
 */
export function collectFiles(templateDir, template, vars, { selectedGroups = [] } = {}) {
  const filesRoot = path.join(templateDir, 'files');
  const groups = template.optionalGroups || [];
  const files = [];
  const keepDirs = new Set();
  const claimed = new Map(); // rel -> src，用于查重

  /** 判断某个目标相对路径属于哪个目录组（没有则 null）。 */
  const groupOf = (rel) => {
    for (const g of groups) {
      for (const pattern of g.files || []) {
        if (matchGlob(rel, pattern)) return g;
      }
    }
    return null;
  };

  if (isDir(filesRoot)) {
    // 先处理空目录（layout 里没有它就没人会去建）
    for (const rel of emptyDirs(filesRoot)) {
      const mapped = applyConventions(rel, vars);
      if (mapped.skip) continue;
      keepDirs.add(assertSafeRelPath(mapped.segs.join('/'), { what: `空目录 files/${rel}` }));
    }

    for (const rel of walkFiles(filesRoot)) {
      const src = path.join(filesRoot, rel);
      const mapped = applyConventions(rel, vars);
      if (mapped.skip) {
        if (mapped.keep) keepDirs.add(mapped.keep);
        continue;
      }
      const outSegs = mapped.segs;

      const last = outSegs[outSegs.length - 1];
      if (last.endsWith('.tpl')) outSegs[outSegs.length - 1] = last.slice(0, -4);

      const to = assertSafeRelPath(outSegs.join('/'), { what: `files/${rel} 的目标路径` });
      const group = groupOf(rel) || groupOf(to);
      if (group && !selectedGroups.includes(group.id)) continue;
      claimed.set(to, src);
      files.push({
        src,
        rel: to,
        render: true,
        binary: isBinaryFile(src),
        group: group ? group.id : null,
        when: null,
        onConflict: null,
        eol: 'preserve',
      });
    }
  }

  // 显式规则（覆盖约定映射）
  for (const rule of template.files || []) {
    if (!rule || !rule.from || !rule.to) {
      fail('files[] 里的每条规则都需要 from 与 to');
    }
    const to = assertSafeRelPath(renderText(rule.to, vars, { pathMode: true }), {
      what: 'files[].to',
    });
    if (rule.when && !evalExpr(rule.when, vars)) continue;

    const src = path.resolve(templateDir, renderText(rule.from, vars, { pathMode: true }));
    const insideTemplate = path.relative(templateDir, src);
    const escaped = insideTemplate.startsWith('..') || path.isAbsolute(insideTemplate);

    if (claimed.has(to)) {
      fail(`files[] 里的 "${to}" 与另一条规则/约定文件冲突，请消除歧义`);
    }
    claimed.set(to, src);

    files.push({
      src,
      rel: to,
      render: rule.render === undefined ? !escaped : Boolean(rule.render),
      binary: rule.binary === undefined ? isBinaryFile(src) : Boolean(rule.binary),
      group: rule.group || null,
      when: rule.when || null,
      onConflict: rule.onConflict || null,
      eol: rule.eol || 'preserve',
      outsideTemplate: escaped,
    });
  }

  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return { files, keepDirs };
}
