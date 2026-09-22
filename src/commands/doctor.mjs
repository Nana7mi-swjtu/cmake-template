import os from 'node:os';
import { c } from '../util/color.mjs';
import { log } from '../util/log.mjs';
import { probeCommand } from '../util/exec.mjs';
import { loadConfig, configHome } from '../config/store.mjs';
import { listTemplates } from '../template/registry.mjs';
import { ensureDir, isDir, exists } from '../util/fsutil.mjs';

const CHECKS = [
  {
    name: 'node',
    args: ['--version'],
    hint: '需要 >= 18',
  },
  {
    name: 'cmake',
    args: ['--version'],
    hint: '需要 >= 3.20（CMake 4.x 已不兼容 cmake_minimum_required(VERSION < 3.5)）',
  },
  {
    name: 'ninja',
    args: ['--version'],
    hint: 'Ninja 必须在 PATH 上；用 MSYS2 装的可以用 pacman -S mingw-w64-x86_64-ninja',
  },
  {
    name: 'gcc',
    args: ['--version'],
    hint: 'CMake Tools 在 Unspecified kit 下会从 PATH 找编译器',
  },
  {
    name: 'g++',
    args: ['--version'],
    hint: 'C++ 工程真正用的是 g++',
  },
  {
    name: 'git',
    args: ['--version'],
    hint: 'git init 与 author 变量需要',
  },
  {
    name: 'code',
    args: ['--version'],
    hint: '没有它，--open 只会打印路径',
  },
];

function probe(check) {
  return { ...check, ...probeCommand(check.name, check.args) };
}

export async function run() {
  const cfg = loadConfig();
  const results = [];

  for (const check of CHECKS) {
    results.push(probe(check));
  }

  const templatesDir = cfg.templatesDir;
  const templatesInfo = {
    templatesDir,
    configured: Boolean(templatesDir),
    exists: Boolean(templatesDir && isDir(templatesDir)),
    templates: [],
    broken: [],
  };

  if (templatesInfo.exists) {
    try {
      const all = listTemplates(templatesDir);
      templatesInfo.templates = all.filter((t) => !t.error).map((t) => ({
        id: t.id,
        builtin: t.builtin,
        warnings: t.warnings,
      }));
      templatesInfo.broken = all
        .filter((t) => t.error)
        .map((t) => ({ id: t.id, error: t.error }));
    } catch (err) {
      templatesInfo.broken.push({ id: '(扫描失败)', error: err.message });
    }
  }

  if (process.argv.includes('--json')) {
    log.plain(
      JSON.stringify(
        {
          platform: process.platform,
          node: process.version,
          configHome: configHome(),
          checks: results.map((r) => ({ name: r.name, ok: r.ok, version: r.version || null })),
          templates: templatesInfo,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  log.plain('');
  log.info('工具链');
  for (const r of results) {
    const mark = r.ok ? c.green('✔') : c.red('✘');
    log.plain(`  ${mark} ${r.name.padEnd(7)} ${r.ok ? r.version : '未找到'}`);
    if (!r.ok) log.hint(`      ↳ ${r.hint}`);
  }

  log.plain('');
  log.info('模板根目录');
  if (!templatesInfo.configured) {
    log.plain(`  ${c.red('✘')} 未配置 —— 首次运行 ctpl new 时会要求你手动填写`);
  } else if (!templatesInfo.exists) {
    log.plain(`  ${c.red('✘')} 不存在：${templatesDir}`);
    log.hint('      ↳ 下次运行会重新询问；也可 ctpl config --templates-dir <绝对路径>');
  } else {
    log.plain(`  ${c.green('✔')} ${templatesDir}`);
    log.plain(`      ${templatesInfo.templates.length} 个可用模板`);
    for (const t of templatesInfo.templates) {
      log.plain(`      · ${t.id}${t.builtin ? ' [内置]' : ''}${t.warnings.length ? ` (${t.warnings.length} 条告警)` : ''}`);
    }
    for (const b of templatesInfo.broken) {
      log.plain(`  ${c.red('✘')} ${b.id}：${b.error.split('\n')[0]}`);
    }
  }

  log.plain('');
  log.info('配置目录');
  log.plain(`  ${configHome()}  ${exists(configHome()) ? '' : c.gray('(还没创建)')}`);
  log.plain(`  平台 ${os.platform()} ${os.arch()}`);

  log.plain('');
  log.hint('Kit 说明：useCMakePresets=never 时 CMake Tools 仍需要一个 kit；');
  log.hint('          未指定（Unspecified kit）时它从 PATH 找 gcc/g++，生成器用你全局设置里的 Ninja。');
  return 0;
}
