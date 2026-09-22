import fs from 'node:fs';
import path from 'node:path';

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svgz', '.tif', '.tiff',
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar', '.jar',
  '.wasm', '.exe', '.dll', '.so', '.dylib', '.lib', '.a', '.o', '.obj', '.pdb',
  '.bin', '.dat', '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav', '.flac', '.avi', '.mov',
  '.sqlite', '.db', '.pyc', '.class',
]);

export function isBinaryPath(p) {
  return BINARY_EXT.has(path.extname(p).toLowerCase());
}

export function looksBinary(buf) {
  const head = buf.subarray(0, 8192);
  return head.includes(0);
}

/** 命中扩展名白名单或以 NUL 字节开头 → 视为二进制，只复制不渲染。 */
export function isBinaryFile(p) {
  if (isBinaryPath(p)) return true;
  try {
    return looksBinary(fs.readFileSync(p));
  } catch {
    return false;
  }
}
