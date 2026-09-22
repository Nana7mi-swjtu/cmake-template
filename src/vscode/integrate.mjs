import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, isFile, readJson, writeJson, timestamp } from '../util/fsutil.mjs';
import { log as defaultLog } from '../util/log.mjs';
import { parseJsonc } from '../util/jsonc.mjs';

// 实现已挪到 util/jsonc.mjs，这里保留导出以兼容旧引用
export { parseJsonc };

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) {
    const a = Array.isArray(base) ? base : [];
    const b = Array.isArray(patch) ? patch : [];
    return [...new Set([...a, ...b])];
  }
  if (base && patch && typeof base === 'object' && typeof patch === 'object') {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out;
  }
  return patch;
}

function mergeIntoFile(file, patch, { logger }) {
  let current = {};
  if (isFile(file)) {
    try {
      current = parseJsonc(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      logger.warn(`无法解析 ${file}（${err.message}），跳过写入，保持原文件不动`);
      return false;
    }
    fs.copyFileSync(file, `${file}.bak-${timestamp()}`);
  }
  writeJson(file, deepMerge(current, patch));
  return true;
}

/**
 * 可选的 VS Code 集成。
 * 默认模板的 vscode.settings 为空、extensions 为空 → 这里什么都不写，
 * 生成物里不会出现 .vscode/（C5）。
 * 永远不生成 CMakePresets.json（C1）。
 */
export function integrateVscode(outDir, template, { logger = defaultLog } = {}) {
  const opts = template.vscode || {};
  const results = [];

  if (opts.presets === true) {
    logger.warn(
      '模板要求生成 CMakePresets.json，但你的全局设置是 cmake.useCMakePresets: "never"，' +
        '该文件不会生效 —— 已跳过。',
    );
  }

  const settings = opts.settings || {};
  if (Object.keys(settings).length > 0) {
    const file = path.join(outDir, '.vscode', 'settings.json');
    ensureDir(path.dirname(file));
    if (mergeIntoFile(file, settings, { logger })) results.push('.vscode/settings.json');
  }

  const extensions = opts.extensions || [];
  if (extensions.length > 0) {
    const file = path.join(outDir, '.vscode', 'extensions.json');
    ensureDir(path.dirname(file));
    if (mergeIntoFile(file, { recommendations: extensions }, { logger })) {
      results.push('.vscode/extensions.json');
    }
  }

  return results;
}

export { deepMerge, mergeIntoFile };
