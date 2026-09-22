import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, probeCommand } from '../../src/util/exec.mjs';

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
export const CTPL_BIN = path.join(REPO_ROOT, 'bin', 'ctpl.mjs');

/** 建一个隔离沙箱：独立的配置目录 + 独立的模板根目录。 */
export function sandbox(label = 'e2e') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ctpl-${label}-`));
  const cfgHome = path.join(dir, 'cfg');
  const templatesDir = path.join(dir, 'tpls');
  fs.mkdirSync(cfgHome, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });
  return {
    dir,
    cfgHome,
    templatesDir,
    /** 沙箱内的路径 */
    p: (...segs) => path.join(dir, ...segs),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** 跑一次 ctpl（子进程，非交互）。 */
export function ctpl(args, { cwd, box, env = {}, input } = {}) {
  const res = spawnSync(process.execPath, [CTPL_BIN, ...args], {
    cwd: cwd || REPO_ROOT,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...(box
        ? { CTPL_CONFIG_HOME: box.cfgHome, CTPL_TEMPLATE_DIR: box.templatesDir }
        : {}),
      ...env,
    },
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    all: `${res.stdout || ''}${res.stderr || ''}`,
  };
}

/**
 * 起一个交互式子进程：按节奏喂按键，但【不关 stdin】—— 真实终端的 stdin 一直是开着的。
 * 用来验证「提示交互跑完后命令能自己退出」（stdin 被 resume 过又没还回去时会一直挂着）。
 * 返回 { timedOut, code, all }。
 */
export function ctplInteractive(args, { box, keys = [], env = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CTPL_BIN, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NO_COLOR: '1',
        CTPL_FORCE_TTY: '1',
        ...(box ? { CTPL_CONFIG_HOME: box.cfgHome, CTPL_TEMPLATE_DIR: box.templatesDir } : {}),
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let all = '';
    child.stdout.on('data', (d) => (all += d));
    child.stderr.on('data', (d) => (all += d));
    // 多余的按键可能写在子进程退出之后 → EPIPE，忽略掉
    child.stdin.on('error', () => {});
    const timers = keys.map((k, i) =>
      setTimeout(() => {
        try {
          child.stdin.write(k);
        } catch {
          // 子进程已经退出
        }
      }, 400 + i * 300),
    );
    const guard = setTimeout(() => {
      child.kill();
      resolve({ timedOut: true, code: null, all });
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(guard);
      timers.forEach(clearTimeout);
      resolve({ timedOut: false, code, all });
    });
  });
}

/** 默认模板的核心文件（无 tests）。 */
export const EXPECTED_DEFAULT_FILES = [
  'CMakeLists.txt',
  '.gitignore',
  'README.md',
  'src/main.cpp',
  'inc/.gitkeep',
];

/** 随包默认模板额外带的：只为了关掉「一进 VS Code 就自动 configure」。 */
export const EXPECTED_VSCODE_SETTINGS = '.vscode/settings.json';

/** 用默认模板生成的完整产物（无 tests）。 */
export const EXPECTED_DEFAULT_OUTPUT = [...EXPECTED_DEFAULT_FILES, EXPECTED_VSCODE_SETTINGS];

export function listFiles(root) {
  const out = [];
  const visit = (dir, prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) visit(path.join(dir, ent.name), rel);
      else out.push(rel);
    }
  };
  if (fs.existsSync(root)) visit(root, '');
  return out;
}

/** 只列目录（相对 posix 路径，含隐藏目录、不含根）。 */
export function listDirs(root) {
  const out = [];
  const visit = (dir, prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (!ent.isDirectory()) continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      out.push(rel);
      visit(path.join(dir, ent.name), rel);
    }
  };
  if (fs.existsSync(root)) visit(root, '');
  return out;
}

// ── 工具链可用性（缺工具链时 e2e 自动 skip，不让 npm test 变红） ─────────
export const toolchain = {
  cmake: probeCommand('cmake'),
  ninja: probeCommand('ninja'),
  gpp: probeCommand('g++'),
  ctest: probeCommand('ctest'),
};

export const hasBuildToolchain = toolchain.cmake.ok && toolchain.ninja.ok && toolchain.gpp.ok;
export const skipWithoutToolchain = hasBuildToolchain
  ? false
  : '需要 cmake + ninja + g++（当前环境缺失，已跳过 e2e）';

/** configure + build（Ninja）。 */
export function cmakeConfigureAndBuild(projectDir) {
  const configure = runCommand(
    'cmake',
    ['-S', '.', '-B', 'build', '-G', 'Ninja', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON'],
    { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (configure.status !== 0) {
    return {
      ok: false,
      step: 'configure',
      output: `${configure.stdout || ''}${configure.stderr || ''}`,
    };
  }
  const build = runCommand('cmake', ['--build', 'build'], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (build.status !== 0) {
    return {
      ok: false,
      step: 'build',
      output: `${build.stdout || ''}${build.stderr || ''}`,
    };
  }
  return { ok: true, output: `${build.stdout || ''}` };
}

export function runExe(projectDir, exeName, args = []) {
  const base = path.join(projectDir, 'build', 'bin', exeName);
  const candidates = process.platform === 'win32' ? [`${base}.exe`, base] : [base, `${base}.exe`];
  const exe = candidates.find((p) => fs.existsSync(p)) || candidates[0];
  const res = runCommand(exe, args, { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

export { runCommand, probeCommand };
