import { c } from './color.mjs';

const out = (s) => process.stdout.write(s + '\n');
const err = (s) => process.stderr.write(s + '\n');

export const log = {
  /** 普通信息 */
  info(msg) {
    out(msg);
  },
  /** 标题/章节 */
  step(msg) {
    out('');
    out(c.bold(msg));
  },
  ok(msg) {
    out(`${c.green('✔')} ${msg}`);
  },
  warn(msg) {
    err(`${c.yellow('⚠')} ${msg}`);
  },
  fail(msg) {
    err(`${c.red('✘')} ${msg}`);
  },
  hint(msg) {
    out(c.gray(msg));
  },
  plain(msg) {
    out(msg);
  },
  /** 预览块（缩进 + 灰色） */
  preview(lines) {
    for (const l of lines) out(c.gray(l));
  },
};
