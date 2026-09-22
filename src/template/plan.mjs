import fs from 'node:fs';
import path from 'node:path';
import { exists, isDir, isFile, ensureDir, listDir, fmtBytes, walkFiles } from '../util/fsutil.mjs';
import { fail } from '../util/errors.mjs';
import { assertSafeRelPath } from '../fsx/safe.mjs';
import { renderText } from './render.mjs';
import { evalExpr } from './expr.mjs';
import { normalizeLayout, parentDirs } from './layout.mjs';
import { collectFiles } from './walk.mjs';

/**
 * 生成"创建计划"：先把所有写盘动作算清楚，再决定是否执行。
 * 这是 plan → apply 两阶段设计的核心。
 */
export function buildPlan({ templateDir, template, vars, selectedGroups = [], outDir }) {
  const layout = normalizeLayout(template.layout, { vars });
  const dirs = new Map(); // rel -> { rel, keep, fromLayout }
  const extraFiles = []; // layout 里的文件占位

  const addDir = (rel, { keep = false } = {}) => {
    if (!rel) return;
    if (!dirs.has(rel)) dirs.set(rel, { rel, keep: false, fromLayout: false });
    const entry = dirs.get(rel);
    if (keep) entry.keep = true;
  };

  for (const item of layout) {
    if (item.when && !evalExpr(item.when, vars)) continue;
    if (item.optional) {
      const key = item.id || item.rel;
      if (!selectedGroups.includes(key)) continue;
    }
    if (item.file) {
      extraFiles.push({ rel: item.rel, placeholder: true });
    } else {
      addDir(item.rel);
      dirs.get(item.rel).fromLayout = true;
      if (item.keep) dirs.get(item.rel).keep = true;
    }
  }

  for (const group of template.optionalGroups || []) {
    if (!selectedGroups.includes(group.id)) continue;
    for (const p of group.paths || []) {
      const rel = assertSafeRelPath(renderText(p, vars, { pathMode: true }), {
        what: `目录组 ${group.id} 的 paths`,
      });
      addDir(rel);
    }
  }

  const { files, keepDirs } = collectFiles(templateDir, template, vars, { selectedGroups });

  for (const f of files) {
    for (const parent of parentDirs(f.rel)) addDir(parent);
    if (exists(path.join(outDir, f.rel)) && isDir(path.join(outDir, f.rel))) {
      fail(`目标位置已存在同名目录，无法写入文件：${f.rel}`);
    }
  }
  for (const d of keepDirs) addDir(d, { keep: true });
  for (const d of dirs.keys()) {
    for (const parent of parentDirs(d)) addDir(parent);
  }

  // 缺失的源文件提前报出来，别写一半才失败
  for (const f of files) {
    if (!isFile(f.src)) {
      fail(`模板里找不到源文件：${f.src}\n  请检查 template.json 的 files[] 或 files/ 目录`);
    }
  }

  // 冲突检测
  const conflicts = [];
  for (const dir of dirs.values()) {
    const p = path.join(outDir, dir.rel);
    if (exists(p)) {
      if (!isDir(p)) conflicts.push({ rel: dir.rel, type: 'dir-vs-file' });
      else conflicts.push({ rel: dir.rel, type: 'dir-exists' });
    }
  }
  for (const f of files) {
    const p = path.join(outDir, f.rel);
    if (exists(p)) conflicts.push({ rel: f.rel, type: 'file-exists' });
  }

  const fileEntries = [
    ...files.map((f) => ({
      rel: f.rel,
      type: 'file',
      src: f.src,
      render: f.render && !f.binary,
      binary: f.binary,
      onConflict: f.onConflict,
      eol: f.eol,
      outsideTemplate: Boolean(f.outsideTemplate),
    })),
    ...extraFiles.map((f) => ({
      rel: f.rel,
      type: 'file',
      src: null,
      render: false,
      binary: false,
      placeholder: true,
      onConflict: null,
      eol: 'preserve',
    })),
  ].sort((a, b) => (a.rel < b.rel ? -1 : 1));

  const totalBytes = fileEntries.reduce(
    (sum, f) => (f.src && isFile(f.src) ? sum + fs.statSync(f.src).size : sum),
    0,
  );

  // keep 目录最终会补一个 .gitkeep（本来为空才补），预览里要把它们算进去
  const keepEntries = [...dirs.values()].filter(
    (d) =>
      d.keep &&
      !fileEntries.some((f) => f.rel === d.rel || f.rel.startsWith(`${d.rel}/`)),
  );

  return {
    outDir,
    templateId: template.id,
    vars,
    selectedGroups,
    dirs: [...dirs.values()].sort((a, b) => (a.rel < b.rel ? -1 : 1)),
    files: fileEntries,
    conflicts: conflicts.sort((a, b) => (a.rel < b.rel ? -1 : 1)),
    dirCount: dirs.size,
    fileCount: fileEntries.length,
    keepCount: keepEntries.length,
    totalBytes,
  };
}

/** 目标目录本身是否已存在且非空。 */
export function targetDirState(outDir) {
  if (!exists(outDir)) return 'missing';
  if (!isDir(outDir)) return 'not-a-dir';
  return listDir(outDir).length === 0 ? 'empty' : 'non-empty';
}

export function describePlan(plan) {
  const lines = [];
  lines.push(`即将创建 ${plan.outDir}`);
  const keep = plan.keepCount ? `（另加 ${plan.keepCount} 个 .gitkeep）` : '';
  lines.push(
    `  目录 ${plan.dirCount} 个，文件 ${plan.fileCount} 个${keep}，约 ${fmtBytes(plan.totalBytes)}`,
  );
  lines.push(`  模板 ${plan.templateId}`);
  if (plan.conflicts.length) {
    lines.push(`  ⚠ 与现有文件冲突 ${plan.conflicts.length} 处`);
  }
  return lines;
}

export function countSourceFiles(dir) {
  return walkFiles(dir).length;
}

export function ensureParent(p) {
  ensureDir(path.dirname(p));
  return p;
}
