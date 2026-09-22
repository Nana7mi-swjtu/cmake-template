import { log } from '../util/log.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { listTemplates } from '../template/registry.mjs';
import { isInteractive } from '../prompt/raw.mjs';

export async function run(args, { flags }) {
  const cfg = loadConfig();
  const jsonOut = Boolean(flags.json);
  const templatesDir = await resolveTemplatesDir(cfg, {
    allowPrompt: !flags.json && isInteractive(),
    override: flags['template-dir'],
  });

  const all = listTemplates(templatesDir);

  if (jsonOut) {
    log.plain(
      JSON.stringify(
        {
          templatesDir,
          templates: all.map((t) => ({
            id: t.id,
            name: t.json ? t.json.name : null,
            version: t.json ? t.json.version : null,
            builtin: t.builtin,
            bare: t.bare,
            hasTemplateJson: Boolean(t.source),
            dir: t.dir,
            error: t.error,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  log.plain('');
  log.info(`模板根目录：${templatesDir}`);
  log.plain('');

  if (all.length === 0) {
    log.warn('没有任何模板。');
    return 0;
  }

  const idWidth = Math.max(4, ...all.map((t) => t.id.length));
  const nameWidth = Math.max(6, ...all.map((t) => (t.json ? t.json.name.length : 0) + 8));

  for (const t of all) {
    if (t.error) {
      log.plain(`  ${t.id.padEnd(idWidth)}  ${'✘ 无法使用'.padEnd(nameWidth)}  ${t.error.split('\n')[0]}`);
      continue;
    }
    const badge = t.builtin ? ' [内置]' : '';
    const bareTag = t.bare ? ' [裸模板]' : '';
    log.plain(`  ${t.id.padEnd(idWidth)}  ${t.json.name + badge + bareTag}`);
    for (const w of t.warnings || []) log.hint(`      ⚠ ${w}`);
  }

  log.plain('');
  log.hint('创建工程：ctpl new <目录> --template <id>');
  return 0;
}
