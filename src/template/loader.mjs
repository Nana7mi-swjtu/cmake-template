import fs from 'node:fs';
import path from 'node:path';
import { isFile } from '../util/fsutil.mjs';
import { CtplError, fail } from '../util/errors.mjs';
import { parseJsonc } from '../util/jsonc.mjs';
import { validateTemplate, formatJsonError } from './schema.mjs';
import {
  bareTemplateJson,
  fillDerivedFields,
  findTemplateFile,
  hasTemplateFilesRoot,
} from './bare.mjs';

/**
 * 读取并校验一个模板目录。两种写法都行：
 *   1. 带 template.json / template.jsonc（可选字段都可以省）
 *   2. 裸模板：只有 files/ 子目录，什么都不用写
 * 返回 { dir, json, warnings, bare, source, derived }
 */
export function loadTemplate(dir) {
  const found = findTemplateFile(dir);
  let json;
  let bare = false;
  let source = null;

  if (found) {
    source = found.file;
    const text = fs.readFileSync(source, 'utf8');
    try {
      json = found.name.endsWith('.jsonc') ? parseJsonc(text) : JSON.parse(text);
    } catch (err) {
      throw new CtplError(formatJsonError(err, text, source), {
        code: 'E_BAD_JSON',
        exitCode: 1,
      });
    }
  } else if (hasTemplateFilesRoot(dir)) {
    json = bareTemplateJson(dir);
    bare = true;
  } else {
    fail(
      `这不是一个模板目录：${dir}\n` +
        '  任一写法即可：\n' +
        '    a) 放一个 template.json（字段都能省，id/name 按目录名推断）\n' +
        '    b) 建一个 files/ 子目录，把文件丢进去 —— 一行 JSON 都不用写',
      { code: 'E_NO_TEMPLATE', exitCode: 1 },
    );
  }

  const derived = fillDerivedFields(json, dir);

  const { errors, warnings } = validateTemplate(json);
  if (errors.length) {
    const where = source ? source : path.join(dir, '(没有 template.json，按目录约定推断)');
    throw new CtplError(
      `模板校验失败：${where}\n` + errors.map((e) => `  ✘ ${e}`).join('\n'),
      { code: 'E_BAD_TEMPLATE', exitCode: 1 },
    );
  }

  return { dir, json, warnings, bare, source, derived };
}

/** 尝试加载，不抛异常（registry 列表用）。 */
export function tryLoadTemplate(dir) {
  try {
    return { ok: true, ...loadTemplate(dir) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { isFile };
