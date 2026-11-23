/**
 * A live suite that finds its database without a migration, function, column or seed row it needs
 * (NG-350). Before this, such a suite printed a warning and skipped itself everywhere but CI, so a
 * local `pnpm gate` (the pre-push hook) on a database that had missed a migration went green having
 * measured nothing (NG-341: `agency-report-retention.live skipped: add-agency-report-deletion-log.sql
 * is not applied`).
 *
 * Here a missing database object:
 *   - throws inside the gate (`FONBRIDGE_GATE_RUN=1`, set by scripts/gate-lock.mjs for `pnpm gate`);
 *   - throws in CI, as `skipOrFailInCi` did for these sites;
 *   - outside both, warns and lets the suite skip, as before: a single file run on a laptop that has
 *     not applied the newest migration still gets the friendly skip.
 *
 * Only for database objects. A missing database, DATABASE_URL_RLS_TEST, AUTH_SECRET or S3 store keeps
 * `skipOrFailInCi`; the deliberate refusals of the shared `fabrika` database keep their own skip.
 */

import { isCi } from './live-db-role';

type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * True while `pnpm gate` runs: scripts/gate-lock.mjs puts `FONBRIDGE_GATE_RUN=1` in the env of
 * `gate:core`, and every step (vitest included) inherits it. Read here, not in src/lib/env.ts: it
 * is a test-harness switch, and the app never reads it.
 */
export function isGateRun(env: EnvLike = process.env): boolean {
  return env.FONBRIDGE_GATE_RUN === '1';
}

const FIX = 'Run `pnpm db:setup` on this database (it applies prisma/migrations via scripts/apply-migrations.sh and seeds).';

/**
 * Called where a live suite is about to skip because a database object it needs is missing.
 * Throws in the gate and in CI; elsewhere warns on stderr and returns, so the caller skips.
 */
export function skipOrFailOnMissingDbObject(suite: string, reason: string, env: EnvLike = process.env): void {
  if (isGateRun(env)) {
    throw new Error(`${suite}: refusing to skip in the gate — ${reason}. ${FIX}`);
  }
  // Same wording and stream as skipOrFailInCi (tests/helpers/live-db-role.ts), with the env injectable.
  if (isCi(env)) {
    throw new Error(`${suite}: refusing to skip in CI — ${reason}. ${FIX}`);
  }
  process.stderr.write(`WARNING ${suite} skipped: ${reason}\n`);
}
