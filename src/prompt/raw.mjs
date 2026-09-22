import readline from 'node:readline';
import { AbortError } from '../util/errors.mjs';
import { c, displayWidth, truncateDisplay } from '../util/color.mjs';

/**
 * 是否处于可交互环境。
 * CTPL_FORCE_TTY=1 仅供测试：让管道输入也能走交互式分支。
 */
export const isInteractive = () =>
  process.env.CTPL_FORCE_TTY === '1' ||
  Boolean(process.stdin.isTTY && process.stdout.isTTY);

// ── 按键队列 ────────────────────────────────────────────────────────────
// 只挂一个常驻 keypress 监听，把按键推进队列，由各个 widget 依次消费。
// 这样「一次到达的一整块输入」（粘贴、管道、快速连按）不会跨提示丢失。
const queue = [];
let waiter = null;
let started = false;
let rawDepth = 0;

function start() {
  if (started) return;
  started = true;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', (str, key) => {
    const ev = { str: str || '', key: key || {} };
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(ev);
    } else {
      queue.push(ev);
    }
  });
  process.stdin.on('end', () => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(null);
    }
  });
  process.stdin.resume();
}

function nextKey() {
  start();
  if (queue.length > 0) return Promise.resolve(queue.shift());
  return new Promise((resolve) => {
    waiter = resolve;
  });
}

function enterRaw() {
  start();
  rawDepth += 1;
  if (rawDepth === 1 && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true);
  }
}

function exitRaw() {
  rawDepth = Math.max(0, rawDepth - 1);
  if (rawDepth === 0 && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false);
  }
}

/** 当前可用的显示列数（管道 / 非 TTY 时按 80）。 */
function usableColumns() {
  const cols = Number(process.stdout.columns) || 80;
  return Math.max(1, cols - 1);
}

/**
 * 跑一个按键交互：handler(str, key) 返回非 undefined 即结束，该值作为 Promise 结果。
 */
export async function runKeys(handler, { onStart } = {}) {
  enterRaw();
  if (onStart) onStart();
  try {
    for (;;) {
      const ev = await nextKey();
      if (!ev) throw new AbortError('输入已结束');
      const { str, key } = ev;
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\n');
        throw new AbortError();
      }
      const result = handler(str, key);
      if (result !== undefined) return result;
    }
  } finally {
    exitRaw();
  }
}

/**
 * 单行「问题 + 输入」的画笔。
 * 输入（比如很长的绝对路径）超过一行时，光标停在最后一行，
 * 所以要先上移到这块的起始行，用 \u001b[0J 把整块抹掉再重画。
 */
export function linePainter(question) {
  const prefix = `${c.cyan('?')} ${question} ${c.gray('›')}`;
  const cols = usableColumns();
  let rows = 0;
  const rowCount = (line) => Math.max(1, Math.ceil(displayWidth(line) / cols));

  const write = (line, newline) => {
    let s = '';
    if (rows > 1) s += `\u001b[${rows - 1}A`;
    s += `\r\u001b[0J${line}`;
    if (newline) s += '\n';
    process.stdout.write(s);
    rows = newline ? 0 : rowCount(line);
  };

  return {
    paint(value, note) {
      write(`${prefix} ${value}${note ? ' ' + c.red('✘ ' + note) : ''}`, false);
    },
    finish(value) {
      write(`${prefix} ${value}`, true);
    },
  };
}

/** 多行菜单的画笔：原地重绘，不滚屏。 */
export function menuPainter() {
  let painted = 0;
  // 每一行都先截断到一个终端行 —— 一旦某行换行，光标上移的行数与
  // 实际占用行数不一致，重绘就会把旧菜单留在屏幕上（重复出现）。
  const fit = (lines) => lines.map((l) => truncateDisplay(l ?? '', usableColumns()));
  return {
    paint(lines) {
      const fitted = fit(lines);
      let s = '';
      if (painted > 0) s += `\u001b[${painted}A`;
      for (let i = 0; i < Math.max(painted, fitted.length); i++) {
        s += `\r\u001b[2K${fitted[i] || ''}\n`;
      }
      process.stdout.write(s);
      painted = fitted.length;
    },
    finish(summary) {
      let s = '';
      if (painted > 0) s += `\u001b[${painted}A`;
      for (let i = 0; i < painted; i++) s += '\r\u001b[2K\n';
      if (painted > 0) s += `\u001b[${painted}A`;
      s += `\r\u001b[2K${truncateDisplay(summary, usableColumns())}\n`;
      process.stdout.write(s);
      painted = 0;
    },
  };
}

export function clampIndex(i, length) {
  if (length <= 0) return 0;
  if (i < 0) return 0;
  if (i >= length) return length - 1;
  return i;
}
