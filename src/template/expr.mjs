import { CtplError } from '../util/errors.mjs';

/**
 * 条件表达式求值：手写 tokenizer + 递归下降。
 * 绝不使用 eval —— 模板内容是不可信输入。
 *
 * 支持：变量名、'字符串'、"字符串"、数字、true/false、
 *       ! / not、== != > >= < <=、&& / and、|| / or、括号、`a in [x, y]`
 */

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'true', 'false']);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_.]/.test(s[j])) j++;
      const word = s.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? 'kw' : 'ident', value: word });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ type: 'num', value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = s.indexOf(ch, i + 1);
      if (end < 0) throw new CtplError(`条件表达式里的字符串没有闭合：${src}`);
      tokens.push({ type: 'str', value: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if ('!><()[],'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new CtplError(`条件表达式里有无法识别的字符 "${ch}"：${src}`);
  }
  return tokens;
}

class Parser {
  constructor(tokens, vars, src) {
    this.tokens = tokens;
    this.pos = 0;
    this.vars = vars || {};
    this.src = src;
  }

  peek() {
    return this.tokens[this.pos];
  }

  eat(value) {
    const t = this.peek();
    if (t && t.type === 'op' && t.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseOr() {
    let left = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if ((t && t.type === 'op' && t.value === '||') || (t && t.type === 'kw' && t.value === 'or')) {
        this.pos++;
        const right = this.parseAnd();
        left = Boolean(left) || Boolean(right);
      } else break;
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    for (;;) {
      const t = this.peek();
      if ((t && t.type === 'op' && t.value === '&&') || (t && t.type === 'kw' && t.value === 'and')) {
        this.pos++;
        const right = this.parseNot();
        left = Boolean(left) && Boolean(right);
      } else break;
    }
    return left;
  }

  parseNot() {
    const t = this.peek();
    if ((t && t.type === 'op' && t.value === '!') || (t && t.type === 'kw' && t.value === 'not')) {
      this.pos++;
      return !this.parseNot();
    }
    return this.parseCompare();
  }

  parseCompare() {
    const left = this.parsePrimary();
    const t = this.peek();
    if (!t) return left;
    if (t.type === 'op' && ['==', '!=', '>', '>=', '<', '<='].includes(t.value)) {
      this.pos++;
      const right = this.parsePrimary();
      switch (t.value) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        case '<':
          return left < right;
        default:
          return left <= right;
      }
    }
    if (t.type === 'kw' && t.value === 'in') {
      this.pos++;
      const right = this.parseList();
      const list = Array.isArray(right) ? right : [];
      return list.some((v) => v === left);
    }
    return left;
  }

  parseList() {
    if (!this.eat('[')) throw new CtplError(`"in" 后面需要 [ ... ]：${this.src}`);
    const out = [];
    if (this.eat(']')) return out;
    for (;;) {
      out.push(this.parseOr());
      if (this.eat(']')) return out;
      if (!this.eat(',')) throw new CtplError(`列表里缺少逗号：${this.src}`);
    }
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) throw new CtplError(`条件表达式不完整：${this.src}`);
    if (t.type === 'op' && t.value === '(') {
      this.pos++;
      const v = this.parseOr();
      if (!this.eat(')')) throw new CtplError(`括号没有闭合：${this.src}`);
      return v;
    }
    if (t.type === 'str' || t.type === 'num') {
      this.pos++;
      return t.value;
    }
    if (t.type === 'kw' && (t.value === 'true' || t.value === 'false')) {
      this.pos++;
      return t.value === 'true';
    }
    if (t.type === 'ident') {
      this.pos++;
      switch (t.value) {
        case 'true':
          return true;
        case 'false':
          return false;
        default:
          return this.vars[t.value];
      }
    }
    throw new CtplError(`条件表达式里出现了意外内容：${this.src}`);
  }
}

/** 求值；未定义变量得到 undefined（在布尔位置即 false）。 */
export function evalExpr(src, vars) {
  const text = String(src ?? '').trim();
  if (!text) return false;
  const tokens = tokenize(text);
  const parser = new Parser(tokens, vars, text);
  const value = parser.parseOr();
  if (parser.pos < tokens.length) {
    throw new CtplError(`条件表达式有多余内容：${text}`);
  }
  return value;
}
