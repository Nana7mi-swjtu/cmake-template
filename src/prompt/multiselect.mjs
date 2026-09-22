import { runKeys, menuPainter, isInteractive, clampIndex } from './raw.mjs';
import { c } from '../util/color.mjs';

/**
 * ↑↓ 移动 + Space 勾选 + a 全选/全不选 + Enter 确认。
 * items: [{ value, label, checked }]，返回被勾选的 value 数组。
 * 非交互环境返回初始 checked 的项。
 */
export async function multiselect(question, items, { minSelected = 0 } = {}) {
  if (!items || items.length === 0) return [];
  if (!isInteractive()) return items.filter((i) => i.checked).map((i) => i.value);

  let index = clampIndex(0, items.length);
  const checked = items.map((it) => Boolean(it.checked));
  const painter = menuPainter();
  let note = '';

  const lines = () => [
    `${c.cyan('?')} ${question} ${c.gray('(↑↓ 移动，Space 勾选，a 全选，Enter 确认)')}`,
    ...items.map((it, i) => {
      const head = i === index ? c.cyan('❯') : ' ';
      const box = checked[i] ? c.green('[x]') : '[ ]';
      const label = i === index ? c.bold(it.label ?? it.value) : it.label ?? it.value;
      return `${head} ${box} ${label}${it.hint ? '  ' + c.gray(it.hint) : ''}`;
    }),
    note ? c.red(`  ✘ ${note}`) : '',
  ];

  const draw = () => painter.paint(lines().filter((l, i) => l !== '' || i < 2));

  const result = await runKeys(
    (str, key) => {
      switch (key.name) {
        case 'up':
        case 'k':
          index = (index - 1 + items.length) % items.length;
          note = '';
          draw();
          return undefined;
        case 'down':
        case 'j':
          index = (index + 1) % items.length;
          note = '';
          draw();
          return undefined;
        case 'space':
          checked[index] = !checked[index];
          note = '';
          draw();
          return undefined;
        case 'a': {
          const allOn = checked.every(Boolean);
          for (let i = 0; i < checked.length; i++) checked[i] = !allOn;
          draw();
          return undefined;
        }
        case 'return':
        case 'enter': {
          const picked = items.filter((_, i) => checked[i]);
          if (picked.length < minSelected) {
            note = `至少选 ${minSelected} 项`;
            draw();
            return undefined;
          }
          painter.finish(
            `${c.cyan('?')} ${question} ${c.gray('›')} ${
              picked.length ? picked.map((p) => p.label ?? p.value).join('、') : c.gray('(无)')
            }`,
          );
          return picked.map((p) => p.value);
        }
        default:
          return undefined;
      }
    },
    { onStart: draw },
  );

  return result;
}
