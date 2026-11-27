import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { envValue } from './helpers/dotenv';
import { requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * NG-243 (NG-9 review Ö-1) — the anonymous intake tables are append-only for the purposes
 * the anonymous visitor's request runs under.
 *
 * CookieConsentRecord ('cookie-consent'), PublicLead, ExpertPreRegAttempt and
 * ExpertPreRegistration ('public-intake') used to open UPDATE and DELETE to those purposes
 * as well, because their one policy `system_scope` is FOR ALL. prisma/rls.sql now adds two
 * RESTRICTIVE policies per table (intake_no_update, intake_no_delete): under an intake
 * purpose an UPDATE or DELETE touches 0 rows. The two exceptions are what the forms
 * themselves do, measured in src/:
 *   - ExpertPreRegistration: a PENDING row (status 'pending', emailVerifiedAt NULL) may still be
 *     updated (link re-issue, verification, its rollback) and deleted (the rollback of a row
 *     whose mail failed). A verified or disabled row is not.
 *   - ExpertPreRegAttempt: rows older than 24 hours may be deleted (register.ts drops them
 *     before it counts). A recent attempt cannot be deleted, so the IP counter cannot be reset.
 * The other purposes (platform-admin, cross-tenant-job: admin lists, forwarder, retention
 * purge) keep UPDATE and DELETE, measured here too.
 *
 * Measured over DATABASE_URL_RLS_TEST (fabrika_app, NOBYPASSRLS). Every case runs in one
 * transaction that is rolled back: its fixture rows are inserted under 'platform-admin' in
 * the same transaction, so nothing is committed and the suite is safe on a shared database.
 */
const SUITE = 'public-intake append-only live test';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');

const client = new pg.Client({ connectionString: RLS_URL ?? 'postgresql://localhost:5432/unset', connectionTimeoutMillis: 3000 });
let ready = false;
let skipReason = '';

beforeAll(async () => {
  if (!requireRlsTestUrl(RLS_URL, SUITE)) {
    skipReason = 'DATABASE_URL_RLS_TEST is not set';
    return;
  }
  const reachable = await client.connect().then(() => true).catch(() => false);
  if (!reachable) {
    skipReason = 'database unavailable';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  const role = (
    await client.query<{ rolsuper: boolean; rolbypassrls: boolean; u: string }>(
      'select current_user::text as u, rolsuper, rolbypassrls from pg_roles where rolname = current_user'
    )
  ).rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(`${SUITE}: connected as "${role?.u}" — RLS does not apply; point DATABASE_URL_RLS_TEST at fabrika_app`);
  }
  ready = true;
});

afterAll(async () => {
  await client.end().catch(() => {});
});

const id = () => `ng243-${randomBytes(6).toString('hex')}`;
const scope = (purpose: string) => client.query('select enter_system_scope($1)', [purpose]);

/** Runs `body` in a transaction that is always rolled back. */
async function rolledBack(body: () => Promise<void>): Promise<void> {
  await client.query('begin');
  try {
    await body();
  } finally {
    await client.query('rollback');
  }
}

/** rowCount of a statement run inside a savepoint (an error is rethrown after the rollback to it). */
async function affected(sql: string, params: unknown[]): Promise<number> {
  await client.query('savepoint ng243');
  try {
    const r = await client.query(sql, params);
    return r.rowCount ?? -1;
  } finally {
    await client.query('rollback to savepoint ng243');
  }
}

type Table = {
  table: string;
  intakePurpose: string;
  insert: (rowId: string) => [string, unknown[]];
  /** A column update that is valid for any row of the table. */
  update: string;
};

const TABLES: Table[] = [
  {
    table: 'CookieConsentRecord',
    intakePurpose: 'cookie-consent',
    insert: (rowId) => [
      `insert into "CookieConsentRecord" (id, "visitorId", choice, analytics, marketing, "policyVersion", locale)
       values ($1, 'ng243-probe', 'reject_all', false, false, 'probe', 'tr')`,
      [rowId],
    ],
    update: `update "CookieConsentRecord" set choice = 'accept_all', analytics = true, marketing = true where id = $1`,
  },
  {
    table: 'PublicLead',
    intakePurpose: 'public-intake',
    insert: (rowId) => [
      `insert into "PublicLead" (id, name, email, organisation, "consentVersion", "consentAt", source, locale)
       values ($1, 'probe', $1 || '@ng243.invalid', 'probe', 'probe', now(), 'fon-hazirlik', 'tr')`,
      [rowId],
    ],
    update: `update "PublicLead" set email = 'changed@ng243.invalid' where id = $1`,
  },
  {
    table: 'ExpertPreRegAttempt',
    intakePurpose: 'public-intake',
    insert: (rowId) => [`insert into "ExpertPreRegAttempt" (id, "ipHash") values ($1, 'ng243-probe')`, [rowId]],
    update: `update "ExpertPreRegAttempt" set "ipHash" = 'changed' where id = $1`,
  },
  {
    table: 'ExpertPreRegistration',
    intakePurpose: 'public-intake',
    // A verified row: the one the intake must not change or remove.
    insert: (rowId) => [
      `insert into "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages,
                                            "kvkkAcceptedAt", "visibilityConsentAt", locale, status, "emailVerifiedAt")
       values ($1, 'probe', $1 || '@ng243.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr', 'verified', now())`,
      [rowId],
    ],
    update: `update "ExpertPreRegistration" set "fullName" = 'changed' where id = $1`,
  },
];

describe.each(TABLES)('$table', (t) => {
  it(`${t.intakePurpose}: UPDATE and DELETE touch no row, INSERT still works`, async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await rolledBack(async () => {
      const rowId = id();
      await scope('platform-admin');
      await client.query(...t.insert(rowId));

      await scope(t.intakePurpose);
      expect(await affected(t.update, [rowId]), 'UPDATE under the intake purpose').toBe(0);
      expect(await affected(`delete from "${t.table}" where id = $1`, [rowId]), 'DELETE under the intake purpose').toBe(0);
      // The row is still there and readable to the intake (its rate-limit counts read it).
      expect((await client.query(`select 1 from "${t.table}" where id = $1`, [rowId])).rowCount).toBe(1);
      // The form's own write is not affected.
      expect(await affected(...t.insert(id()))).toBe(1);
    });
  });

  it('platform-admin may UPDATE, cross-tenant-job may UPDATE and DELETE (admin console, retention purge)', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await rolledBack(async () => {
      const rowId = id();
      await scope('platform-admin');
      await client.query(...t.insert(rowId));
      expect(await affected(t.update, [rowId]), 'UPDATE under platform-admin').toBe(1);

      await scope('cross-tenant-job');
      expect(await affected(t.update, [rowId]), 'UPDATE under cross-tenant-job').toBe(1);
      expect(await affected(`delete from "${t.table}" where id = $1`, [rowId]), 'DELETE under cross-tenant-job').toBe(1);
    });
  });
});

