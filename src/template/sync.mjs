import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isDir,
  isFile,
  listDir,
  copyTree,
  removeTree,
  readJson,
  writeJson,
  hashTree,
  timestamp,
  exists,
} from '../util/fsutil.mjs';
import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 随包分发的只读内置模板目录。 */
export const BUILTIN_TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');

/** 模板根目录是否恰好就是随包只读目录（此时不能写）。 */
export function isBuiltinTemplatesDir(dir) {
  try {
    return path.resolve(dir) === path.resolve(BUILTIN_TEMPLATES_DIR);
  } catch {
    return false;
  }
}

/** 会写入模板的操作（init/import/remove/duplicate/restore）先过这一关。 */
export function assertWritableTemplatesDir(dir) {
  if (isBuiltinTemplatesDir(dir)) {
    fail(
      `模板根目录指向了随包只读目录：${dir}\n` +
        '  换一个你自己的目录： ctpl config --templates-dir <绝对路径>',
      { code: 'E_BUILTIN_DIR', exitCode: 2 },
    );
  }
}

export function listBuiltinIds() {
  return listDir(BUILTIN_TEMPLATES_DIR)
    .filter((e) => e.isDirectory() && isFile(path.join(BUILTIN_TEMPLATES_DIR, e.name, 'template.json')))
    .map((e) => e.name)
    .sort();
}

/** template.json 里的 _builtin 是工具写的同步元数据，算哈希时要先剔掉。 */
function stripBuiltinMeta(buf) {
  try {
    const json = JSON.parse(buf.toString('utf8'));
    delete json._builtin;
    return Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf8');
  } catch {
    return buf;
  }
}

export function hashTemplateDir(dir) {
  return hashTree(dir, {
    transform: (rel, buf) => (rel === 'template.json' ? stripBuiltinMeta(buf) : undefined),
  });
}

function readBuiltinMeta(dir) {
  const f = path.join(dir, 'template.json');
  if (!isFile(f)) return null;
  try {
    return readJson(f)._builtin || null;
  } catch {
    return null;
  }
}

function templateVersion(dir) {
  const f = path.join(dir, 'template.json');
  try {
    return readJson(f).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function writeBuiltinMeta(destDir, id, version, syncedHash) {
  const f = path.join(destDir, 'template.json');
  const json = readJson(f);
  json._builtin = { id, version, syncedHash };
  writeJson(f, json);
}

/**
 * 内置模板同步（决策 #4）：
 *   缺失        → 自动恢复
 *   没被改过     → 跟随工具升级
 *   被用户改过   → 绝不覆盖，只提示
 * 用户自建的同名模板（没有 _builtin）一律不动。
 */
export function syncBuiltinTemplates(templatesDir, { logger = log } = {}) {
  if (!isDir(templatesDir)) return [];
  // 直接对着随包目录时只读，什么都不写（也不会往仓库里塞 _builtin）
  if (isBuiltinTemplatesDir(templatesDir)) return [];
  const actions = [];

  for (const id of listBuiltinIds()) {
    const src = path.join(BUILTIN_TEMPLATES_DIR, id);
    const dest = path.join(templatesDir, id);
    const version = templateVersion(src);
    const srcHash = hashTemplateDir(src);

    if (!isDir(dest)) {
      copyTree(src, dest);
      writeBuiltinMeta(dest, id, version, srcHash);
      logger.ok(`已恢复内置模板 ${id}（本地缺失）`);
      actions.push({ id, action: 'restored' });
      continue;
    }

    const meta = readBuiltinMeta(dest);
    if (!meta) {
      // 用户自己写的同名模板：不碰。
      actions.push({ id, action: 'user-owned' });
      continue;
    }

    const curHash = hashTemplateDir(dest);
    const modified = curHash !== meta.syncedHash;

    if (modified) {
      if (meta.version !== version) {
        logger.warn(
          `内置模板 ${id} 有新版本 ${version}（你本地已自定义，未覆盖）。\n` +
            `  想恢复官方版本： ctpl restore ${id}`,
        );
      }
      actions.push({ id, action: 'kept-modified' });
      continue;
    }

    if (meta.version !== version) {
      removeTree(dest);
      copyTree(src, dest);
      writeBuiltinMeta(dest, id, version, srcHash);
      logger.ok(`已更新内置模板 ${id}：${meta.version} → ${version}`);
      actions.push({ id, action: 'updated' });
    } else {
      actions.push({ id, action: 'up-to-date' });
    }
  }

  return actions;
}

/** 强制恢复某个内置模板（先备份用户的版本）。 */
export function restoreBuiltin(id, templatesDir, { logger = log } = {}) {
  const src = path.join(BUILTIN_TEMPLATES_DIR, id);
  if (!isDir(src)) {
    fail(`没有这个内置模板：${id}\n  可用：${listBuiltinIds().join(', ') || '(无)'}`, {
      code: 'E_NO_BUILTIN',
      exitCode: 2,
    });
  }
  if (!isDir(templatesDir)) {
    fail(`模板根目录不存在：${templatesDir}`, { code: 'E_NO_DIR' });
  }

  const dest = path.join(templatesDir, id);
  assertWritableTemplatesDir(templatesDir);
  let backup = null;
  if (exists(dest)) {
    backup = `${dest}.bak-${timestamp()}`;
    fs.renameSync(dest, backup);
  }

  copyTree(src, dest);
  writeBuiltinMeta(dest, id, templateVersion(src), hashTemplateDir(src));
  logger.ok(`已恢复内置模板 ${id} → ${dest}`);
  if (backup) logger.hint(`你原来的版本已备份为 ${backup}`);
  return { dest, backup };
}
