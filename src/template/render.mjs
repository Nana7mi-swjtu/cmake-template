import { CtplError } from '../util/errors.mjs';
import { evalExpr } from './expr.mjs';

const SENTINEL = '\u0001';

/**
 * 极小的内容模板引擎：
 *   {{var}}         变量替换
 *   {{var?}}        可选变量：值为空时连同紧邻的分隔符一起消失（只用于路径）
 *   {{! 注释 }}      输出为空
 *   {{#if expr}} … {{else}} … {{/if}}
 *   {{#unless expr}} … {{/unless}}
 *   \{{             转义成字面量 {{
 */

function findTag(src, from) {
  let i = from;
  for (;;) {
    const idx = src.indexOf('{{', i);
    if (idx < 0) return null;
    if (idx > 0 && src[idx - 1] === '\\') {
      i = idx + 2;
      continue;
    }
    const end = src.indexOf('}}', idx + 2);
    if (end < 0) {
      throw new CtplError('模板语法错误：有一个 "{{" 没有闭合');
    }
    return { start: idx, end: end + 2, raw: src.slice(idx + 2, end).trim() };
  }
}

const unescapeText = (s) => s.replace(/\\\{\{/g, '{{');

function renderBlock(src, start, vars, opts, stopTags) {
  let out = '';
  let i = start;

  for (;;) {
    const tag = findTag(src, i);
    if (!tag) {
      out += unescapeText(src.slice(i));
      return { out, next: src.length, stop: null };
    }

    out += unescapeText(src.slice(i, tag.start));
    i = tag.end;
    const raw = tag.raw;

    if (raw === 'else' || raw.startsWith('/')) {
      if (stopTags.includes(raw)) return { out, next: i, stop: raw };
      throw new CtplError(`模板语法错误：意外的 {{${raw}}}`);
    }

    if (raw.startsWith('#if') || raw.startsWith('#unless')) {
      const negate = raw.startsWith('#unless');
      const exprText = raw.slice(negate ? 7 : 3).trim();
      const endTag = negate ? '/unless' : '/if';
      const value = Boolean(evalExpr(exprText, vars));
      const takeThen = negate ? !value : value;

      const thenPart = renderBlock(src, i, vars, opts, ['else', endTag]);
      let elseOut = '';
      let afterElse = thenPart.next;
      if (thenPart.stop === 'else') {
        const elsePart = renderBlock(src, thenPart.next, vars, opts, [endTag]);
        if (elsePart.stop !== endTag) {
          throw new CtplError(`模板语法错误：{{#${negate ? 'unless' : 'if'}}} 缺少 {{${endTag}}}`);
        }
        elseOut = elsePart.out;
        afterElse = elsePart.next;
      } else if (thenPart.stop !== endTag) {
        throw new CtplError(`模板语法错误：{{#${negate ? 'unless' : 'if'}}} 缺少 {{${endTag}}}`);
      }

      out += takeThen ? thenPart.out : elseOut;
      i = afterElse;
      continue;
    }

    if (raw.startsWith('#')) {
      throw new CtplError(`模板语法错误：不支持的块 {{${raw}}}（目前只支持 #if 与 #unless）`);
    }

    if (raw.startsWith('!')) continue; // 注释

    // 变量
    let key = raw;
    let optional = false;
    if (key.endsWith('?')) {
      optional = true;
      key = key.slice(0, -1).trim();
    }
    const value = vars[key];
    if (value === undefined || value === null) {
      if (optional) {
        out += SENTINEL;
        continue;
      }
      if (opts.strict) {
        throw new CtplError(
          `模板里的变量未定义：{{${key}}}\n` +
            `  内置变量：${Object.keys(vars).sort().join(', ')}\n` +
            '  三种加法（挑一种）：\n' +
            `    1. 在 template.json 的 variables 里声明：{ "key": "${key}", "prompt": "..." }\n` +
            `    2. 本次临时给值： --set ${key}=<值>\n` +
            `    3. 不要这个变量：把它改成 {{${key}?}}（空则整个片段消失）或 {{#if ${key}}}…{{/if}}\n` +
            `  想先看看效果： --lenient（未定义的替换成空串）`,
        );
      }
      continue;
    }
    const text = String(value);
    if (optional && text === '') {
      out += SENTINEL;
      continue;
    }
    out += text;
  }
}

function cleanupPathPlaceholders(s) {
  return s
    .replace(new RegExp(`${SENTINEL}[/\\\\_-]`, 'g'), '')
    .replace(new RegExp(`[/\\\\_-]${SENTINEL}`, 'g'), '')
    .split(SENTINEL)
    .join('')
    .replace(/(?<!:)\/{2,}/g, '/');
}

/**
 * 渲染一段文本。
 * @param {string} src 模板文本
 * @param {Record<string, unknown>} vars 变量表
 * @param {{ strict?: boolean, pathMode?: boolean }} opts
 */
export function renderText(src, vars, { strict = true, pathMode = false } = {}) {
  const { out } = renderBlock(String(src), 0, vars || {}, { strict }, []);
  return pathMode ? cleanupPathPlaceholders(out) : out.split(SENTINEL).join('');
}
