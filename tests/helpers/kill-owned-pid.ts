import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export type KillOutcome = 'killed' | 'no-pid' | 'not-alive' | 'not-ours';

/** The process's command line, or undefined when `ps` cannot tell (gone, no `ps`, error). */
function commandOf(pid: number): string | undefined {
  try {
    // -ww: no width cut, so a long `node -e` line keeps the path we look for (BSD and procps).
    return execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

/**
 * NG-260 review B1: SIGKILLs the pid written in `pidFile`, but only when that process's own
 * command line names `pidFile`. The test servers write their pid there and carry the path in
 * their `node -e` code, so a match is the server; a pid that was reused by an unrelated process
 * after the server exited does not match and is left alone. Unreadable or garbage pid files,
 * a dead pid and a `ps` failure all mean: do not kill.
 */
export function killPidFromFile(pidFile: string): KillOutcome {
  let raw = '';
  try {
    raw = fs.readFileSync(pidFile, 'utf8').trim();
  } catch {
    return 'no-pid';
  }
  if (!/^[1-9]\d*$/.test(raw)) return 'no-pid';
  const pid = Number(raw);
  if (!Number.isSafeInteger(pid)) return 'no-pid';

  const command = commandOf(pid);
  if (command === undefined || command.trim() === '') return 'not-alive';
  if (!command.includes(pidFile)) return 'not-ours';
  try {
    process.kill(pid, 'SIGKILL');
    return 'killed';
  } catch {
    return 'not-alive';
  }
}