describe('the two exceptions the forms need', () => {
  it('ExpertPreRegistration: public-intake still updates and deletes a PENDING row (re-issue, verify, rollback)', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await rolledBack(async () => {
      const pending = id();
      await scope('public-intake');
      await client.query(
        `insert into "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages,
                                              "kvkkAcceptedAt", "visibilityConsentAt", locale, status)
         values ($1, 'probe', $1 || '@ng243.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr', 'pending')`,
        [pending]
      );
      // re-issue (register.ts) and its rollback
      expect(await affected(`update "ExpertPreRegistration" set "lastSubmittedAt" = now() where id = $1`, [pending])).toBe(1);
      // verification (verify.ts): pending -> verified passes the new row's check
      expect(
        await affected(`update "ExpertPreRegistration" set status = 'verified', "emailVerifiedAt" = now() where id = $1`, [pending])
      ).toBe(1);
      // rollback of a row whose mail failed (register.ts)
      expect(await affected(`delete from "ExpertPreRegistration" where id = $1`, [pending])).toBe(1);

      // once verified, the intake can neither change it back nor remove it
      await client.query(`update "ExpertPreRegistration" set status = 'verified', "emailVerifiedAt" = now() where id = $1`, [pending]);
      expect(await affected(`update "ExpertPreRegistration" set status = 'pending', "emailVerifiedAt" = null where id = $1`, [pending])).toBe(0);
      expect(await affected(`delete from "ExpertPreRegistration" where id = $1`, [pending])).toBe(0);
    });
  });

  it('ExpertPreRegAttempt: public-intake deletes attempts older than 24 hours, not recent ones', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await rolledBack(async () => {
      const old = id();
      const recent = id();
      await scope('public-intake');
      await client.query(`insert into "ExpertPreRegAttempt" (id, "ipHash", "createdAt") values ($1, 'ng243-probe', now() - interval '25 hours')`, [old]);
      await client.query(`insert into "ExpertPreRegAttempt" (id, "ipHash", "createdAt") values ($1, 'ng243-probe', now() - interval '23 hours')`, [recent]);
      // register.ts's cleanup shape: the old attempt goes, the recent one stays.
      const deleted = await client.query<{ id: string }>(`delete from "ExpertPreRegAttempt" where id = any($1) returning id`, [[old, recent]]);
      expect(deleted.rows).toEqual([{ id: old }]);
      expect((await client.query(`select id from "ExpertPreRegAttempt" where id = any($1)`, [[old, recent]])).rows).toEqual([{ id: recent }]);
    });
  });
});
