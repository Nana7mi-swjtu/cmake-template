import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, parseSets, splitCsv, coerce } from '../../src/cli/args.mjs';

test('长短选项、= 与空格取值', () => {
  const a = parseArgs(['new', 'D:/p', '--template=foo', '--name', 'Bar', '--yes']);
  assert.equal(a.positionals[0], 'new');
  assert.equal(a.positionals[1], 'D:/p');
  assert.equal(a.flags.template, 'foo');
  assert.equal(a.flags.name, 'Bar');
  assert.equal(a.flags.yes, true);

  // 短选项带值（曾经把值当成位置参数的 bug）
  const b = parseArgs(['new', 'D:/p', '-t', 's1', '-y']);
  assert.equal(b.flags.template, 's1');
  assert.equal(b.flags.yes, true);
  assert.deepEqual(b.positionals, ['new', 'D:/p']);

  // 短选项连写 + 尾随值
  const c = parseArgs(['-yt', 's1']);
  assert.equal(c.flags.yes, true);
  assert.equal(c.flags.template, 's1');

  // -t=s1 形式（内联）
  const d = parseArgs(['-ts1']);
  assert.equal(d.flags.template, 's1');
});

test('--no-x 与布尔开关', () => {
  const a = parseArgs(['new', 'D:/p', '--no-git', '--open', '--force']);
  assert.equal(a.flags.git, false);
  assert.equal(a.flags.open, true);
  assert.equal(a.flags.force, true);
});

test('可重复选项收进 lists', () => {
  const a = parseArgs(['--set', 'a=1', '--set', 'b=2', '--replace-literal', 'x={{y}}']);
  assert.deepEqual(a.lists.set, ['a=1', 'b=2']);
  assert.deepEqual(a.lists['replace-literal'], ['x={{y}}']);
  assert.deepEqual(parseSets(a.lists), { a: 1, b: 2 });
});

test('-- 之后全部当位置参数', () => {
  const a = parseArgs(['new', '--', '--weird-dir']);
  assert.deepEqual(a.positionals, ['new', '--weird-dir']);
});

test('缺少值时报错，退出码 2', () => {
  assert.throws(() => parseArgs(['--template']), /需要跟一个值/);
  assert.throws(() => parseSets({ set: ['nope'] }), /key=value/);
});

test('coerce 与 splitCsv', () => {
  assert.equal(coerce('true'), true);
  assert.equal(coerce('false'), false);
  assert.equal(coerce('17'), 17);
  assert.equal(coerce('17.5'), 17.5);
  assert.deepEqual(coerce('a,b'), ['a', 'b']);
  assert.equal(coerce('hello'), 'hello');
  assert.deepEqual(splitCsv('a, b ,,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCsv(['a', 'b,c']), ['a', 'b', 'c']);
  assert.deepEqual(splitCsv(undefined), []);
});
