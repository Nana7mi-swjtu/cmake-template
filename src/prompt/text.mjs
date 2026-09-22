import { runKeys, linePainter, isInteractive } from './raw.mjs';
import { c } from '../util/color.mjs';
import { fail } from '../util/errors.mjs';

/** F1–F12 之类的功能键：readline 会把它们的 str 也给成可打印字符，必须显式排掉。 */
const FUNCTION_KEY = /^f([1-9]|1[0-2])$/;
const NAV_KEYS = new Set([
  'left',
  'right',
  'up',
  'down',
  'home',
  'end',
  'pageup',
  'pagedown',
  'insert',
  'delete',
  'tab',
  'escape',
]);

/** 这段输入算不算“用户敲了一个字符”。 */
export function isPrintableInput(str, key) {
  if (!str) return false;
  if (key.ctrl || key.meta) return false;
  const name = key.name || '';
  if (FUNCTION_KEY.test(name)) return false;
  if (NAV_KEYS.has(name)) return false;
  // 去掉控制字符，避免把 \u0001 之类的哨兵混进文件名
  // eslint-disable-next-line no-control-regex
  return /[^\u0000-\u001f\u007f]/.test(str);
}

/**
 * 文本输入。
 *   - defaultValue 按下回车即采用
 *   - validate(value) 返回字符串表示校验失败
 *   - required 表示不接受空值
 * 非交互环境（管道 / CI）直接返回默认值，required 且无默认值时抛错（决策 #7）。
 */
export async function text(
  question,
  { defaultValue = '', required = false, validate = null, placeholder = '' } = {},
) {
  if (!isInteractive()) {
    if (required && !String(defaultValue ?? '').trim()) {
      fail(`非交互环境下「${question}」必须显式提供`, { code: 'E_NO_INPUT', exitCode: 2 });
    }
    return String(defaultValue ?? '');
  }

  let value = '';
  const painter = linePainter(question);

  return runKeys(
    (str, key) => {
      if (key.name === 'return' || key.name === 'enter') {
        const finalValue = value.trim() !== '' ? value : String(defaultValue ?? '');
        const problem = validate ? validate(finalValue) : null;
        if (problem) {
          painter.paint(value, problem);
          return undefined;
        }
        if (required && !finalValue.trim()) {
          painter.paint(value, '必填，不能为空');
          return undefined;
        }
        painter.finish(finalValue);
        return finalValue;
      }

      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        painter.paint(value || '');
        return undefined;
      }

      if (key.name === 'escape') {
        painter.finish(value);
        return value;
      }

      if (str && isPrintableInput(str, key)) {
        value += str.replace(/[\u0000-\u001f\u007f]/g, '');
        painter.paint(value);
      }
      return undefined;
    },
    {
      onStart: () =>
        painter.paint(
          defaultValue ? c.gray(defaultValue) : placeholder ? c.gray(placeholder) : '',
        ),
    },
  );
}
