const enabled =
  process.env.NO_COLOR === undefined &&
  process.env.NO_COLOR !== '1' &&
  process.stdout.isTTY === true;

const wrap = (code) => (s) => (enabled ? `\u001b[${code}m${s}\u001b[0m` : String(s));

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
};

/** 去掉 ANSI 转义（含颜色与光标控制），用于计算显示宽度。 */
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
}

/** 单个码点的显示宽度：CJK / 全角按 2 列，控制字符 0 列，其余 1 列。 */
function pointWidth(cp) {
  if (cp < 0x20 || cp === 0x7f) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

/** 终端显示宽度（ANSI 转义不计入）。 */
export function displayWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += pointWidth(ch.codePointAt(0));
  return w;
}

const ANSI_RE = /^\u001b\[[0-9;?]*[A-Za-z]/;

/**
 * 按显示宽度截断（超长处补 …）。ANSI 转义序列不占宽度，也尽量保留。
 * 菜单必须保证“一行 = 一个终端行”，否则光标上移的行数算错，重绘会串行。
 */
export function truncateDisplay(s, maxWidth) {
  const text = String(s ?? '');
  if (maxWidth <= 0) return '';
  if (displayWidth(text) <= maxWidth) return text;

  const limit = Math.max(1, maxWidth - 1); // 留一格给 …
  let width = 0;
  let out = '';
  let i = 0;
  while (i < text.length && width < limit) {
    const m = ANSI_RE.exec(text.slice(i));
    if (m) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const w = pointWidth(cp);
    if (width + w > limit) break;
    out += ch;
    width += w;
    i += ch.length;
  }
  return `${out}\u2026${out.includes('\u001b[') ? '\u001b[0m' : ''}`;
}
