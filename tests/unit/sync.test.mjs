import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinTemplates } from '../../src/template/sync.mjs';

const silent = { ok() {}, warn() {}, hint() {} };

/** 造一个“随包内置模板”目录：template.json + files/。 */
function makeBuiltin(builtinDir, id, files, version = '0.1.0') {
  const dir = path.join(builtinDir, id);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'template.json'),
    `${JSON.stringify({ schemaVersion: 1, id, name: id, version }, null, 2)}\n`,
    'utf8',
  );
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, 'files', ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return dir;
}

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctpl-sync-'));
  const builtinDir = path.join(root, 'builtin');
  const templatesDir = path.join(root, 'tpls');
  fs.mkdirSync(builtinDir, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });
  return {
    root,
    builtinDir,
    templatesDir,
    sync: () => syncBuiltinTemplates(templatesDir, { logger: silent, builtinDir }),
    read: (...segs) => fs.readFileSync(path.join(templatesDir, ...segs), 'utf8'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test('内置模板内容变了（version 没变）也要刷新本地副本', () => {
  const box = sandbox();
  try {
    makeBuiltin(box.builtinDir, 'demo', { 'a.txt': 'v1', 'sub/b.txt': 'x' });

    // 第一次：本地缺失 → 恢复
    assert.equal(box.sync()[0].action, 'restored');
    assert.equal(box.read('demo', 'files', 'a.txt'), 'v1');
    const meta = JSON.parse(box.read('demo', 'template.json'))._builtin;
    assert.ok(meta && meta.syncedHash, '应该写入 _builtin 元数据');

    // 第二次：源没变 → up-to-date
    assert.equal(box.sync()[0].action, 'up-to-date');

    // 源变了，但 version 故意不动（这就是原来本地副本永不刷新的 bug）
    fs.writeFileSync(path.join(box.builtinDir, 'demo', 'files', 'a.txt'), 'v2', 'utf8');
    assert.equal(box.sync()[0].action, 'updated');
    assert.equal(box.read('demo', 'files', 'a.txt'), 'v2');

    // 用户改过本地副本 → 源再变也不覆盖
    fs.writeFileSync(path.join(box.templatesDir, 'demo', 'files', 'a.txt'), 'mine', 'utf8');
    fs.writeFileSync(path.join(box.builtinDir, 'demo', 'files', 'a.txt'), 'v3', 'utf8');
    assert.equal(box.sync()[0].action, 'kept-modified');
    assert.equal(box.read('demo', 'files', 'a.txt'), 'mine');
  } finally {
    box.cleanup();
  }
});

test('本地删掉内置模板 → 自动恢复；同名自建模板不碰', () => {
  const box = sandbox();
  try {
    makeBuiltin(box.builtinDir, 'demo', { 'a.txt': 'v1' });

    // 用户自建的同名模板（没有 _builtin）→ user-owned，绝不动
    fs.mkdirSync(path.join(box.templatesDir, 'demo', 'files'), { recursive: true });
    fs.writeFileSync(path.join(box.templatesDir, 'demo', 'template.json'), '{"name":"mine"}', 'utf8');
    assert.equal(box.sync()[0].action, 'user-owned');
    assert.equal(box.read('demo', 'template.json'), '{"name":"mine"}');

    // 删掉 → 下次自动恢复成官方版本
    fs.rmSync(path.join(box.templatesDir, 'demo'), { recursive: true, force: true });
    assert.equal(box.sync()[0].action, 'restored');
    assert.equal(box.read('demo', 'files', 'a.txt'), 'v1');
  } finally {
    box.cleanup();
  }
});

test('version 变化时更新，并在更新后用新版本号记账', () => {
  const box = sandbox();
  try {
    makeBuiltin(box.builtinDir, 'demo', { 'a.txt': 'v1' }, '0.1.0');
    box.sync();

    fs.writeFileSync(path.join(box.builtinDir, 'demo', 'files', 'a.txt'), 'v2', 'utf8');
    fs.writeFileSync(
      path.join(box.builtinDir, 'demo', 'template.json'),
      `${JSON.stringify({ schemaVersion: 1, id: 'demo', name: 'demo', version: '0.2.0' }, null, 2)}\n`,
      'utf8',
    );

    assert.equal(box.sync()[0].action, 'updated');
    const meta = JSON.parse(box.read('demo', 'template.json'))._builtin;
    assert.equal(meta.version, '0.2.0');
    assert.equal(box.sync()[0].action, 'up-to-date');
  } finally {
    box.cleanup();
  }
});
