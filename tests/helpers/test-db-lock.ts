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
 * scripts/apply-migrations.sh refuses to run while a stored default for
 * app.system_scope reaches its database: one on that database, or a role-wide
 * one (pg_db_role_setting.setdatabase = 0), which reaches every database.
 * migration-owner-chain.live stores a role-wide one on its own owner role for a
 * few seconds, so two gates on one Postgres would still break each other's
 * chain runs (FO-27; FO-34 only stopped other databases' defaults counting).
 * Held for that whole file, on the admin session. The advisory lock lives in
 * one database, so gates pointed at different databases are not serialised.
 */
export const MIGRATION_OWNER_CHAIN_LOCK = 'cluster:app.system_scope-defaults';

/**
 * FO-66 — runPartnerSearchIngestion against the live database. Two files run it
 * (partner-search-ingest.live, partner-search-acceptance.live): one counts
 * PartnerSearchIngestionRun rows around a no-op run and deletes every
 * `partner_search_adapter` alert, the other raises those alerts. Each holds this
 * for the whole file.
 */
export const PARTNER_SEARCH_INGESTION_LOCK = 'PartnerSearch:ingestion';

/**
 * The lock held from a `beforeAll` to its `afterAll`, for a file that shares a
 * database object in every test. Returns the release; call it in `afterAll`.
 */
export async function holdTestDbLock(url: string, name: string): Promise<() => Promise<void>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [`test:${name}`]);
  return async () => {
    await client.end().catch(() => {});
  };
}

/**
 * purgeExpiredInterregText() is cross-tenant and date-driven: a run from one live file empties the
 * due texts another file is counting. m17-text-retention.live and m17-interreg-fo191.live hold this
 * for their whole file (beforeAll → afterAll), so neither one's purge can take the other's rows.
 */
export const M17_INTERREG_TEXT_PURGE_LOCK = 'M17:interreg-text-purge';
