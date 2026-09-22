import { runCommand } from '../util/exec.mjs';
import { log as defaultLog } from '../util/log.mjs';

export const BUILTIN_ACTIONS = ['git-init', 'open-vscode', 'cmake-configure'];

const LABEL = {
  'git-init': 'git init',
  'open-vscode': '用 VS Code 打开',
  'cmake-configure': 'cmake 预配置',
};

/**
 * 执行一个附加动作。永远不抛异常 —— 动作失败只提示，不影响"工程已经创建好"这件事。
 * 返回 { ok, message }
 */
export function runAction(name, { cwd, logger = defaultLog } = {}) {
  try {
    switch (name) {
      case 'git-init': {
        const res = runCommand('git', ['init'], { cwd });
        if (!res.found || res.error || res.status !== 0) {
          return { ok: false, message: 'git init 失败（PATH 上找不到 git？）' };
        }
        return { ok: true, message: 'git init 完成' };
      }
      case 'open-vscode': {
        const res = runCommand('code', ['-n', '.'], { cwd });
        if (!res.found || res.error || res.status !== 0) {
          return { ok: false, message: `打开 VS Code 失败，请手动打开：${cwd}` };
        }
        return { ok: true, message: '已在 VS Code 中打开' };
      }
      case 'cmake-configure': {
        logger.hint('  正在执行 cmake -S . -B build -G Ninja ...');
        const res = runCommand(
          'cmake',
          ['-S', '.', '-B', 'build', '-G', 'Ninja', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON'],
          { cwd, stdio: 'inherit' },
        );
        if (!res.found || res.error || res.status !== 0) {
          return { ok: false, message: 'cmake 预配置失败（不影响工程本身，可在 VS Code 里重试）' };
        }
        return { ok: true, message: 'cmake 预配置成功' };
      }
      default:
        return { ok: false, message: `不认识的附加动作：${name}` };
    }
  } catch (err) {
    return { ok: false, message: `${LABEL[name] || name} 出错：${err.message}` };
  }
}

export function runActions(names, { cwd, logger = defaultLog } = {}) {
  const results = [];
  for (const name of names) {
    const res = runAction(name, { cwd, logger });
    if (res.ok) logger.ok(res.message);
    else logger.warn(res.message);
    results.push({ name, ...res });
  }
  return results;
}
