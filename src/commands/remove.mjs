import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { assertWritableTemplatesDir } from '../template/sync.mjs';
import { findTemplate } from '../template/registry.mjs';
import { removeTree } from '../util/fsutil.mjs';
import { isInteractive } from '../prompt/raw.mjs';
import { confirm } from '../prompt/confirm.mjs';

export async function run(args, { flags }) {
  const id = args[0];
  if (!id) fail('用法：ctpl remove <模板id>', { exitCode: 2 });

  const cfg = loadConfig();
  const noPrompt = Boolean(flags.yes) || !isInteractive();
  const templatesDir = await resolveTemplatesDir(cfg, { allowPrompt: !noPrompt, override: flags['template-dir'] });
  assertWritableTemplatesDir(templatesDir);

  const template = findTemplate(templatesDir, id);
  const builtin = Boolean(template.builtin);

  if (!noPrompt) {
    const question = builtin
      ? `删除内置模板 ${template.id}？（下次运行时会自动从随包副本恢复）`
      : `删除模板 ${template.id} 及其全部文件？`;
    const ok = await confirm(question, { defaultValue: false });
    if (!ok) {
      log.info('已取消，未做任何改动。');
      return 3;
    }
  }

  removeTree(template.dir);
  log.ok(`已删除 ${template.dir}`);

  if (builtin) {
    log.warn(
      '这是内置模板 —— 下次运行 ctpl 会自动把官方版本恢复回来。\n' +
        '  想永久替换它：放入你自己的同名模板（手动创建，不要带 _builtin 字段）即可。',
    );
  }
  return 0;
}
