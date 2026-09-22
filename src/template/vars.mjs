import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson } from '../util/fsutil.mjs';
import { deriveNames } from './naming.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function toolVersion() {
  try {
    return readJson(path.join(PKG_ROOT, 'package.json')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function gitConfig(key) {
  try {
    const v = execFileSync('git', ['config', '--get', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return v || null;
  } catch {
    return null;
  }
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    year: String(d.getFullYear()),
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    datetime: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`,
  };
}

/**
 * 组装最终变量表。优先级（后者覆盖前者）：
 *   内置 → 派生 → 模板 cmake 选项 → answers（模板变量交互值 / --set / 目录组 defines）
 */
export function buildVars({ template, projectName, dirName, answers = {} }) {
  const names = deriveNames(projectName);
  const now = today();

  const builtin = {
    // 输入
    projectName,
    dirName,
    // 派生
    ...names,
    // 默认值（可被 answers 覆盖）
    // targetName 默认与 projectName 完全一致 —— 不做任何“擅自转换”
    targetName: projectName,
    author: gitConfig('user.name') || process.env.USERNAME || process.env.USER || '',
    email: gitConfig('user.email') || '',
    // 时间
    ...now,
    // 模板 cmake 选项
    cmakeMinVersion: template.cmake?.minVersion || '3.20',
    buildDir: template.cmake?.buildDir || 'build',
    generator: template.cmake?.generator || 'Ninja',
    // cmake.standard 的变量孪生体：模板里写了 variables.cppStandard 时，
    // answers 会盖掉它；没写（比如裸模板）时也能渲染，不至于报“变量未定义”
    cppStandard: template.cmake?.standard || '11',
    // 工具信息
    ctplVersion: toolVersion(),
    templateId: template.id,
    templateName: template.name,
  };

  return { ...builtin, ...answers };
}

/** 收集某个变量定义在交互/--set 下的默认值。 */
export function variableDefault(def) {
  if (def.default !== undefined) return def.default;
  switch (def.type) {
    case 'boolean':
      return false;
    case 'multiselect':
      return [];
    default:
      return '';
  }
}
