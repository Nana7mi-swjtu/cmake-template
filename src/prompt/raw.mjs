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

function onKeypress(str, key) {
  const ev = { str: str || '', key: key || {} };
  if (waiter) {
    const resolve = waiter;
    waiter = null;
    resolve(ev);
  } else {
    queue.push(ev);
  }
}

function onEnd() {
  if (waiter) {
    const resolve = waiter;
    waiter = null;
    resolve(null);
  }
}

/** 挂上常驻的按键监听（只挂一次）。 */
function attach() {
  if (started) return;
  started = true;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', onKeypress);
  process.stdin.on('end', onEnd);
}

/**
 * 开始读键盘：ref + resume。
 * 上一次交互结束时已经把 stdin 还回去了（见 release），这里要收回来。
 */
function beginReading() {
  attach();
  if (typeof process.stdin.ref === 'function') process.stdin.ref();
  process.stdin.resume();
}

/**
 * 没有提示在跑的时候，把 stdin 还给进程：退出原始模式、停止读取、unref。
 *
 * 被 resume 过、又一直被引用的 stdin（真终端，或一直没关的管道）会一直把事件循环
 * 吊住：命令明明已经跑完，进程却不退出，非得 Ctrl+C（而且取消后还要再按一次）。
 * 监听和按键队列都保留：下次提问 beginReading 会重新 ref/resume，
 * 提问间隙敲进来的按键也不会丢。
 */
function release() {
  if (!started) return;
  if (typeof process.stdin.setRawMode === 'function') {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // 非 TTY：没这回事
    }
  }
  if (typeof process.stdin.pause === 'function') process.stdin.pause();
  if (typeof process.stdin.unref === 'function') process.stdin.unref();
}

/** 命令收尾时兜底调用：确保没有任何东西还挂着事件循环。 */
export function releaseInput() {
  rawDepth = 0;
  waiter = null;
  release();
}

function nextKey() {
  beginReading();
  if (queue.length > 0) return Promise.resolve(queue.shift());
  return new Promise((resolve) => {
    waiter = resolve;
  });
}

function enterRaw() {
  beginReading();
  rawDepth += 1;
  if (rawDepth === 1 && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true);
  }
}

function exitRaw() {
  rawDepth = Math.max(0, rawDepth - 1);
  if (rawDepth === 0) release();
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
