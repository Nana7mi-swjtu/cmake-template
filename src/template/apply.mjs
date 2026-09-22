import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, exists, isDir, timestamp } from '../util/fsutil.mjs';
import { CtplError } from '../util/errors.mjs';
import { renderText } from './render.mjs';

/**
 * 执行创建计划。
 * 冲突策略只有两种来源：CLI 的 --force（覆盖，先备份）与 --on-conflict=skip（跳过同名）。
 * @param {object} plan buildPlan 的产物
 * @param {{ overwrite?: boolean, skipExisting?: boolean, dryRun?: boolean, strict?: boolean }} opts
 */
export function applyPlan(plan, opts = {}) {
  const { overwrite = false, skipExisting = false, dryRun = false, strict = true } = opts;
  const createdDirs = [];
  const written = [];
  const skipped = [];
  const backedUp = [];

  if (dryRun) {
    return {
      createdDirs: plan.dirs.map((d) => d.rel),
      written: plan.files.map((f) => f.rel),
      skipped,
      backedUp,
    };
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
    const target = path.join(plan.outDir, file.rel);

    if (exists(target)) {
      if (skipExisting && !overwrite) {
        skipped.push(file.rel);
        continue;
      }
      if (!overwrite) {
        throw new CtplError(`目标文件已存在：${file.rel}`, {
          code: 'E_CONFLICT',
          exitCode: 4,
        });
      }
      // 覆盖用户已有的文件之前先备份
      const backup = `${target}.bak-${timestamp()}`;
      fs.copyFileSync(target, backup);
      backedUp.push(path.relative(plan.outDir, backup));
    }

    ensureDir(path.dirname(target));

    if (file.placeholder) {
      fs.writeFileSync(target, '', 'utf8');
    } else if (file.binary) {
      fs.copyFileSync(file.src, target);
    } else {
      const raw = fs.readFileSync(file.src, 'utf8');
      let content;
      try {
        content = renderText(raw, plan.vars, { strict });
      } catch (err) {
        if (err instanceof CtplError) {
          throw new CtplError(`${err.message}\n  出问题的文件：${file.src}`, {
            code: err.code,
            exitCode: err.exitCode,
          });
        }
        throw err;
      }
      fs.writeFileSync(target, content, 'utf8');
    }
    written.push(path.relative(plan.outDir, target));
  }

  return { createdDirs, written, skipped, backedUp };
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
