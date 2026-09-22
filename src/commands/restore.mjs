import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { confirm } from '../prompt/confirm.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { listBuiltinIds, restoreBuiltin } from '../template/sync.mjs';
import { isInteractive } from '../prompt/raw.mjs';

export async function run(args, { flags }) {
  const id = args[0];
  if (!id) {
    fail(
      `用法：ctpl restore <模板id>\n  可恢复的内置模板：${listBuiltinIds().join(', ') || '(无)'}`,
      { exitCode: 2 },
    );
  }

  const cfg = loadConfig();
  const templatesDir = await resolveTemplatesDir(cfg, {
    allowPrompt: isInteractive(),
    override: flags['template-dir'],
  });

  if (!flags.yes && isInteractive()) {
    const go = await confirm(
      `用随包副本覆盖 ${templatesDir}\\${id} 吗？（你当前的版本会先备份）`,
      { defaultValue: true },
    );
    if (!go) {
      log.info('已取消。');
      return 3;
    }
  }

  restoreBuiltin(id, templatesDir, { logger: log });
  return 0;
}
