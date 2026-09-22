import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrintableInput } from '../../src/prompt/text.mjs';

test('普通字母（含 f / F）不能被当成功能键吞掉', () => {
  assert.equal(isPrintableInput('f', { name: 'f' }), true);
  assert.equal(isPrintableInput('F', { name: 'f', shift: true }), true);
  assert.equal(isPrintableInput('a', { name: 'a' }), true);
  assert.equal(isPrintableInput('D:/tmp/Foo', { name: undefined }), true);
});

test('功能键 / 导航键 / 控制字符要过滤掉', () => {
  assert.equal(isPrintableInput('f1', { name: 'f1' }), false);
  assert.equal(isPrintableInput('', { name: 'left' }), false);
  assert.equal(isPrintableInput('', { name: 'return' }), false);
  assert.equal(isPrintableInput('c', { name: 'c', ctrl: true }), false);
  assert.equal(isPrintableInput('\u0001', { name: undefined }), false);
  assert.equal(isPrintableInput('\u007f', { name: undefined }), false);
});
