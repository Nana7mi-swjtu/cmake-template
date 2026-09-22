import { log } from '../util/log.mjs';
import { parseSets } from '../cli/args.mjs';
import { loadConfig, saveConfig, describeConfig, configFile } from '../config/store.mjs';
import { changeTemplatesDir } from '../config/bootstrap.mjs';
import { listTemplates } from '../template/registry.mjs';

function applySetting(cfg, key, value) {
  if (key === 'templatesDir') return 'handled-elsewhere';
  if (key === 'defaultTemplateId') {
    cfg.defaultTemplateId = String(value);
    return null;
  }
  if (key.startsWith('defaultActions.')) {
    const action = key.slice('defaultActions.'.length);
    if (!['git', 'open', 'configure'].includes(action)) {
      return `不认识的附加动作：${action}（只能是 git / open / configure）`;
    }
    cfg.defaultActions[action] = value === true || value === 'true';
    return null;
  }
  return `不认识的配置项：${key}`;
}

export async function run(args, { flags, lists }) {
  const cfg = loadConfig();
  const sets = parseSets(lists);
  const jsonOut = Boolean(flags.json);

  if (flags['templates-dir']) {
    await changeTemplatesDir(cfg, flags['templates-dir'], { assumeYes: Boolean(flags.yes) });
  }

  const problems = [];
  let touched = false;
  for (const [key, value] of Object.entries(sets)) {
    if (key === 'templatesDir') continue;
    const problem = applySetting(cfg, key, value);
    if (problem && problem !== 'handled-elsewhere') problems.push(problem);
    else touched = true;
  }

  if (problems.length) {
    for (const p of problems) log.fail(p);
    return 2;
  }

  if (touched) {
    saveConfig(cfg);
    log.ok('配置已更新');
  }

  if (jsonOut) {
    log.plain(JSON.stringify({ configFile: configFile(), ...cfg }, null, 2));
    return 0;
  }

  log.plain('');
  for (const [k, v] of Object.entries(describeConfig(cfg))) {
    log.plain(`  ${k.padEnd(12)} ${v}`);
  }

  if (cfg.templatesDir) {
    try {
      const all = listTemplates(cfg.templatesDir);
      log.plain('');
      log.info(`模板根目录里有 ${all.length} 个模板`);
      for (const t of all) {
        log.plain(
          `  ${t.error ? '✘' : '✔'} ${t.id}${t.builtin ? ' [内置]' : ''}${t.error ? '  ' + t.error.split('\n')[0] : ''}`,
        );
      }
    } catch {
      /* 目录不可用时静默 */
    }
  }

  log.plain('');
  log.hint(`配置文件：${configFile()}`);
  log.hint('修改：ctpl config --templates-dir <绝对路径>');
  log.hint('      ctpl config --set defaultTemplateId=<id>');
  log.hint('      ctpl config --set defaultActions.git=false');
  return 0;
}
