import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const exists = (p) => fs.existsSync(p);

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function isEmptyDir(p) {
  if (!isDir(p)) return true;
  return fs.readdirSync(p).length === 0;
}

export function listDir(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

/** 递归列出目录下所有文件的相对 posix 路径（已排序）。 */
export function walkFiles(root, { skip = [] } = {}) {
  const acc = [];
  const visit = (dir, prefix) => {
    for (const ent of listDir(dir).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (skip.includes(ent.name)) continue;
      if (ent.isDirectory()) visit(path.join(dir, ent.name), rel);
      else if (ent.isFile()) acc.push(rel);
    }
  };
  if (isDir(root)) visit(root, '');
  return acc;
}

/** 目录内容的确定性哈希（排序后的相对路径 + 内容），用于内置模板同步判定。 */
export function hashTree(root, { transform } = {}) {
  const hash = crypto.createHash('sha1');
  for (const rel of walkFiles(root)) {
    hash.update(rel);
    hash.update('\u0000');
    let buf = fs.readFileSync(path.join(root, rel));
    if (transform) {
      const replaced = transform(rel, buf);
      if (replaced !== undefined) buf = replaced;
    }
    hash.update(buf);
    hash.update('\u0000');
  }
  return hash.digest('hex');
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timestamp() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** 递归复制目录（保留目录结构）。 */
export function copyTree(src, dest) {
  ensureDir(dest);
  for (const ent of listDir(src)) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyTree(from, to);
    else if (ent.isFile()) fs.copyFileSync(from, to);
  }
}

export function removeTree(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
