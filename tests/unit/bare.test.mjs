import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTemplate, tryLoadTemplate } from '../../src/template/loader.mjs';
import { bareTemplateJson, fillDerivedFields, idFromDirName } from '../../src/template/bare.mjs';
import { validateTemplate } from '../../src/template/schema.mjs';
import { buildPlan } from '../../src/template/plan.mjs';
import { buildVars } from '../../src/template/vars.mjs';

function tplDir(name, files = {}, def) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctpl-bare-'));
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (def !== undefined) {
    const body = typeof def === 'string' ? def : JSON.stringify(def, null, 2);
    fs.writeFileSync(path.join(dir, 'template.json'), body, 'utf8');
  }
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, 'files', ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return { root, dir };
}

test('裸模板：只有 files/，一行 JSON 都不用写', () => {
  const { dir } = tplDir('My-Drop-In', { 'hello.txt': 'hi {{projectName}}' });
  const t = loadTemplate(dir);
  assert.equal(t.bare, true);
  assert.equal(t.source, null);
  assert.equal(t.json.id, 'my-drop-in');
  assert.equal(t.json.name, 'My-Drop-In');
  assert.equal(t.json.schemaVersion, 1);
  assert.equal(t.json.layout, undefined);
  assert.equal(t.json.cmake.buildDir, 'build');
  assert.deepEqual(t.warnings, []);
});

test('template.json 可以只写几个字段：id/name/schemaVersion/layout 都能省', () => {
  const { dir } = tplDir('minimal', { 'a.txt': 'x' }, { default: false });
  const t = loadTemplate(dir);
  assert.equal(t.bare, false);
  assert.equal(t.json.id, 'minimal');
  assert.equal(t.json.name, 'minimal');
  assert.equal(t.json.default, false);
  assert.deepEqual(t.derived, ['id="minimal"', 'name="minimal"']);
  assert.ok(t.warnings.some((w) => /schemaVersion/.test(w)));
});

test('description 已废弃：老模板里留着也不报错、不告警', () => {
  const { dir } = tplDir('legacy', { 'a.txt': 'x' }, {
    schemaVersion: 1,
    description: '以前 init 自动写的那句',
  });
  const t = loadTemplate(dir);
  assert.deepEqual(t.warnings, []);
});

test('未知字段照样告警（description 是唯一被放行的废弃字段）', () => {
  const { dir } = tplDir('typo', { 'a.txt': 'x' }, { schemaVersion: 1, descrption: '拼错了' });
  const t = loadTemplate(dir);
  assert.ok(
    t.warnings.some((w) => /未知字段 "descrption"/.test(w)),
    JSON.stringify(t.warnings),
  );
});

test('template.jsonc：允许注释和尾逗号', () => {
  const { dir } = tplDir('commented', { 'a.txt': 'x' });
  fs.writeFileSync(
    path.join(dir, 'template.jsonc'),
    [
      '{',
      '  // 这是注释，jsonc 里合法',
      '  "id": "commented",',
      '  "name": "带注释的模板", /* 行内注释 */',
      '  "layout": [],',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  const t = loadTemplate(dir);
  assert.equal(t.source.endsWith('template.jsonc'), true);
  assert.equal(t.json.id, 'commented');
  assert.equal(t.json.name, '带注释的模板');
});

test('既没有 template.json 也没有 files/ → 报错说清两种写法', () => {
  const { dir } = tplDir('empty');
  const res = tryLoadTemplate(dir);
  assert.equal(res.ok, false);
  assert.match(res.error, /这不是一个模板目录/);
  assert.match(res.error, /files\/ 子目录/);
});

test('layout 不是必填：files/ 里的文件自动建出父目录', () => {
  const { errors } = validateTemplate({ schemaVersion: 1, id: 'x', name: 'x' });
  assert.deepEqual(errors, []);

  const { dir } = tplDir('deep', { 'src/app/app.cpp': 'int main(){}' });
  const t = loadTemplate(dir);
  const vars = buildVars({ template: t.json, projectName: 'P', dirName: 'P', answers: {} });
  const plan = buildPlan({
    templateDir: dir,
    template: t.json,
    vars,
    selectedGroups: [],
    outDir: path.join(dir, 'out'),
  });
  assert.deepEqual(
    plan.dirs.map((d) => d.rel),
    ['src', 'src/app'],
  );
  assert.deepEqual(
    plan.files.map((f) => f.rel),
    ['src/app/app.cpp'],
  );
});

test('idFromDirName / fillDerivedFields 的规范化', () => {
  assert.equal(idFromDirName(path.join('/', 'My Tpl 2')), 'my-tpl-2');
  const json = {};
  assert.deepEqual(fillDerivedFields(json, path.join('/', 'FooBar')), ['id="foo-bar"', 'name="FooBar"']);
  assert.equal(json.id, 'foo-bar');
  assert.equal(json.name, 'FooBar');
  // 已经写了的字段不动
  const json2 = { id: 'keep-me', name: 'Keep' };
  assert.deepEqual(fillDerivedFields(json2, path.join('/', 'other')), []);
  assert.equal(json2.id, 'keep-me');
  assert.equal(bareTemplateJson(path.join('/', 'X')).id, 'x');
});
