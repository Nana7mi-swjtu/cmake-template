import readline from 'node:readline';
import { AbortError } from '../util/errors.mjs';
import { c } from '../util/color.mjs';

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

export function hasPendingKeys() {
  return queue.length > 0;
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

/** 单行「问题 + 输入」的画笔。 */
export function linePainter(question) {
  const prefix = `${c.cyan('?')} ${question} ${c.gray('›')}`;
  return {
    paint(value, note) {
      process.stdout.write(
        `\r\u001b[K${prefix} ${value}${note ? ' ' + c.red('✘ ' + note) : ''}`,
      );
    },
    finish(value) {
      process.stdout.write(`\r\u001b[K${prefix} ${value}\n`);
    },
  };
}

/** 多行菜单的画笔：原地重绘，不滚屏。 */
export function menuPainter() {
  let painted = 0;
  return {
    paint(lines) {
      let s = '';
      if (painted > 0) s += `\u001b[${painted}A`;
      for (let i = 0; i < Math.max(painted, lines.length); i++) {
        s += `\r\u001b[2K${lines[i] || ''}\n`;
      }
      process.stdout.write(s);
      painted = lines.length;
    },
    finish(summary) {
      let s = '';
      if (painted > 0) s += `\u001b[${painted}A`;
      for (let i = 0; i < painted; i++) s += '\r\u001b[2K\n';
      if (painted > 0) s += `\u001b[${painted}A`;
      s += `\r\u001b[2K${summary}\n`;
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
