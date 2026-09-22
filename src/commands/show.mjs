import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { loadConfig } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { findTemplate } from '../template/registry.mjs';
import { buildVars } from '../template/vars.mjs';
import { normalizeLayout } from '../template/layout.mjs';
import { collectFiles } from '../template/walk.mjs';
import { renderTree } from '../preview/tree.mjs';
import { isInteractive } from '../prompt/raw.mjs';

export async function run(args, { flags }) {
  const id = args[0];
  if (!id) fail('用法：ctpl show <模板id>', { exitCode: 2 });

  const cfg = loadConfig();
  const templatesDir = await resolveTemplatesDir(cfg, {
    allowPrompt: !flags.json && isInteractive(),
    override: flags['template-dir'],
  });
  const template = findTemplate(templatesDir, id);
  const t = template.json;

  // 用一个占位项目名把变量渲染出来，方便看真实结构
  const vars = buildVars({
    template: t,
    projectName: 'MyProject',
    dirName: 'MyProject',
    answers: {},
  });
  const layout = normalizeLayout(t.layout, { vars });
  const { files, keepDirs } = collectFiles(template.dir, t, vars, { selectedGroups: [] });
  const entries = [
    ...layout.filter((l) => !l.file).map((l) => ({ rel: l.rel, type: 'dir' })),
    ...[...keepDirs].map((rel) => ({ rel, type: 'dir' })),
    ...layout.filter((l) => l.file).map((l) => ({ rel: l.rel, type: 'file' })),
    ...files.map((f) => ({ rel: f.rel, type: 'file' })),
  ];

  if (flags.json) {
    log.plain(
      JSON.stringify(
        {
          id: t.id,
          name: t.name,
          dir: template.dir,
          builtin: template.builtin,
          bare: Boolean(template.bare),
          definition: template.source,
          version: t.version,
          layout,
          files: files.map((f) => ({ rel: f.rel, group: f.group, src: f.src })),
          optionalGroups: t.optionalGroups || [],
          variables: t.variables || [],
          cmake: t.cmake || {},
          warnings: template.warnings,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  log.plain('');
  const tags = [];
  if (template.builtin) tags.push('内置');
  if (template.bare) tags.push('裸模板');
  log.info(`${t.name}  (${t.id})${tags.length ? ` [${tags.join(' / ')}]` : ''}`);
  log.hint(`  目录：${template.dir}`);
  if (template.source) {
    log.hint(`  定义：${template.source}`);
  } else {
    log.hint('  定义：无 template.json —— 一切按约定（files/ 目录 + 内置变量）');
    log.hint('  想要提示、选项、可选组？加一个 template.json 就行，字段都能省。');
  }
  for (const d of template.derived || []) log.hint(`  按目录名推断：${d}`);
  if (t.version) log.hint(`  版本：${t.version}`);
  log.plain('');

  log.info('目录结构（用占位项目名 MyProject 渲染）：');
  log.preview(renderTree(entries, 'MyProject/'));

  if ((t.variables || []).length) {
    log.plain('');
    log.info('变量：');
    for (const v of t.variables) {
      const def = v.default === undefined ? '' : `（默认 ${JSON.stringify(v.default)}）`;
      log.plain(`  ${v.key.padEnd(16)} ${v.prompt || ''} ${def}`);
    }
  }

  if ((t.optionalGroups || []).length) {
    log.plain('');
    log.info('可选项：');
    for (const g of t.optionalGroups) {
      log.plain(`  ${g.id.padEnd(16)} ${g.label || ''}${g.default ? '  [默认勾选]' : '  [默认关闭]'}`);
    }
  }

  for (const w of template.warnings || []) log.warn(w);
  log.plain('');
  return 0;
}
