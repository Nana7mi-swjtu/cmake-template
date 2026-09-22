import path from 'node:path';
import { parseSets, splitCsv } from '../cli/args.mjs';
import { log } from '../util/log.mjs';
import { fail } from '../util/errors.mjs';
import { loadConfig, saveState, loadState } from '../config/store.mjs';
import { resolveTemplatesDir } from '../config/bootstrap.mjs';
import { listTemplates, findTemplate } from '../template/registry.mjs';
import { buildVars, variableDefault } from '../template/vars.mjs';
import { buildPlan, targetDirState } from '../template/plan.mjs';
import { applyPlan, writeKeepFiles } from '../template/apply.mjs';
import { integrateVscode } from '../vscode/integrate.mjs';
import { runActions } from '../hooks/run.mjs';
import { renderTree } from '../preview/tree.mjs';
import { select } from '../prompt/select.mjs';
import { text } from '../prompt/text.mjs';
import { confirm } from '../prompt/confirm.mjs';
import { multiselect } from '../prompt/multiselect.mjs';
import { isInteractive } from '../prompt/raw.mjs';
import {
  assertValidProjectName,
  assertValidTargetName,
  assertValidDirName,
  suggestProjectName,
  suggestProjectName as suggest,
} from '../fsx/safe.mjs';
import { deriveNames, pascal } from '../template/naming.mjs';
import { evalExpr } from '../template/expr.mjs';
import { expandHome, exists, fmtBytes, toPosix } from '../util/fsutil.mjs';

const NO_PROMPT =
  process.env.CTPL_NO_PROMPT === '1' || process.env.CI === 'true';

function choiceItems(def) {
  return (def.choices || []).map((c) =>
    typeof c === 'string' ? { value: c, label: c } : { value: c.value, label: c.label ?? c.value },
  );
}

