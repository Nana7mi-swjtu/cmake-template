/** 命名风格转换：按「非字母数字 / 全大写缩写 / 小写→大写 / 字母↔数字」边界切词。 */

export function splitWords(input) {
  const s = String(input ?? '').trim();
  if (!s) return [];
  return s
    .replace(/[^A-Za-z0-9]+/g, ' ')
    // XMLParser → XML Parser（缩写边界）
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const low = (w) => w.toLowerCase();

export const pascal = (s) => splitWords(s).map(cap).join('');
export const camel = (s) => {
  const w = splitWords(s);
  if (w.length === 0) return '';
  return low(w[0]) + w.slice(1).map(cap).join('');
};
export const snake = (s) => splitWords(s).map(low).join('_');
export const kebab = (s) => splitWords(s).map(low).join('-');
export const upper = (s) => splitWords(s).map(low).join('_').toUpperCase();
export const lower = (s) => splitWords(s).map(low).join('');

/** 由 projectName 得到一整套派生变量。 */
export function deriveNames(projectName) {
  return {
    projectNamePascal: pascal(projectName),
    projectNameCamel: camel(projectName),
    projectNameSnake: snake(projectName) || 'project',
    projectNameKebab: kebab(projectName) || 'project',
    projectNameUpper: upper(projectName) || 'PROJECT',
    projectNameLower: lower(projectName) || 'project',
  };
}
