import { runKeys, menuPainter, isInteractive, clampIndex } from './raw.mjs';
import { c } from '../util/color.mjs';
import { fail } from '../util/errors.mjs';

/**
 * ↑↓ 单选。items: [{ value, label, hint }]
 * 非交互环境返回 defaultIndex 对应的项。
 */
export async function select(question, items, { defaultIndex = 0 } = {}) {
  if (!items || items.length === 0) {
    fail('没有可选的模板', { code: 'E_EMPTY', exitCode: 2 });
  }
  if (!isInteractive()) return items[clampIndex(defaultIndex, items.length)];

  let index = clampIndex(defaultIndex, items.length);
  const painter = menuPainter();

  const lines = () =>
    items.map((it, i) => {
      const label = it.label ?? String(it.value);
      const head = i === index ? c.cyan('❯') : ' ';
      const body = i === index ? c.bold(label) : label;
      return `${head} ${body}${it.hint ? '  ' + c.gray(it.hint) : ''}`;
    });

  const draw = () => painter.paint([`${c.cyan('?')} ${question}`, ...lines()]);

  const chosen = await runKeys(
    (str, key) => {
      switch (key.name) {
        case 'up':
        case 'k':
          index = (index - 1 + items.length) % items.length;
          draw();
          return undefined;
        case 'down':
        case 'j':
          index = (index + 1) % items.length;
          draw();
          return undefined;
        case 'return':
        case 'enter': {
          const it = items[index];
          painter.finish(
            `${c.cyan('?')} ${question} ${c.gray('›')} ${it.label ?? it.value}`,
          );
          return it;
        }
        default:
          return undefined;
      }
    },
    { onStart: draw },
  );

  return chosen;
}
