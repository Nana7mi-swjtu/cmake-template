import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, parentDirs } from '../../src/template/layout.mjs';
import {
  assertSafeRelPath,
  assertValidProjectName,
  assertValidTargetName,
  suggestProjectName,
} from '../../src/fsx/safe.mjs';
import { matchGlob } from '../../src/util/glob.mjs';

test('layout 三种写法归一化结果一致', () => {
  const a = normalizeLayout(['src', 'src/app', 'include'], { vars: {} });
  const b = normalizeLayout({ src: { app: {} }, include: {} }, { vars: {} });
  const c = normalizeLayout([{ path: 'src' }, { path: 'src/app' }, { path: 'include' }], {
    vars: {},
  });
  const rels = (x) => x.map((i) => i.rel);
  assert.deepEqual(rels(a), ['include', 'src', 'src/app']);
  assert.deepEqual(rels(b), rels(a));
  assert.deepEqual(rels(c), rels(a));
});

test('layout 支持文件占位与变量渲染', () => {
  const items = normalizeLayout({ 'main.cpp': null, src: {} }, { vars: { ns: '' } });
  assert.deepEqual(
    items.map((i) => [i.rel, i.file]),
    [
      ['main.cpp', true],
      ['src', false],
    ],
  );
  assert.deepEqual(
    normalizeLayout(['include/{{ns?}}/x'], { vars: { ns: '' } }).map((i) => i.rel),
    ['include/x'],
  );
});

test('layout 拒绝越界路径与重复声明', () => {
  assert.throws(() => normalizeLayout(['../x'], { vars: {} }), /layout 路径/);
  assert.throws(() => normalizeLayout(['/abs'], { vars: {} }), /layout 路径/);
  assert.throws(() => normalizeLayout(['C:/x'], { vars: {} }), /layout 路径/);
  assert.throws(() => normalizeLayout(['src', 'src'], { vars: {} }), /重复/);
});

test('parentDirs', () => {
  assert.deepEqual(parentDirs('a/b/c.txt'), ['a', 'a/b']);
  assert.deepEqual(parentDirs('a.txt'), []);
});

test('路径安全：非法字符、保留名、绝对路径、.. 全部拒绝', () => {
  assert.equal(assertSafeRelPath('src/app'), 'src/app');
  assert.equal(assertSafeRelPath('src\\app'), 'src/app');
  assert.equal(assertSafeRelPath('a//b'), 'a/b');
  for (const bad of ['', '..', '../x', 'a/../b', '/abs', 'C:/x', 'con', 'aux.txt', 'a<b', 'x.', 'a\u0001b']) {
    assert.throws(() => assertSafeRelPath(bad), /路径/, `应该拒绝：${bad}`);
  }
});

test('项目名 / target 名校验与建议', () => {
  assert.equal(assertValidProjectName('MyRender'), 'MyRender');
  assert.equal(assertValidProjectName('my_render2'), 'my_render2');
  assert.throws(() => assertValidProjectName('2bad'), /项目名非法/);
  assert.throws(() => assertValidProjectName('my render'), /项目名非法/);
  assert.throws(() => assertValidProjectName(''), /不能为空/);
  assert.match(suggestProjectName('my proj!'), /^[A-Za-z_][A-Za-z0-9_.-]*$/);

  assert.equal(assertValidTargetName('my_render-core'), 'my_render-core');
  assert.throws(() => assertValidTargetName('-bad'), /target 名非法/);
});

test('glob 匹配', () => {
  assert.equal(matchGlob('tests/a.cpp', 'tests/**'), true);
  assert.equal(matchGlob('tests/sub/a.cpp', 'tests/**'), true);
  assert.equal(matchGlob('src/a.cpp', 'tests/**'), false);
  assert.equal(matchGlob('.github/workflows/ci.yml', '.github/**/*.yml'), true);
  assert.equal(matchGlob('a.txt', '*.txt'), true);
  assert.equal(matchGlob('sub/a.txt', '*.txt'), false);
});
