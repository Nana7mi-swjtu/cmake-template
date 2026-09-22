import { fail } from '../util/errors.mjs';

/** 需要跟一个值的长选项（`--k v` 与 `--k=v` 都支持）。 */
const VALUE_FLAGS = new Set([
  'template',
  'name',
  'target',
  'set',
  'with',
  'without',
  'on-conflict',
  'template-dir',
  'id',
  'to',
  'replace-literal',
  'exclude',
  'include',
  'templates-dir',
]);

const SHORT_FLAGS = {
  t: 'template',
  y: 'yes',
  h: 'help',
  v: 'version',
  n: 'name',
};

/**
 * 轻量 argv 解析：`--flag`、`--k=v`、`--k v`、`--no-x`、`-abc`、位置参数。
 * 返回 { flags, lists, positionals }；重复出现的值选项收进 lists。
 */
export function parseArgs(argv) {
  const flags = {};
  const lists = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      let key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      let value = eq >= 0 ? arg.slice(eq + 1) : undefined;

      if (key.startsWith('no-') && value === undefined) {
        flags[key.slice(3)] = false;
        continue;
      }
      if (VALUE_FLAGS.has(key)) {
        if (value === undefined) {
          value = argv[++i];
          if (value === undefined) fail(`选项 --${key} 需要跟一个值`, { exitCode: 2 });
        }
        (lists[key] ||= []).push(value);
        flags[key] = value;
        continue;
      }
      if (value === undefined) flags[key] = true;
      else {
        (lists[key] ||= []).push(value);
        flags[key] = value;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      const chars = arg.slice(1);
      for (let c = 0; c < chars.length; c++) {
        const name = SHORT_FLAGS[chars[c]] || chars[c];
        if (VALUE_FLAGS.has(name)) {
          const inline = chars.slice(c + 1);
          const value = inline || argv[++i];
          if (value === undefined) fail(`选项 -${chars[c]} 需要跟一个值`, { exitCode: 2 });
          (lists[name] ||= []).push(value);
          flags[name] = value;
          break;
        }
        flags[name] = true;
      }
      continue;
    }

    positionals.push(arg);
  }

  // 统一的布尔便捷方法
  flags.__list = (k) => lists[k] || [];
  return { flags, lists, positionals };
}

/** 把 `--set a=1 --set b=2` 解析成对象。 */
export function parseSets(lists) {
  const out = {};
  for (const item of lists.set || []) {
    const eq = item.indexOf('=');
    if (eq < 0) fail(`--set 需要 key=value 形式，收到：${item}`, { exitCode: 2 });
    const key = item.slice(0, eq).trim();
    const value = item.slice(eq + 1);
    if (!key) fail(`--set 的 key 不能为空：${item}`, { exitCode: 2 });
    out[key] = coerce(value);
  }
  return out;
}

/** 把命令行字符串粗粒度转成 boolean / number。 */
export function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && !Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  // 逗号分隔列表（--with a,b）
  if (value.includes(',')) return value.split(',').map((s) => s.trim()).filter(Boolean);
  return value;
}

export function splitCsv(value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}
