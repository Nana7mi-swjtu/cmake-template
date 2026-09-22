import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readJson, writeJson, isFile, timestamp } from '../util/fsutil.mjs';

/**
 * 工具自身的配置目录。模板一律放在用户手填的 templatesDir 里，
 * 这里只放 config.json / state.json。
 */
export function configHome() {
  if (process.env.CTPL_CONFIG_HOME && process.env.CTPL_CONFIG_HOME.trim()) {
    return path.resolve(process.env.CTPL_CONFIG_HOME.trim());
  }
  const base =
    process.env.APPDATA && process.env.APPDATA.trim()
      ? process.env.APPDATA
      : path.join(os.homedir(), '.config');
  return path.join(base, 'cmake-template');
}

export const configFile = () => path.join(configHome(), 'config.json');
export const stateFile = () => path.join(configHome(), 'state.json');

export const DEFAULT_CONFIG = {
  templatesDir: null,
  defaultTemplateId: 'default-cpp',
  defaultActions: { git: true, open: true, configure: false },
};

export function loadConfig() {
  const f = configFile();
  if (!isFile(f)) return structuredClone(DEFAULT_CONFIG);
  let raw;
  try {
    raw = readJson(f);
  } catch (err) {
    throw new Error(`配置文件解析失败：${f}\n  ${err.message}`);
  }
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...raw,
    defaultActions: { ...DEFAULT_CONFIG.defaultActions, ...(raw.defaultActions || {}) },
  };
}

export function saveConfig(cfg) {
  const f = configFile();
  if (isFile(f)) {
    try {
      fs.copyFileSync(f, `${f}.bak`);
    } catch {
      /* 备份失败不阻塞 */
    }
  }
  writeJson(f, cfg);
  return f;
}

export function loadState() {
  const f = stateFile();
  if (!isFile(f)) return {};
  try {
    return readJson(f);
  } catch {
    return {};
  }
}

export function saveState(patch) {
  const next = { ...loadState(), ...patch };
  writeJson(stateFile(), next);
  return next;
}

export function backupPath(p) {
  return `${p}.bak-${timestamp()}`;
}

/** 人类可读的配置摘要，用于 `ctpl config` 输出。 */
export function describeConfig(cfg) {
  return {
    配置目录: configHome(),
    模板根目录: cfg.templatesDir || '(未设置，首次运行时会要求你手动填写)',
    默认模板: cfg.defaultTemplateId,
    默认附加动作: Object.entries(cfg.defaultActions)
      .map(([k, v]) => `${k}=${v ? 'on' : 'off'}`)
      .join('  '),
  };
}
