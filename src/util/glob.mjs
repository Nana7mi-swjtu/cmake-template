/**
 * 极简 glob → RegExp，只支持模板里会用到的东西：
 *   **  跨目录（包括零层）
 *   *   单层内任意字符（不跨 /）
 *   ?   单层内单个字符
 * 其余字符按字面量处理。
 */
export function globToRegExp(pattern) {
  const p = String(pattern).replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        // "**/" 允许匹配零层目录
        if (p[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchGlob(relPath, pattern) {
  return globToRegExp(pattern).test(String(relPath).replace(/\\/g, '/'));
}

export function matchAny(relPath, patterns) {
  return (patterns || []).some((p) => matchGlob(relPath, p));
}
