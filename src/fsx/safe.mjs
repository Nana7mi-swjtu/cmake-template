import { CtplError } from '../util/errors.mjs';

// Windows 文件名非法字符（控制字符单独判断）
const ILLEGAL_CHARS = /[<>:"|?*]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function bad(message) {
  throw new CtplError(message, { code: 'E_BAD_PATH', exitCode: 1 });
}

/**
 * 校验模板里声明的相对路径，返回归一化后的 posix 路径。
 * 拒绝：绝对路径、盘符、UNC、`..`、非法字符、Windows 保留名、结尾的点/空格。
 */
export function assertSafeRelPath(rel, { what = '路径' } = {}) {
  if (typeof rel !== 'string' || !rel.trim()) bad(`${what}必须是非空字符串`);
  const raw = rel.trim().replace(/\\/g, '/');

  if (/^[a-zA-Z]:/.test(raw)) bad(`${what}不能带盘符：${rel}`);
  if (raw.startsWith('/')) bad(`${what}不能是绝对路径：${rel}`);
  if (raw.startsWith('//')) bad(`${what}不能是 UNC 路径：${rel}`);

  const segments = raw.split('/').filter((s) => s !== '');
  if (segments.length === 0) bad(`${what}为空：${rel}`);

  for (const seg of segments) {
    if (seg === '.' || seg === '..') bad(`${what}不能包含 "." 或 ".."：${rel}`);
    if (ILLEGAL_CHARS.test(seg)) bad(`${what}含非法字符（<>:"|?*）：${rel}`);
    if (CONTROL_CHARS.test(seg)) bad(`${what}含控制字符：${rel}`);
    if (RESERVED_NAMES.test(seg)) bad(`${what}使用了 Windows 保留名 "${seg}"：${rel}`);
    if (/[. ]$/.test(seg)) bad(`${what}的某一段以点或空格结尾：${rel}`);
  }

  return segments.join('/');
}

/** CMake project() 名：字母或下划线开头，允许字母数字 _ . - */
export function assertValidProjectName(name) {
  const n = String(name ?? '').trim();
  if (!n) {
    throw new CtplError('项目名不能为空', { code: 'E_BAD_NAME', exitCode: 2 });
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(n)) {
    throw new CtplError(
      `项目名非法：${n}\n` +
        `  只允许字母、数字、下划线、点、连字符，且必须以字母或下划线开头。\n` +
        `  建议改成：${suggestProjectName(n)}`,
      { code: 'E_BAD_NAME', exitCode: 2 },
    );
  }
  return n;
}

/** CMake target 名：字母数字或下划线开头，允许 . + - */
export function assertValidTargetName(name) {
  const n = String(name ?? '').trim();
  if (!n) throw new CtplError('target 名不能为空', { code: 'E_BAD_TARGET', exitCode: 2 });
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/.test(n)) {
    throw new CtplError(
      `target 名非法：${n}\n  只允许字母、数字、下划线、点、加号、连字符。`,
      { code: 'E_BAD_TARGET', exitCode: 2 },
    );
  }
  return n;
}

/** 由任意输入猜一个合法的项目名（用于报错提示里的"建议改成"）。 */
export function suggestProjectName(input) {
  let s = String(input ?? '').trim();
  s = s.replace(/[^A-Za-z0-9_.-]+/g, '_');
  s = s.replace(/^[^A-Za-z_]+/, '');
  s = s.replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = 'my_project';
  if (!/^[A-Za-z_]/.test(s)) s = `p_${s}`;
  return s;
}

/** 目标目录名校验（拿目录名当默认项目名时会用到）。 */
export function assertValidDirName(name) {
  const n = String(name ?? '').trim();
  if (!n) throw new CtplError('目录名不能为空', { code: 'E_BAD_DIR', exitCode: 2 });
  if (ILLEGAL_CHARS.test(n) || RESERVED_NAMES.test(n) || CONTROL_CHARS.test(n)) {
    throw new CtplError(`目录名非法：${n}`, { code: 'E_BAD_DIR', exitCode: 2 });
  }
  return n;
}
