import path from 'node:path';
import { isDir, isFile } from '../util/fsutil.mjs';
import { suggestTemplateId } from './reverse.mjs';

/**
 * 模板定义文件的候选名，按优先级。
 *   template.json   标准 JSON（工具生成的就是它）
 *   template.jsonc  允许注释与尾逗号，适合手写
 */
export const TEMPLATE_FILE_NAMES = ['template.json', 'template.jsonc'];

export function findTemplateFile(dir) {
  for (const name of TEMPLATE_FILE_NAMES) {
    const file = path.join(dir, name);
    if (isFile(file)) return { file, name };
  }
  return null;
}

/** 约定：模板的文件都在 <模板目录>/files/ 下面。 */
export function templateFilesRoot(dir) {
  return path.join(dir, 'files');
}

export function hasTemplateFilesRoot(dir) {
  return isDir(templateFilesRoot(dir));
}

/** 目录名 → 合法 id（大写、空格、中文都会规范化）。 */
export function idFromDirName(dir) {
  return suggestTemplateId(path.basename(dir));
}

/**
 * 裸模板：目录里没有 template.json / template.jsonc，只有一个 files/ 子目录。
 * 一切按约定走 —— 一行 JSON 都不用写。
 */
export function bareTemplateJson(dir) {
  const base = path.basename(dir);
  // 不编造 description：list 里的 [裸模板] 标记和 show 里的「定义：无 template.json」
  // 已经说明它是什么了。
  return {
    schemaVersion: 1,
    id: idFromDirName(dir),
    name: base,
    cmake: { buildDir: 'build', standard: '11', generator: 'Ninja' },
  };
}

/** id / name 缺省时按目录名补上，返回被补的字段名。 */
export function fillDerivedFields(json, dir) {
  const derived = [];
  if (json.id === undefined || json.id === null || json.id === '') {
    json.id = idFromDirName(dir);
    derived.push(`id="${json.id}"`);
  }
  if (json.name === undefined || json.name === null || String(json.name).trim() === '') {
    json.name = path.basename(dir);
    derived.push(`name="${json.name}"`);
  }
  return derived;
}
