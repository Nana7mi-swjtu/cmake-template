import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CACHE = new Map();
const IS_WIN = process.platform === 'win32';

function pathExts() {
  if (!IS_WIN) return [''];
  return (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 在 PATH 里找出命令的真实路径。
 *
 * Windows 上必须优先匹配 PATHEXT：某些工具在 `bin\` 下同时存在一个无扩展名的 shell 脚本
 * 和一个 `*.cmd` 包装器，前者无法被 spawn，真正的可执行入口是后者。
 */
export function resolveCommand(name) {
  if (CACHE.has(name)) return CACHE.get(name);

  // 已经是路径
  if (name.includes('/') || name.includes('\\')) {
    const hit = fs.existsSync(name) ? name : null;
    CACHE.set(name, hit);
    return hit;
  }

  const exts = IS_WIN ? pathExts() : [''];
  const order = IS_WIN ? [...exts, ''] : [''];
  const dirs = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .filter(Boolean);

  let found = null;
  outer: for (const dir of dirs) {
    for (const ext of order) {
      const candidate = path.join(dir, name + ext);
      try {
        if (fs.statSync(candidate).isFile()) {
          found = candidate;
          break outer;
        }
      } catch {
        /* 继续找 */
      }
    }
  }

  CACHE.set(name, found);
  return found;
}

export function isCommandAvailable(name) {
  return Boolean(resolveCommand(name));
}

/**
 * 执行外部命令。不抛异常，返回 spawnSync 的结果并额外带上 { found }。
 *
 * .cmd / .bat 在 Node 里不能用 shell:false 直接 spawn（EINVAL），而 shell:true 同时传 args
 * 数组又会触发 DEP0190。所以：把整行命令自己拼好、以单个字符串交给 shell:true（args 为空）。
 */
export function runCommand(name, args = [], { cwd, stdio = 'ignore', encoding = 'utf8' } = {}) {
  const resolved = resolveCommand(name);
  if (!resolved) {
    return {
      found: false,
      error: new Error(`找不到命令：${name}`),
      status: null,
      stdout: '',
      stderr: '',
    };
  }

  const isBatch = IS_WIN && /\.(cmd|bat)$/i.test(resolved);
  const res = isBatch
    ? spawnSync([quoteWin(resolved), ...args.map(quoteWin)].join(' '), [], {
        cwd,
        stdio,
        encoding,
        shell: true,
      })
    : spawnSync(resolved, args, { cwd, stdio, encoding });

  return { ...res, found: true };
}

/** Windows 命令行参数引号处理（cmd.exe 只能靠双引号）。 */
function quoteWin(value) {
  const s = String(value);
  if (!/[\s"&|<>^]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** 探测命令的版本首行，用于 doctor。 */
export function probeCommand(name, args = ['--version']) {
  const res = runCommand(name, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (!res.found || res.error || res.status !== 0) {
    return { ok: false, found: res.found, version: null };
  }
  const text = String(res.stdout || res.stderr || '').trim();
  return { ok: true, found: true, version: text.split('\n')[0].slice(0, 100) };
}
