import { runKeys, isInteractive } from './raw.mjs';
import { c } from '../util/color.mjs';

/** y/N 确认。非交互环境直接返回 defaultValue。 */
export async function confirm(question, { defaultValue = true } = {}) {
  if (!isInteractive()) return defaultValue;

  const hint = defaultValue ? 'Y/n' : 'y/N';
  let answer = '';
  const prefix = `${c.cyan('?')} ${question} ${c.gray(`(${hint})`)}`;

  return runKeys(
    (str, key) => {
      if (key.name === 'return' || key.name === 'enter') {
        const v = answer.trim().toLowerCase();
        const result = v === '' ? defaultValue : v === 'y' || v === 'yes';
        process.stdout.write(
          `\r\u001b[K${c.cyan('?')} ${question} ${result ? c.green('是') : c.gray('否')}\n`,
        );
        return result;
      }
      if (key.name === 'backspace') {
        answer = answer.slice(0, -1);
      } else if (str && /^[a-zA-Z]$/.test(str)) {
        answer += str;
      } else {
        return undefined;
      }
      process.stdout.write(`\r\u001b[K${prefix} ${answer}`);
      return undefined;
    },
    { onStart: () => process.stdout.write(`\r\u001b[K${prefix} `) },
  );
}
