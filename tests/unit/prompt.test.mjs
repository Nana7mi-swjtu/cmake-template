import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrintableInput } from '../../src/prompt/text.mjs';
import { linePainter, menuPainter } from '../../src/prompt/raw.mjs';
import { displayWidth, truncateDisplay } from '../../src/util/color.mjs';

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

test('显示宽度：CJK 算 2 列，ANSI 转义不计', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('中文'), 4);
  assert.equal(displayWidth('\u001b[36mab\u001b[0m'), 2);
});

test('truncateDisplay 按显示宽度截断并补 …', () => {
  assert.equal(truncateDisplay('abcdef', 4), 'abc…');
  assert.equal(truncateDisplay('中文中文', 5), '中文…');
  assert.equal(truncateDisplay('abc', 10), 'abc');
  assert.equal(truncateDisplay('bbbb', 0), '');
});

// 一个极小的 ANSI 屏幕模拟器：只处理画笔画到的东西 —— \r、\n、光标上移、
// 清行、清屏到尾、颜色序列，以及超宽自动换行。用来把“屏幕上到底留下了什么”断言出来。
function renderScreen(chunks, cols = 20) {
  const screen = [];
  let row = 0;
  let col = 0;
  const put = (ch) => {
    const line = screen[row] || '';
    screen[row] = line.slice(0, col).padEnd(col, ' ') + ch + line.slice(col + ch.length);
    col += ch.length;
    if (col >= cols) {
      row += 1;
      col = 0;
    }
  };
  const text = chunks.join('');
  for (let i = 0; i < text.length; i++) {
    const rest = text.slice(i);
    const up = /^\u001b\[(\d+)A/.exec(rest);
    if (up) {
      row = Math.max(0, row - Number(up[1]));
      i += up[0].length - 1;
      continue;
    }
    if (rest.startsWith('\u001b[0J')) {
      screen[row] = (screen[row] || '').slice(0, col);
      screen.length = row + 1;
      i += 3;
      continue;
    }
    const clr = /^\u001b\[2K/.exec(rest);
    if (clr) {
      if (screen[row] !== undefined) screen[row] = '';
      i += clr[0].length - 1;
      continue;
    }
    const sgr = /^\u001b\[[0-9;]*m/.exec(rest);
    if (sgr) {
      i += sgr[0].length - 1;
      continue;
    }
    const ch = text[i];
    if (ch === '\r') col = 0;
    else if (ch === '\n') {
      row += 1;
      col = 0;
    } else put(ch);
  }
  return screen;
}

/** 把 stdout 换成假的（带固定列数），跑一段绘制后返回所有写入。 */
function capture(cols, fn) {
  const savedColumns = process.stdout.columns;
  const savedWrite = process.stdout.write;
  const writes = [];
  process.stdout.write = (s) => {
    writes.push(String(s));
    return true;
  };
  process.stdout.columns = cols;
  try {
    fn();
  } finally {
    process.stdout.write = savedWrite;
    process.stdout.columns = savedColumns;
  }
  return writes;
}

// 这个测试挡住的是“上下移动时菜单被重复打印”：只要有一行会换行，
// menuPainter 上移的行数就会算错，重绘会把旧菜单留在屏幕上。
test('menuPainter 把每行截断到一个终端行', () => {
  const writes = capture(20, () => {
    const painter = menuPainter();
    painter.paint(['? 选择模板', '❯ 一个非常非常长的选项标签，长到一定会超过终端宽度']);
    painter.paint(['? 选择模板', '❯ 另一个同样很长的选项标签，用来触发重绘']);
    painter.finish('? 选择模板 › 选中了');
  });

  // 每个文本行都不超过 columns-1 列
  for (const line of writes.join('').split('\n')) {
    assert.ok(displayWidth(line) <= 19, `超宽：${JSON.stringify(line)}`);
  }
});

test('menuPainter 重绘后屏幕上只剩一份菜单', () => {
  const writes = capture(20, () => {
    const painter = menuPainter();
    for (let i = 0; i < 4; i++) {
      painter.paint([
        '? 附加动作 (↑↓ 移动，Space 勾选，a 全选，Enter 确认)',
        `❯ [x] 一个很长很长的选项 ${i}`,
        '  [ ] 另一个很长很长的选项',
      ]);
    }
    painter.finish('? 附加动作 › 已选好');
  });

  const lines = renderScreen(writes, 20).filter((l) => l.trim() !== '');
  assert.equal(lines.length, 1, `屏幕上残留了多份内容：${JSON.stringify(lines)}`);
  assert.match(lines[0], /已选好/);
});

test('linePainter 输入换行时不会在屏幕上留残影', () => {
  const writes = capture(20, () => {
    const painter = linePainter('目标目录');
    painter.paint('C:/tmp/very-long-directory-name/nested/deeper/My');
    painter.finish('C:/tmp/very-long-directory-name/nested/deeper/MyApp');
  });

  const joined = renderScreen(writes, 20).join('');
  // 长输入本来就会占多行；这里要确保的是没有残留的旧画面
  assert.equal((joined.match(/目标目录/g) || []).length, 1, `屏幕上有重复：${JSON.stringify(joined)}`);
  assert.match(joined, /MyApp$/);
});
