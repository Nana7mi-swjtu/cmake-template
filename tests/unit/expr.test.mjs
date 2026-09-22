import test from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr } from '../../src/template/expr.mjs';

test('真值与变量', () => {
  assert.equal(evalExpr('withTests', { withTests: true }), true);
  assert.equal(evalExpr('withTests', { withTests: false }), false);
  assert.equal(evalExpr('withTests', {}), undefined);
  assert.equal(evalExpr('', {}), false);
});

test('比较与算术式比较', () => {
  assert.equal(evalExpr("language == 'cpp'", { language: 'cpp' }), true);
  assert.equal(evalExpr('language != "cpp"', { language: 'c' }), true);
  assert.equal(evalExpr('cppStandard >= 17', { cppStandard: '20' }), true);
  assert.equal(evalExpr('cppStandard >= 17', { cppStandard: '11' }), false);
  assert.equal(evalExpr('std > 11 && std < 23', { std: 17 }), true);
});

test('逻辑运算与优先级', () => {
  assert.equal(evalExpr('a && b', { a: true, b: false }), false);
  assert.equal(evalExpr('a || b', { a: false, b: true }), true);
  assert.equal(evalExpr('!a', { a: false }), true);
  assert.equal(evalExpr('not a', { a: false }), true);
  assert.equal(evalExpr('a || b && c', { a: false, b: true, c: false }), false);
  assert.equal(evalExpr('(a || b) && c', { a: false, b: true, c: true }), true);
  assert.equal(evalExpr('a and b or c', { a: true, b: true, c: false }), true);
});

test('in 列表', () => {
  assert.equal(evalExpr('std in [11, 14, 17]', { std: 14 }), true);
  assert.equal(evalExpr("mode in ['release', 'debug']", { mode: 'debug' }), true);
  assert.equal(evalExpr("mode in ['release']", { mode: 'debug' }), false);
});

test('语法错误要报错，不能静默', () => {
  assert.throws(() => evalExpr('a ==', {}), /条件表达式/);
  assert.throws(() => evalExpr('(a', { a: 1 }), /括号没有闭合/);
  assert.throws(() => evalExpr('a b', { a: 1 }), /多余内容/);
  assert.throws(() => evalExpr('a # b', {}), /无法识别的字符/);
});
