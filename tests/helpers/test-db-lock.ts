import pg from 'pg';

/**
 * TASK-MUN7B4ZIEBJML — serialises test files that share one database object.
 *
 * Vitest runs files in parallel against one database. Two kinds of sharing
 * made the full suite flaky:
 *
 * - A shared row. The one platform `SystemAlert` counter that
 *   note_agency_invite_rejection() bumps for an unknown invite code is read,
 *   bumped and put back by two files. Interleaved, one deletes the row the
 *   other is counting on and the next bump opens a fresh row at 1
 *   (`expected 1 to be greater than or equal to 2`).
 * - DDL on a shared table. `DROP TRIGGER … ON "AgencyInviteCode"` needs an
 *   ACCESS EXCLUSIVE lock; while it queues, even a plain read of the table
 *   queues behind it, and a test running under a short `lock_timeout` fails
 *   with 55P03 on a statement that has nothing to do with the trigger.
 *
 * The lock is a Postgres session advisory lock on its own connection, so it
 * holds across files and worker processes, and it drops by itself if the
 * connection dies. Hold it for the whole read-act-restore (or create-drop).
 */
export async function withTestDbLock<T>(url: string, name: string, fn: () => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`test:${name}`]);
    return await fn();
  } finally {
    await client.end().catch(() => {});
  }
}

/** The shared counter behind note_agency_invite_rejection() for unknown codes. */
export const UNKNOWN_INVITE_COUNTER_LOCK = 'SystemAlert:agency.invite.rejected.unknown';

/** Test-only triggers on "AgencyInviteCode", and tests that must not queue behind them. */
export const AGENCY_INVITE_CODE_DDL_LOCK = 'AgencyInviteCode:ddl';

/**
 * upsertPublicSectorPlans() rewrites each version's PlanFeature rows (delete,
 * then create). Four files seed it in parallel; interleaved, two writers leave
 * 6 rows where 3 belong. Hold this around the seed and any read of those rows.
 */
export const PUBLIC_SECTOR_PLANS_LOCK = 'PlanFeature:public-sector';

/**
 * scripts/apply-migrations.sh refuses to run while ANY database in the cluster
 * has a stored default for app.system_scope (pg_db_role_setting is
 * cluster-wide). migration-owner-chain.live stores one on its own database for
 * a few seconds, so two gates sharing one Postgres (two worktrees) broke each
 * other's chain runs (FO-27). Held for that whole file, on the admin session.
 */
export const MIGRATION_OWNER_CHAIN_LOCK = 'cluster:app.system_scope-defaults';
