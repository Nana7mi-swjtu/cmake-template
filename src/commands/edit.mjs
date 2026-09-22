import { runCommand } from '../util/exec.mjs';
import { log } from '../util/log.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { findTemplate } from '../template/registry.mjs';
import { isInteractive } from '../prompt/raw.mjs';

export async function run(args, { flags }) {
  const id = args[0];
  const cfg = loadConfig();
  const templatesDir = await resolveTemplatesDir(cfg, {
    allowPrompt: !flags.plain && isInteractive(),
    override: flags['template-dir'],
  });

  if (!id) {
    log.info(templatesDir);
    return 0;
  }

  const template = findTemplate(templatesDir, id);

  if (flags.plain) {
    log.info(template.dir);
    return 0;
  }

  const res = runCommand('code', ['-n', '.'], { cwd: template.dir });

  if (!res.found || res.error || res.status !== 0) {
    log.warn('找不到 VS Code 的 code 命令，请手动打开：');
    log.info(template.dir);
    return 0;
  }

  log.ok(`已在 VS Code 中打开模板目录：${template.dir}`);
  log.hint('提示：模板内的 CMakeLists.txt 是纯文本维护的，工具不做语法校验。');
  return 0;
}