export async function run(args, { flags, lists }) {
  const setValues = parseSets(lists);
  const yes = Boolean(flags.yes);
  const dryRun = Boolean(flags['dry-run']);
  const jsonOut = Boolean(flags.json);
  const force = Boolean(flags.force);
  const strict = !flags.lenient;

  const cfg = loadConfig();
  const noPrompt = yes || !isInteractive() || NO_PROMPT;

  // ── 1. 模板根目录（决策 #4 / #7） ─────────────────────────────
  const templatesDir = await resolveTemplatesDir(cfg, {
    allowPrompt: !noPrompt,
    override: flags['template-dir'],
  });

  // ── 2. 选模板 ────────────────────────────────────────────────
  const available = listTemplates(templatesDir).filter((t) => !t.error);
  if (available.length === 0) {
    fail(
      `模板根目录里没有任何可用模板：${templatesDir}\n` +
        (listTemplates(templatesDir).length
          ? '  （有目录，但 template.json 都校验失败了，运行 ctpl list 查看原因）'
          : '  运行 ctpl doctor 或重新指定模板根目录'),
      { code: 'E_NO_TEMPLATE', exitCode: 2 },
    );
  }

  const state = loadState();
  let template;
  if (flags.template) {
    template = findTemplate(templatesDir, flags.template);
  } else if (noPrompt) {
    const wanted = cfg.defaultTemplateId;
    template =
      available.find((t) => t.id === wanted) ||
      available.find((t) => t.json.default) ||
      available[0];
  } else {
    const preferred = state.lastTemplate || cfg.defaultTemplateId;
    const idx = Math.max(0, available.findIndex((t) => t.id === preferred));
    const picked = await select(
      '选择模板',
      available.map((t) => ({
        value: t.id,
        label: t.json.name,
        hint: `${t.id}${t.builtin ? ' · 内置' : ''}${t.json.description ? ' · ' + t.json.description : ''}`,
      })),
      { defaultIndex: idx },
    );
    template = available.find((t) => t.id === picked.value);
  }

  for (const w of template.warnings || []) log.warn(`模板：${w}`);

  // ── 3. 目标目录 ──────────────────────────────────────────────
  let dirArg = args[0] || flags.dir;
  if (!dirArg) {
    if (noPrompt) fail('非交互模式必须给出目标目录：ctpl new <目录> --yes', { exitCode: 2 });
    dirArg = await text('目标目录', {
      required: true,
      validate: (v) => (String(v).trim() ? null : '必填'),
    });
  }
  const outDir = path.resolve(process.cwd(), expandHome(String(dirArg)));
  const dirName = path.basename(outDir) || 'project';
  assertValidDirName(dirName);

  const dirState = targetDirState(outDir);
  if (dirState === 'not-a-dir') fail(`目标路径已存在且不是目录：${outDir}`);

  let overwrite = force;
  let skipExisting = false;
  if (dirState === 'non-empty' && !force) {
    if (flags['on-conflict']) {
      const policy = String(flags['on-conflict']);
      if (policy === 'abort') fail(`目标目录已存在且非空：${outDir}`, { exitCode: 4 });
      overwrite = policy === 'overwrite';
      skipExisting = policy === 'skip';
    } else if (noPrompt) {
      fail(
        `目标目录已存在且非空：${outDir}\n  用 --force 覆盖同名文件，或 --on-conflict=skip 跳过同名文件`,
        { exitCode: 4 },
      );
    } else {
      const picked = await select('目录已存在且非空，怎么办？', [
        { value: 'abort', label: '中止（不动任何文件）' },
        { value: 'overwrite', label: '覆盖同名文件' },
        { value: 'skip', label: '跳过同名文件' },
      ]);
      if (picked.value === 'abort') {
        log.info('已中止，未写入任何文件。');
        return 4;
      }
      overwrite = picked.value === 'overwrite';
      skipExisting = picked.value === 'skip';
    }
  }

  // ── 4. 项目名 / target 名 / 描述 ─────────────────────────────
  const validateName = (v) => {
    try {
      assertValidProjectName(v);
      return null;
    } catch (err) {
      return err.message.split('\n')[0];
    }
  };

  let projectName;
  if (flags.name) projectName = assertValidProjectName(flags.name);
  else if (setValues.projectName !== undefined) {
    projectName = assertValidProjectName(String(setValues.projectName));
  } else {
    const fallback = suggest(dirName);
    projectName = noPrompt
      ? assertValidProjectName(fallback)
      : assertValidProjectName(
          await text('项目名', { defaultValue: fallback, validate: validateName }),
        );
  }
  let targetName;
  if (flags.target) targetName = assertValidTargetName(flags.target);
  else if (setValues.targetName !== undefined) {
    targetName = assertValidTargetName(String(setValues.targetName));
  } else if (!noPrompt) {
    const fallback = deriveNames(projectName).projectNameSnake;
    targetName = await text('target 名（CMake target / 可执行文件名）', {
      defaultValue: fallback,
      validate: (v) => {
        try {
          assertValidTargetName(v);
          return null;
        } catch (err) {
          return err.message.split('\n')[0];
        }
      },
    });
  }

  let description;
  if (setValues.description !== undefined) description = String(setValues.description);
  else if (noPrompt) description = template.json.description || '';
  else {
    description = await text('一句话描述', { defaultValue: template.json.description || '' });
  }

  // ── 5. 模板自定义变量 ────────────────────────────────────────
  const answers = { ...setValues };
  if (targetName) answers.targetName = targetName;
  answers.description = description;

  for (const def of template.json.variables || []) {
    if (answers[def.key] !== undefined) continue;
    if (def.when && !evalExpr(def.when, { ...answers })) continue;

    const fallback = variableDefault(def);
    const label = def.prompt || def.key;

    if (noPrompt) {
      answers[def.key] = fallback;
      continue;
    }

    if (def.type === 'select') {
      const items = choiceItems(def);
      const idx = Math.max(
        0,
        items.findIndex((i) => String(i.value) === String(def.default)),
      );
      const picked = await select(label, items, { defaultIndex: idx });
      answers[def.key] = picked.value;
    } else if (def.type === 'multiselect') {
      const items = choiceItems(def).map((i) => ({
        ...i,
        checked: Array.isArray(def.default) ? def.default.includes(i.value) : false,
      }));
      answers[def.key] = await multiselect(label, items);
    } else if (def.type === 'boolean') {
      answers[def.key] = await confirm(label, { defaultValue: Boolean(def.default) });
    } else if (def.type === 'number') {
      const v = await text(label, { defaultValue: String(def.default ?? '') });
      answers[def.key] = Number(v);
    } else {
      const v = await text(label, {
        defaultValue: String(def.default ?? ''),
        required: Boolean(def.required),
        validate: def.pattern
          ? (val) =>
              new RegExp(def.pattern).test(val)
                ? null
                : def.patternHint || `格式不匹配 ${def.pattern}`
          : null,
      });
      answers[def.key] = v;
    }
  }

  // ── 6. 可选目录组（内置模板只剩 tests，默认关闭） ─────────────
  const groups = template.json.optionalGroups || [];
  const withList = splitCsv(flags.with);
  const withoutList = splitCsv(flags.without);
  let selectedGroups = [];

  if (groups.length > 0) {
    const initial = groups.map((g) => ({
      value: g.id,
      label: g.label || g.id,
      checked: withList.includes(g.id)
        ? true
        : withoutList.includes(g.id)
          ? false
          : Boolean(g.default),
    }));
    if (noPrompt) {
      selectedGroups = initial.filter((i) => i.checked).map((i) => i.value);
    } else {
      selectedGroups = await multiselect('可选项', initial);
    }
  }

  for (const g of groups) {
    const on = selectedGroups.includes(g.id);
    const defines = g.defines || { [`with${pascal(g.id)}`]: true };
    for (const [k, v] of Object.entries(defines)) answers[k] = on ? v : false;
  }

  // ── 7. 附加动作（决策 #2：git 与打开默认勾选，预配置不勾） ────
  const want = (flagValue, fallback) =>
    flagValue === undefined ? fallback : Boolean(flagValue);
  const actionDefaults = {
    'git-init': want(flags.git, cfg.defaultActions.git),
    'open-vscode': want(flags.open, cfg.defaultActions.open),
    'cmake-configure': want(flags.configure, cfg.defaultActions.configure),
  };

  let actions = Object.entries(actionDefaults)
    .filter(([, on]) => on)
    .map(([id]) => id);

  if (!noPrompt) {
    actions = await multiselect(
      '附加动作',
      [
        { value: 'git-init', label: 'git init', checked: actionDefaults['git-init'] },
        { value: 'open-vscode', label: '用 VS Code 打开', checked: actionDefaults['open-vscode'] },
        {
          value: 'cmake-configure',
          label: '立即执行 cmake 预配置',
          checked: actionDefaults['cmake-configure'],
        },
      ],
      { minSelected: 0 },
    );
  }

  // ── 8. 变量表 + 创建计划 ─────────────────────────────────────
  const vars = buildVars({
    template: template.json,
    projectName,
    dirName,
    answers: { ...answers, targetName: answers.targetName || deriveNames(projectName).projectNameSnake },
  });

  const plan = buildPlan({
    templateDir: template.dir,
    template: template.json,
    vars,
    selectedGroups,
    outDir,
  });

  const entries = [
    ...plan.dirs.map((d) => ({ rel: d.rel, type: 'dir' })),
    ...plan.files.map((f) => ({ rel: f.rel, type: 'file' })),
  ];

  // ── 9. 预览 ─────────────────────────────────────────────────
  if (!jsonOut) {
    log.plain('');
    log.preview(renderTree(entries, outDir));
    log.plain('');
    const keepNote = plan.keepCount ? `（另加 ${plan.keepCount} 个 .gitkeep）` : '';
    log.info(
      `目录 ${plan.dirCount} 个，文件 ${plan.fileCount} 个${keepNote}，共 ${fmtBytes(plan.totalBytes)}`,
    );
    log.hint(`模板：${template.json.name}（${template.id}）`);
    if (plan.conflicts.length) {
      log.warn(`与现有文件冲突 ${plan.conflicts.length} 处`);
    }
    log.plain('');
  }

  if (dryRun) {
    if (jsonOut) {
      log.plain(
        JSON.stringify(
          {
            ok: true,
            dryRun: true,
            outDir,
            templateId: template.id,
            dirs: plan.dirs.map((d) => d.rel),
            files: plan.files.map((f) => f.rel),
            conflicts: plan.conflicts,
            vars,
          },
          null,
          2,
        ),
      );
    } else {
      log.hint('（--dry-run：没有写入任何文件）');
    }
    return 0;
  }

  if (!noPrompt) {
    const go = await confirm('确认创建？', { defaultValue: true });
    if (!go) {
      log.info('已取消，未写入任何文件。');
      return 3;
    }
  }

  // ── 10. 写盘 ─────────────────────────────────────────────────
  const result = applyPlan(plan, { overwrite, skipExisting, strict });
  const kept = writeKeepFiles(plan);
  const vscodeFiles = integrateVscode(outDir, template.json, { logger: log });

  if (!jsonOut) {
    log.ok(`已创建 ${outDir}（${result.written.length + kept.length} 个文件）`);
    if (result.skipped.length) log.warn(`跳过已存在的 ${result.skipped.length} 个文件`);
    if (kept.length) log.hint(`  空目录保持：${kept.join(', ')}`);
    if (vscodeFiles.length) log.hint(`  VS Code 配置：${vscodeFiles.join(', ')}`);
  }

  // ── 11. 附加动作 ─────────────────────────────────────────────
  const hookResults = runActions(actions, { cwd: outDir });

  saveState({ lastTemplate: template.id, lastActions: actions });

  if (jsonOut) {
    log.plain(
      JSON.stringify(
        {
          ok: true,
          outDir,
          templateId: template.id,
          dirs: result.createdDirs,
          files: result.written,
          skipped: result.skipped,
          actions: hookResults,
          vars,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  log.plain('');
  log.hint('后续：VS Code 里 CMake Tools 会自动 configure（configureOnOpen: true）；');
  log.hint('      Kit 未指定时使用 PATH 上的 gcc/g++，生成器由你的全局设置定为 Ninja。');
  log.hint('      若报错，运行 ctpl doctor 检查工具链。');
  return 0;
}

export { toPosix, exists };
