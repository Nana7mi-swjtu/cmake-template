import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitWords,
  snake,
  pascal,
  camel,
  kebab,
  upper,
  lower,
  deriveNames,
} from '../../src/template/naming.mjs';

test('切词：非字母数字 / 大小写边界 / 字母数字边界都断开', () => {
  assert.deepEqual(splitWords('MyRender'), ['My', 'Render']);
  assert.deepEqual(splitWords('my-render_x'), ['my', 'render', 'x']);
  assert.deepEqual(splitWords('My Render2D'), ['My', 'Render', '2', 'D']);
  assert.deepEqual(splitWords('XMLParser'), ['XML', 'Parser']);
  assert.deepEqual(splitWords('HTTP2Server'), ['HTTP', '2', 'Server']);
});

test('命名风格转换', () => {
  assert.equal(snake('MyRender'), 'my_render');
  assert.equal(snake('My Render2D'), 'my_render_2_d');
  assert.equal(snake('my-render'), 'my_render');
  assert.equal(snake('XMLParser'), 'xml_parser');
  assert.equal(snake('HTTP2Server'), 'http_2_server');

  assert.equal(pascal('my render'), 'MyRender');
  assert.equal(pascal('XMLParser'), 'XMLParser');
  assert.equal(camel('My Render'), 'myRender');
  assert.equal(kebab('MyRender'), 'my-render');
  assert.equal(upper('MyRender2D'), 'MY_RENDER_2_D');
  assert.equal(lower('MyRender2D'), 'myrender2d');
});

test('deriveNames 至少保证 snake/upper 非空', () => {
  const d = deriveNames('MyRender2D');
  assert.equal(d.projectNameSnake, 'my_render_2_d');
  assert.equal(d.projectNameUpper, 'MY_RENDER_2_D');
  assert.equal(d.projectNameKebab, 'my-render-2-d');
  assert.equal(d.projectNameCamel, 'myRender2D');

  // 空 / 纯符号输入不能产出空标识符
  assert.equal(deriveNames('').projectNameSnake, 'project');
  assert.equal(deriveNames('!!!').projectNameUpper, 'PROJECT');
});
