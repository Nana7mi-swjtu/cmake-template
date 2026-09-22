import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTemplate } from '../../src/template/schema.mjs';
import { parseJsonc, deepMerge } from '../../src/vscode/integrate.mjs';

const base = {
  schemaVersion: 1,
  id: 'demo',
  name: '演示模板',
  layout: ['src'],
};

test('合法模板无错误', () => {
  const { errors, warnings } = validateTemplate(base);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('缺少必填 / 版本不符要报错', () => {
  assert.ok(validateTemplate({ ...base, schemaVersion: 2 }).errors.length > 0);
  assert.ok(validateTemplate({ ...base, id: 'Bad Id' }).errors.length > 0);
  assert.ok(validateTemplate({ ...base, name: '' }).errors.length > 0);
  assert.ok(validateTemplate({ ...base, layout: 42 }).errors.length > 0);
  // layout / schemaVersion 现在都可以省（loader 会补默认值）
  assert.deepEqual(validateTemplate({ ...base, layout: undefined }).errors, []);
  assert.ok(validateTemplate({ ...base, schemaVersion: undefined }).warnings.length > 0);
});

test('CMake 版本底线（C6）', () => {
  const low = validateTemplate({ ...base, cmake: { minVersion: '3.0' } });
  assert.ok(low.errors.some((e) => e.includes('3.5')));

  const old = validateTemplate({ ...base, cmake: { minVersion: '3.10' } });
  assert.deepEqual(old.errors, []);
  assert.ok(old.warnings.some((w) => w.includes('3.20')));
});

test('未知字段只告警', () => {
  const { errors, warnings } = validateTemplate({ ...base, whatever: 1 });
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
});

test('layout 的四种写法', () => {
  assert.deepEqual(validateTemplate({ ...base, layout: ['a', { path: 'b', keep: true }] }).errors, []);
  assert.deepEqual(validateTemplate({ ...base, layout: { a: { b: null } } }).errors, []);
  assert.deepEqual(validateTemplate({ ...base, layout: [] }).errors, []);
  assert.ok(validateTemplate({ ...base, layout: ['a', 7] }).errors.length > 0);
});

test('变量定义校验', () => {
  const bad = validateTemplate({
    ...base,
    variables: [{ key: '1bad', type: 'nope' }, { key: 'x', type: 'select' }],
  });
  assert.ok(bad.errors.length >= 3);
});

test('JSONC 解析与合并（VS Code settings）', () => {
  const text = `{
    // 注释
    "cmake.generator": "Ninja",
    /* 块注释 */
    "cmake.preferredGenerators": ["Ninja",],
  }`;
  const parsed = parseJsonc(text);
  assert.equal(parsed['cmake.generator'], 'Ninja');
  assert.deepEqual(parsed['cmake.preferredGenerators'], ['Ninja']);

  const merged = deepMerge({ a: [1, 2], b: { c: 1 } }, { a: [2, 3], b: { d: 2 } });
  assert.deepEqual(merged, { a: [1, 2, 3], b: { c: 1, d: 2 } });
});
