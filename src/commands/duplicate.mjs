import path from 'node:path';
import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { findTemplate } from '../template/registry.mjs';
import { loadTemplate } from '../template/loader.mjs';
import { copyTree, exists, writeJson } from '../util/fsutil.mjs';
import { assertWritableTemplatesDir } from '../template/sync.mjs';
import { isInteractive } from '../prompt/raw.mjs';

export async function run(args, { flags }) {
  const [srcId, newId] = args;
  if (!srcId || !newId) {
    fail('用法：ctpl duplicate <源模板id> <新模板id> [--name <显示名>]', { exitCode: 2 });
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(newId)) {
    fail(`新模板 id 非法：${newId}（只能用小写字母、数字、. _ -）`, { exitCode: 2 });
  }

  const cfg = loadConfig();
  const templatesDir = await resolveTemplatesDir(cfg, {
    allowPrompt: !flags.yes && isInteractive(),
    override: flags['template-dir'],
  });
  assertWritableTemplatesDir(templatesDir);

  const src = findTemplate(templatesDir, srcId);
  const dest = path.join(templatesDir, newId);
  if (exists(dest)) {
    fail(`目标模板已存在：${dest}`, { code: 'E_EXISTS', exitCode: 4 });
  }

  copyTree(src.dir, dest);

  // 裸模板也能复制：用 loader 推断出的 id/name 写一份真正的 template.json
  const json = JSON.parse(JSON.stringify(loadTemplate(src.dir).json));
  delete json._builtin; // 副本归用户所有，不再跟随内置同步
  json.id = newId;
  json.name = flags.name ? String(flags.name) : `${json.name}（副本）`;
  json.default = false;
  writeJson(path.join(dest, 'template.json'), json);

  log.ok(`已复制模板 ${src.id} → ${newId}`);
  log.plain(`   ${dest}`);
  log.plain(
    src.bare
      ? '   源模板是裸模板（无 template.json），副本已补上一份可编辑的 template.json'
      : '   已改写 template.json（id / name / default），并去掉内置标记',
  );
  log.hint(`接下来：ctpl edit ${newId}`);
  return 0;
}
