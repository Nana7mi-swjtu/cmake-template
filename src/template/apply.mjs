import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, exists, isDir } from '../util/fsutil.mjs';
import { fail, CtplError } from '../util/errors.mjs';
import { renderText } from './render.mjs';
import { applyEol } from '../fsx/eol.mjs';

/** 给重名文件找一个新的名字：a.txt → a.1.txt → a.2.txt */
function renamedPath(target) {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${base}.${i}${ext}`);
    if (!exists(candidate)) return candidate;
  }
  fail(`无法为 ${target} 找到可用的新名字`);
}

/**
 * 执行创建计划。
 * @param {object} plan buildPlan 的产物
 * @param {{ overwrite?: boolean, skipExisting?: boolean, renameExisting?: boolean, dryRun?: boolean, strict?: boolean }} opts
 */
export function applyPlan(plan, opts = {}) {
  const { overwrite = false, skipExisting = false, dryRun = false, strict = true } = opts;
  const createdDirs = [];
  const written = [];
  const skipped = [];
  const renamed = [];

  if (dryRun) {
    return { createdDirs: plan.dirs.map((d) => d.rel), written: plan.files.map((f) => f.rel), skipped, renamed };
  }

  for (const dir of plan.dirs) {
    const p = path.join(plan.outDir, dir.rel);
    if (!exists(p)) {
      ensureDir(p);
      createdDirs.push(dir.rel);
    }
  }

  ensureDir(plan.outDir);

  for (const file of plan.files) {
    let target = path.join(plan.outDir, file.rel);

    if (exists(target)) {
      const policy = file.onConflict || (overwrite ? 'overwrite' : skipExisting ? 'skip' : 'abort');
      if (policy === 'skip') {
        skipped.push(file.rel);
        continue;
      }
      if (policy === 'abort') {
        throw new CtplError(`目标文件已存在：${file.rel}`, {
          code: 'E_CONFLICT',
          exitCode: 4,
        });
      }
      if (policy === 'rename') {
        target = renamedPath(target);
        renamed.push({ from: file.rel, to: path.relative(plan.outDir, target) });
      }
    }

    ensureDir(path.dirname(target));

    if (file.placeholder) {
      fs.writeFileSync(target, '', 'utf8');
      written.push(path.relative(plan.outDir, target));
      continue;
    }

    if (file.binary || !file.render) {
      fs.copyFileSync(file.src, target);
      written.push(path.relative(plan.outDir, target));
      continue;
    }

    const raw = fs.readFileSync(file.src, 'utf8');
    let content;
    try {
      content = renderText(raw, plan.vars, { strict });
    } catch (err) {
      const rel = file.src;
      if (err instanceof CtplError) {
        throw new CtplError(`${err.message}\n  出问题的文件：${rel}`, {
          code: err.code,
          exitCode: err.exitCode,
        });
      }
      throw err;
    }
    fs.writeFileSync(target, applyEol(content, file.eol), 'utf8');
    written.push(path.relative(plan.outDir, target));
  }

  return { createdDirs, written, skipped, renamed };
}

/** 空目录保持用的 .gitkeep（plan.dirs 里 keep: true 且最终仍然为空的目录）。 */
export function writeKeepFiles(plan) {
  const made = [];
  for (const dir of plan.dirs) {
    if (!dir.keep) continue;
    const p = path.join(plan.outDir, dir.rel);
    if (!isDir(p)) continue;
    if (fs.readdirSync(p).length > 0) continue;
    fs.writeFileSync(path.join(p, '.gitkeep'), '', 'utf8');
    made.push(`${dir.rel}/.gitkeep`);
  }
  return made;
}
