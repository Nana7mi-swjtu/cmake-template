import test from 'node:test';
import assert from 'node:assert/strict';
import { renderText } from '../../src/template/render.mjs';

const vars = { name: 'Foo', std: '20', withTests: false, ns: '' };

test('变量替换与转义', () => {
  assert.equal(renderText('{{name}}', vars), 'Foo');
  assert.equal(renderText('{{ name }}', vars), 'Foo');
  assert.equal(renderText('a\\{{name}}b', vars), 'a{{name}}b');
  assert.equal(renderText('{{! 这是注释 }}x', vars), 'x');
});

test('if / unless / else，支持嵌套', () => {
  assert.equal(renderText('{{#if withTests}}y{{else}}n{{/if}}', vars), 'n');
  assert.equal(renderText('{{#if std >= 17}}new{{/if}}', vars), 'new');
  assert.equal(renderText('{{#unless withTests}}no-tests{{/unless}}', vars), 'no-tests');
  assert.equal(
    renderText('{{#if withTests}}A{{#if std}}B{{/if}}C{{else}}D{{/if}}', vars),
    'D',
  );
  assert.equal(
    renderText('{{#if std}}{{#if name}}inner{{/if}}{{/if}}', vars),
    'inner',
  );
});

test('可选段 {{x?}}：为空时连同紧邻分隔符一起消失（仅路径模式）', () => {
  assert.equal(renderText('include/{{ns?}}/{{name}}', vars, { pathMode: true }), 'include/Foo');
  assert.equal(renderText('{{ns?}}_{{name}}', vars, { pathMode: true }), 'Foo');
  assert.equal(renderText('{{ns?}}/{{name}}', vars, { pathMode: true }), 'Foo');
  assert.equal(renderText('{{ns?}}/{{name}}', { ...vars, ns: 'api' }, { pathMode: true }), 'api/Foo');
});

test('未定义变量默认报错，--lenient 时置空', () => {
  assert.throws(() => renderText('{{nope}}', vars), /未定义/);
  assert.equal(renderText('{{nope}}', vars, { strict: false }), '');
});

test('语法错误要报错', () => {
  assert.throws(() => renderText('{{#if a}}x', { a: true }), /缺少/);
  assert.throws(() => renderText('{{/if}}', {}), /意外/);
  assert.throws(() => renderText('{{#each x}}{{/each}}', {}), /不支持的块/);
  assert.throws(() => renderText('{{name', vars), /没有闭合/);
});
