import { log } from '../util/log.mjs';
import { CtplError } from '../util/errors.mjs';
import { USAGE, commandHelp } from './help.mjs';
import { parseArgs } from './args.mjs';
import { toolVersion } from '../template/vars.mjs';

const COMMANDS = {
  new: () => import('../commands/new.mjs'),
  list: () => import('../commands/list.mjs'),
  show: () => import('../commands/show.mjs'),
  init: () => import('../commands/init.mjs'),
  'import-cmake': () => import('../commands/import-cmake.mjs'),
  edit: () => import('../commands/edit.mjs'),
  duplicate: () => import('../commands/duplicate.mjs'),
  remove: () => import('../commands/remove.mjs'),
  restore: () => import('../commands/restore.mjs'),
  config: () => import('../commands/config.mjs'),
  doctor: () => import('../commands/doctor.mjs'),
};

const ALIASES = { ls: 'list', create: 'new', import: 'import-cmake', rm: 'remove', cp: 'duplicate' };

function suggestCommand(input) {
  const names = [...Object.keys(COMMANDS), ...Object.keys(ALIASES)];
  let best = null;
  let bestScore = Infinity;
  for (const n of names) {
    const d = levenshtein(input, n);
    if (d < bestScore) {
      bestScore = d;
      best = n;
    }
  }
  return bestScore <= 2 ? best : null;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

export async function main(argv) {
  const { flags, lists, positionals } = parseArgs(argv);

  if (flags.version) {
    log.plain(toolVersion());
    return 0;
  }

  const rawCommand = positionals[0];
  const command = rawCommand ? ALIASES[rawCommand] || rawCommand : null;

  if (flags.help || !command) {
    log.plain(command && COMMANDS[command] ? commandHelp(command) : USAGE);
    return 0;
  }

  const loader = COMMANDS[command];
  if (!loader) {
    log.fail(`未知命令：${rawCommand}`);
    const guess = suggestCommand(rawCommand);
    if (guess) log.hint(`  你是想用 ${guess} 吗？`);
    log.plain('');
    log.plain(USAGE);
    return 2;
  }

  try {
    const mod = await loader();
    const code = await mod.run(positionals.slice(1), { flags, lists });
    return code ?? 0;
  } catch (err) {
    if (err instanceof CtplError) {
      if (err.exitCode === 3) {
        log.plain('');
        log.info('已取消，没有做任何改动。');
      } else {
        log.fail(err.message);
      }
      return err.exitCode;
    }
    log.fail(`意外错误：${err && err.stack ? err.stack : err}`);
    return 1;
  }
}
