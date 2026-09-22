import { fail } from '../util/errors.mjs';

const KNOWN_KEYS = new Set([
  'schemaVersion',
  'id',
  'name',
  'description',
  'tags',
  'version',
  'author',
  'default',
  'variables',
  'layout',
  'optionalGroups',
  'files',
  'ignore',
  'hooks',
  'vscode',
  'cmake',
  'trusted',
  '_builtin',
]);

const VAR_TYPES = new Set(['string', 'number', 'boolean', 'select', 'multiselect', 'path']);
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function versionParts(v) {
  return String(v)
    .split('.')
    .map((n) => Number(n.replace(/[^0-9]/g, '')) || 0);
}

function compareVersion(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/**
 * 手写 schema 校验：不引依赖，报错尽量指出字段与修法。
 * 返回 { errors, warnings }（errors 非空时由 loader 抛出）。
 */
export function validateTemplate(json) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    err('template.json 的顶层必须是一个对象');
    return { errors, warnings };
  }

  if (json.schemaVersion === undefined) {
    warn('没写 schemaVersion —— 按 1 处理（建议写上 "schemaVersion": 1）');
  } else if (json.schemaVersion !== 1) {
    err(`schemaVersion 必须是 1（当前工具只认这一版），收到：${JSON.stringify(json.schemaVersion)}`);
  }

  if (typeof json.id !== 'string' || !ID_RE.test(json.id)) {
    err(`id 必须匹配 ${ID_RE}（小写字母开头，可含数字 . _ -），收到：${JSON.stringify(json.id)}`);
  }

  if (typeof json.name !== 'string' || !json.name.trim()) {
    err('name 必须是非空字符串（可以写中文）');
  }

  if (json.description !== undefined && typeof json.description !== 'string') {
    err('description 必须是字符串');
  }
  if (json.version !== undefined && typeof json.version !== 'string') {
    err('version 必须是字符串，例如 "0.1.0"');
  }
  if (json.tags !== undefined && !Array.isArray(json.tags)) {
    err('tags 必须是字符串数组');
  }
  if (json.trusted !== undefined && typeof json.trusted !== 'boolean') {
    err('trusted 必须是布尔值');
  }

  // layout 可以省略：files/ 里的文件会自动建出它们的父目录，
  // layout 只用于“空目录”（keep: true）和文件占位。
  if (json.layout !== undefined && json.layout !== null) {
    if (!Array.isArray(json.layout) && typeof json.layout !== 'object') {
      err('layout 必须是数组（相对路径列表 / 条目对象列表）或对象（嵌套树）');
    } else if (Array.isArray(json.layout)) {
      json.layout.forEach((entry, i) => {
        if (typeof entry === 'string') return;
        if (entry && typeof entry === 'object' && typeof entry.path === 'string') return;
        err(`layout[${i}] 必须是字符串或带 path 字段的对象`);
      });
    }
  }

  if (json.variables !== undefined) {
    if (!Array.isArray(json.variables)) {
      err('variables 必须是数组');
    } else {
      json.variables.forEach((v, i) => {
        const at = `variables[${i}]`;
        if (!v || typeof v !== 'object') return err(`${at} 必须是对象`);
        if (typeof v.key !== 'string' || !KEY_RE.test(v.key)) {
          err(`${at}.key 必须匹配 ${KEY_RE}`);
        }
        if (v.prompt !== undefined && typeof v.prompt !== 'string') {
          err(`${at}.prompt 必须是字符串`);
        }
        if (v.type !== undefined && !VAR_TYPES.has(v.type)) {
          err(`${at}.type 必须是 ${[...VAR_TYPES].join(' | ')}`);
        }
        if ((v.type === 'select' || v.type === 'multiselect') && !Array.isArray(v.choices)) {
          err(`${at}.choices 在 type=${v.type} 时必填，且必须是数组`);
        }
        if (v.pattern !== undefined) {
          try {
            new RegExp(v.pattern);
          } catch {
            err(`${at}.pattern 不是合法的正则：${v.pattern}`);
          }
        }
      });
    }
  }

  if (json.optionalGroups !== undefined) {
    if (!Array.isArray(json.optionalGroups)) {
      err('optionalGroups 必须是数组');
    } else {
      const ids = new Set();
      json.optionalGroups.forEach((g, i) => {
        const at = `optionalGroups[${i}]`;
        if (!g || typeof g !== 'object') return err(`${at} 必须是对象`);
        if (typeof g.id !== 'string' || !g.id.trim()) err(`${at}.id 必填`);
        else if (ids.has(g.id)) err(`${at}.id 重复：${g.id}`);
        else ids.add(g.id);
        if (g.paths !== undefined && !Array.isArray(g.paths)) err(`${at}.paths 必须是字符串数组`);
        if (g.files !== undefined && !Array.isArray(g.files)) err(`${at}.files 必须是 glob 字符串数组`);
        if (g.defines !== undefined && (typeof g.defines !== 'object' || g.defines === null)) {
          err(`${at}.defines 必须是对象`);
        }
      });
    }
  }

  if (json.files !== undefined) {
    if (!Array.isArray(json.files)) {
      err('files 必须是数组');
    } else {
      json.files.forEach((r, i) => {
        const at = `files[${i}]`;
        if (!r || typeof r !== 'object') return err(`${at} 必须是对象`);
        if (typeof r.from !== 'string' || !r.from) err(`${at}.from 必填`);
        if (typeof r.to !== 'string' || !r.to) err(`${at}.to 必填`);
        if (r.onConflict !== undefined && !['ask', 'overwrite', 'skip', 'rename', 'abort'].includes(r.onConflict)) {
          err(`${at}.onConflict 只能是 ask | overwrite | skip | rename | abort`);
        }
        if (r.eol !== undefined && !['preserve', 'lf', 'crlf'].includes(r.eol)) {
          err(`${at}.eol 只能是 preserve | lf | crlf`);
        }
      });
    }
  }

  if (json.cmake !== undefined) {
    if (typeof json.cmake !== 'object' || json.cmake === null) {
      err('cmake 必须是对象');
    } else if (json.cmake.minVersion !== undefined) {
      const mv = String(json.cmake.minVersion);
      if (!/^\d+\.\d+(\.\d+)?$/.test(mv)) {
        err(`cmake.minVersion 格式不对：${mv}（应形如 3.20）`);
      } else if (compareVersion(mv, '3.5') < 0) {
        err(
          `cmake.minVersion=${mv} 太旧：CMake 4.x 已移除对 VERSION < 3.5 的兼容，配置会直接失败。建议 >= 3.20`,
        );
      } else if (compareVersion(mv, '3.20') < 0) {
        warn(`cmake.minVersion=${mv} 偏旧，建议至少 3.20（CMake 4.x 下更旧写法会被拒绝）`);
      }
    }
  }

  if (json.vscode !== undefined && (typeof json.vscode !== 'object' || json.vscode === null)) {
    err('vscode 必须是对象');
  }
  if (json.hooks !== undefined && (typeof json.hooks !== 'object' || json.hooks === null)) {
    err('hooks 必须是对象');
  }

  for (const key of Object.keys(json)) {
    if (!KNOWN_KEYS.has(key) && !key.startsWith('_')) {
      warn(`未知字段 "${key}" —— 会被忽略（拼错了？）`);
    }
  }

  return { errors, warnings };
}

/** 把 JSON.parse 的 position 换算成 行:列。 */
export function positionToLineCol(text, position) {
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  const col = position - before.lastIndexOf('\n');
  return { line, col };
}

export function formatJsonError(err, text, file) {
  const m = /position (\d+)/.exec(err.message);
  if (!m) return `${file} 解析失败：${err.message}`;
  const { line, col } = positionToLineCol(text, Number(m[1]));
  return `${file} 解析失败：第 ${line} 行第 ${col} 列 —— ${err.message}`;
}

export { fail };
