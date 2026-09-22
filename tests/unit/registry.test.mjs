import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findTemplate, listTemplates } from '../../src/template/registry.mjs';

function tempTemplates(templates) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctpl-reg-'));
  for (const [dirName, json] of Object.entries(templates)) {
    const dir = path.join(root, dirName);
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify(json, null, 2), 'utf8');
  }
  return root;
}

test('模板 id 允许大小写混合，list 与 findTemplate 都认', () => {
  const root = tempTemplates({
    MyTpl: { schemaVersion: 1, id: 'MyTpl', name: '大写模板' },
    plain: { schemaVersion: 1, id: 'plain', name: '小写模板' },
  });
  try {
    assert.deepEqual(
      listTemplates(root).map((t) => t.id).sort(),
      ['MyTpl', 'plain'],
    );
    assert.equal(findTemplate(root, 'MyTpl').id, 'MyTpl');
    // 大小写不一致时退而求其次也能找到（Windows / macOS 上尤其自然）
    assert.equal(findTemplate(root, 'mytpl').id, 'MyTpl');
    assert.equal(findTemplate(root, 'PLAIN').id, 'plain');
    // 完全找不到时才报错，并列出可用 id
    assert.throws(() => findTemplate(root, 'nope'), /找不到模板 "nope"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
