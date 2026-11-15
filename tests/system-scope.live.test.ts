import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { SYSTEM_SCOPE_PURPOSES, withSystemScopeOn } from '@/lib/system-scope';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';
import { EXPERT_DIRECTORY_POLICY_LOCK, withTestDbLock } from './helpers/test-db-lock';

/**
 * TASK-MTVTPVTEBCF5Z — the sanctioned cross-tenant path, measured where it is
 * the only place it can be measured: on a NOBYPASSRLS connection.
 *
 * The whole point of `withSystemScope` is a behaviour no unit test can observe.
 * Locally the app connects as `fabrika` (SUPERUSER, BYPASSRLS), so RLS is inert
 * and an unscoped read returns every row whether or not the path exists — a
 * green test through that role proves nothing at all, which is the lesson
 * scripts/check-rls-live.ts's header records at length. So every arm here runs
 * over `DATABASE_URL_RLS_TEST` (role `fabrika_app`, `rolbypassrls = false`,
 * asserted below before anything else is claimed).
 *
 * The arms are a set, and the negative one carries the weight:
 *
 *   1. OUTSIDE the path, the same read returns ZERO rows. Without this the
 *      other arms would pass just as happily on a database with no policies.
 *   2. INSIDE the path it returns rows from more than one tenant.
 *   3. AFTER the transaction the scope is gone — is_local, not a session flag.
 *   4. An unknown purpose is refused by the DATABASE, not only by TypeScript.
 *   5. The five purposes in TS and the five in prisma/rls.sql are the same
 *      five, so the deliberate duplication cannot drift.
 *
 * `.live` because it needs the Postgres in docker-compose; it skips itself when
 * the database is unreachable rather than reddening the gate on a machine that
 * has none (and refuses to skip in CI). Arm 2 needs Membership rows in two
 * tenants, so the suite brings its own (TASK-MULT5YZUFQR5F): two throwaway
 * tenants, each with one user and one membership, written over the owning
 * handle in `beforeAll` and removed in `afterAll`. It used to borrow them from
 * the seed, which creates one tenant, so on a fresh CI database the suite could
 * not run at all. A fixture that cannot be written is an error, not a skip.
 */

const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const SUITE = 'system-scope live test';

const RUN = `sysscope-${Date.now()}-${process.pid}`;
const FIXTURE_TENANTS = [`t-sysscope-a-${RUN}`, `t-sysscope-b-${RUN}`];
const FIXTURE_USERS = FIXTURE_TENANTS.map((t) => `u-${t}`);
let fixtureWritten = false;

/** Memberships go with their tenant and user (onDelete: Cascade). */
async function wipeFixture(db: PrismaClient): Promise<void> {
  await db.tenant.deleteMany({ where: { id: { in: FIXTURE_TENANTS } } });
  await db.user.deleteMany({ where: { id: { in: presentIds(FIXTURE_USERS) } } });
}

beforeAll(async () => {
  if (!requireRlsTestUrl(RLS_URL, SUITE)) {
    skipReason = 'DATABASE_URL_RLS_TEST is not set. Run `pnpm db:rls-role`.';
    return;
  }
  rls = createDbClient(RLS_URL!);
  admin = createDbClient(ADMIN_URL ?? '');
  const reachable = await rls.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  if (!reachable) {
    skipReason = 'database unavailable';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  // A BYPASSRLS role used to be a skip here, and every test below reported
  // green through `expect(skipReason).toBeTruthy()`. It is a failure now.
  await assertRlsSubjectRole(rls, SUITE);
  // The two-tenant fixture, over the owning handle: the RLS role could not
  // write a second tenant's rows, and that is the point. No catch — if this
  // fails the file goes red with the database's own error.
  fixtureWritten = true;
  await wipeFixture(admin);
  for (const [i, tenantId] of FIXTURE_TENANTS.entries()) {
    const userId = FIXTURE_USERS[i]!;
    await admin.tenant.create({
      data: { id: tenantId, name: `system-scope probe ${RUN}`, slug: tenantId, country: 'TR' },
    });
    await admin.user.create({ data: { id: userId, email: `${userId}@system-scope.test` } });
    await admin.membership.create({ data: { tenantId, userId } });
  }
  // Read back over the privileged handle, so the expectation is built from the
  // truth rather than from the thing under test.
  const rows = await admin.membership.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: FIXTURE_TENANTS } },
    _count: true,
  });
  if (rows.length !== FIXTURE_TENANTS.length) {
    throw new Error(
      `${SUITE}: fixture wrote memberships in ${rows.length} of ${FIXTURE_TENANTS.length} tenants`
    );
  }
  ready = true;
});

afterAll(async () => {
  if (fixtureWritten && admin) await wipeFixture(admin);
  await rls?.$disconnect().catch(() => {});
  await admin?.$disconnect().catch(() => {});
});

describe('withSystemScope over a NOBYPASSRLS role', () => {
  test('outside the path, a cross-tenant read returns nothing', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    const count = await rls.membership.count();
    expect(count).toBe(0);
  });

  test('inside the path, the same read spans tenants', async (ctx) => {
    if (!ready || !rls || !admin) return ctx.skip(skipReason);

    // Counted over the fixture's tenants, not the whole table: the other live
    // files write Membership rows concurrently, and a whole-table count taken
    // before the scoped read raced them. No tenant is set on this connection,
    // so seeing both tenants' rows is still the cross-tenant property.
    const where = { tenantId: { in: FIXTURE_TENANTS } };
    const truth = await admin.membership.count({ where });
    const seen = await withSystemScopeOn(rls, 'platform-aggregate', 'test.membershipCount', (tx) =>
      tx.membership.findMany({ where, select: { tenantId: true } })
    );

    expect(seen.length).toBe(truth);
    // Not just "more than zero": rows from more than one tenant is the property
    // that distinguishes an open scope from a lucky single-tenant read.
    const seenTenants = new Set(seen.map((m) => m.tenantId));
    expect(seenTenants.size).toBeGreaterThan(1);
    for (const t of FIXTURE_TENANTS) expect(seenTenants.has(t)).toBe(true);
  });

  test('the scope dies with its transaction', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    await withSystemScopeOn(rls, 'platform-aggregate', 'test.scopeLifetime', async (tx) => {
      expect(await tx.membership.count()).toBeGreaterThan(0);
    });
    // Same client, next statement, no scope.
    expect(await rls.membership.count()).toBe(0);
  });

  test('the database refuses a purpose that is not on the list', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    await expect(
      rls.$transaction((tx) => tx.$executeRaw`SELECT enter_system_scope('anything-i-like')`)
    ).rejects.toThrow(/unknown purpose/i);
  });
});

describe('the purpose list', () => {
  test('TypeScript and prisma/rls.sql declare the same five purposes', () => {
    const sql = readFileSync(resolve(process.cwd(), 'prisma/rls.sql'), 'utf8');
    const body = /purpose NOT IN \(([\s\S]*?)\)/.exec(sql)?.[1];
    expect(body, 'prisma/rls.sql: enter_system_scope has no purpose list').toBeDefined();
    const inSql = [...(body as string).matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(inSql.sort()).toEqual([...SYSTEM_SCOPE_PURPOSES].sort());
  });

  test('every purpose is accepted by the database', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    for (const purpose of SYSTEM_SCOPE_PURPOSES) {
      await withSystemScopeOn(rls, purpose, `test.${purpose}`, async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ p: string }>>`
          SELECT current_setting('app.system_scope_purpose', true) AS p`;
        expect(row?.p).toBe(purpose);
      });
    }
  });
});

/**
 * TASK-MUOGMQK3JAH4Y (İNCELEME-115 Ö-1) — only enter_system_scope opens it.
 *
 * `app.system_scope` is a placeholder GUC and therefore USERSET: PostgreSQL
 * lets any role set it, and no GRANT can say otherwise. Until the seal,
 * fabrika_app opened every tenant's rows with each of the shapes below. Each
 * arm reads the fixture's two tenants over a raw `pg` connection as
 * fabrika_app, because two of the shapes live in the connection itself
 * (PGOPTIONS, `options=` in the URL) and a Prisma pool would carry a session
 * SET into the next test.
 */
const fixtureCount = async (c: pg.Client): Promise<number> =>
  Number(
    (
      await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "Membership" WHERE "tenantId" = ANY($1)`,
        [FIXTURE_TENANTS]
      )
    ).rows[0]?.n ?? -1
  );

async function asApp<T>(fn: (c: pg.Client) => Promise<T>, options?: string): Promise<T> {
  const c = new pg.Client({ connectionString: RLS_URL, ...(options ? { options } : {}) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('a forged system scope opens nothing', () => {
  test('control: enter_system_scope sees both tenants on the same connection shape', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const n = await asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT enter_system_scope('platform-admin')`);
        return await fixtureCount(c);
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(n).toBe(FIXTURE_TENANTS.length);
  });

  const forgeries: Array<[string, string[]]> = [
    ['SET (session)', [`SET app.system_scope = 'on'`]],
    ['SET LOCAL', ['BEGIN', `SET LOCAL app.system_scope = 'on'`]],
    ['set_config(is_local => true)', ['BEGIN', `SELECT set_config('app.system_scope', 'on', true)`]],
    ['set_config(is_local => false)', [`SELECT set_config('app.system_scope', 'on', false)`]],
    ['a made-up seal', ['BEGIN', `SET LOCAL app.system_scope = 'on'`, `SET LOCAL app.system_scope_token = 'deadbeef'`]],
  ];
  for (const [name, statements] of forgeries) {
    test(name, async (ctx) => {
      if (!ready) return ctx.skip(skipReason);
      const n = await asApp(async (c) => {
        for (const s of statements) await c.query(s);
        const [row] = (await c.query<{ s: string | null }>(`SELECT current_setting('app.system_scope', true) AS s`)).rows;
        expect(row?.s).toBe('on'); // the flag really is set; only the policy refuses it
        return fixtureCount(c);
      });
      expect(n).toBe(0);
    });
  }

  test('PGOPTIONS / options= in the connection string', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const n = await asApp(fixtureCount, '-c app.system_scope=on');
    expect(n).toBe(0);
  });

  test('a seal replayed from an earlier transaction', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const n = await asApp(async (c) => {
      await c.query('BEGIN');
      await c.query(`SELECT enter_system_scope('platform-admin')`);
      const seal = (await c.query<{ t: string }>(`SELECT current_setting('app.system_scope_token') AS t`)).rows[0]!.t;
      await c.query('COMMIT');
      expect(seal).toMatch(/^[0-9a-f]{64}$/);
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.system_scope', 'on', true), set_config('app.system_scope_token', $1, true)`, [seal]);
      try {
        return await fixtureCount(c);
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(n).toBe(0);
  });

  // TASK-MUPCYOCLINGC7 (crw2-fb Ö-2, mutant N6): this transaction's real seal
  // with one hex digit changed. Comparing only a prefix (N6: the first 8 hex,
  // 32 bits, brute-forceable inside one transaction) or only a suffix would
  // let one of these through.
  test('a near-miss of this transaction\'s seal (first or last hex digit changed)', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const flip = (h: string) => (h === '0' ? '1' : '0');
    const seen = await asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT enter_system_scope('platform-admin')`);
        const seal = (await c.query<{ t: string }>(`SELECT current_setting('app.system_scope_token') AS t`)).rows[0]!.t;
        expect(seal).toMatch(/^[0-9a-f]{64}$/);
        const out: number[] = [await fixtureCount(c)]; // control: the real seal opens it
        for (const forged of [seal.slice(0, -1) + flip(seal.slice(-1)), flip(seal[0]!) + seal.slice(1)]) {
          await c.query(`SELECT set_config('app.system_scope_token', $1, true)`, [forged]);
          out.push(await fixtureCount(c));
        }
        return out;
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(seen).toEqual([FIXTURE_TENANTS.length, 0, 0]);
  });

  test('a forged scope cannot write another tenant', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SET LOCAL app.system_scope = 'on'`);
        await expect(
          c.query(`INSERT INTO "Membership"(id, "tenantId", "userId") VALUES ($1, $2, $3)`, [
            `m-forged-${RUN}`,
            FIXTURE_TENANTS[0],
            FIXTURE_USERS[1],
          ])
        ).rejects.toThrow(/row-level security/i);
      } finally {
        await c.query('ROLLBACK');
      }
    });
  });

  test('the secret and the seal function are out of the app role\'s reach', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await asApp(async (c) => {
      await expect(c.query('SELECT secret FROM fabrika_private.system_scope_key')).rejects.toThrow(/permission denied/i);
      await expect(c.query('SELECT fabrika_private.system_scope_seal(\'platform-admin\')')).rejects.toThrow(/permission denied/i);
    });
  });
});

/**
 * FO-52 (TASK-MVC9FW2U15VM6, K-569554 = C) — 'public-intake' is the anonymous
 * expert form, and the database opens only the form's tables for it
 * (prisma/rls.sql system_scope_open). Every other purpose still opens all rows
 * but the expert data it does not handle (FO-92, below).
 * Raw `pg` as fabrika_app, one transaction per arm, always rolled back.
 */
describe('public-intake opens only the expert form tables', () => {
  async function inScope<T>(purpose: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
    return asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query('SELECT enter_system_scope($1)', [purpose]);
        return await fn(c);
      } finally {
        await c.query('ROLLBACK');
      }
    });
  }
  const apiKeyCount = async (c: pg.Client): Promise<number> =>
    Number((await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM "ApiKey"`)).rows[0]?.n ?? -1);

  test('another tenant\'s Membership and ApiKey rows stay at 0, while platform-admin still sees them', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const intake = await inScope('public-intake', async (c) => [await fixtureCount(c), await apiKeyCount(c)]);
    // The regression arm: the narrowing is public-intake's alone. The fixture's
    // memberships carry the weight; ApiKey is counted whole-table, and other
    // live files write it concurrently, so only public-intake's 0 is exact.
    const platform = await inScope('platform-admin', fixtureCount);
    expect(intake).toEqual([0, 0]);
    expect(platform).toBe(FIXTURE_TENANTS.length);
  });

  test('a write outside the form tables is refused', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await inScope('public-intake', async (c) => {
      await expect(
        c.query(`INSERT INTO "AuditEvent"(id, "tenantId", type) VALUES ($1, $2, 'fo52.probe')`, [
          `ae-intake-${RUN}`,
          FIXTURE_TENANTS[0],
        ])
      ).rejects.toThrow(/row-level security/i);
    });
  });

  test('the form still reads and writes ExpertPreRegistration', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const id = `epr-intake-${RUN}`;
    const seen = await inScope('public-intake', async (c) => {
      await c.query(
        `INSERT INTO "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale)
         VALUES ($1, 'probe', $1 || '@system-scope.test', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr')`,
        [id]
      );
      return (await c.query<{ id: string }>(`SELECT id FROM "ExpertPreRegistration" WHERE id = $1`, [id])).rows;
    });
    expect(seen).toEqual([{ id }]);
  });
});

/**
 * FO-92 (FO-21 O4) — the reverse direction: the expert's personal data opens
 * only for the purposes that handle it (prisma/rls.sql system_scope_open). The
 * fixture row is written by public-intake and counted under each purpose in the
 * same transaction, so concurrent writers cannot skew the count; rolled back.
 */
describe('expert pre-registrations open only for the purposes that handle them', () => {
  const EXPECTED: Record<string, number> = {
    'tenant-discovery': 0,
    'subject-scoped': 0,
    'platform-admin': 1,
    'platform-aggregate': 1,
    'cross-tenant-job': 1,
    'public-intake': 1,
    // NG-52: the fixture row is `pending`; expert-directory opens verified rows only.
    'expert-directory': 0,
  };

  test('tenant-discovery and subject-scoped read 0, the handling purposes read the row', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const id = `epr-reverse-${RUN}`;
    const seen = await asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT enter_system_scope('public-intake')`);
        await c.query(
          `INSERT INTO "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale)
           VALUES ($1, 'probe', $1 || '@system-scope.test', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr')`,
          [id]
        );
        const out: Record<string, number> = {};
        for (const purpose of SYSTEM_SCOPE_PURPOSES) {
          await c.query('SELECT enter_system_scope($1)', [purpose]);
          const sql = `SELECT count(*)::int AS n FROM "ExpertPreRegistration" WHERE id = $1`;
          out[purpose] = Number((await c.query<{ n: number }>(sql, [id])).rows[0]?.n ?? -1);
        }
        return out;
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(seen).toEqual(EXPECTED);
  });

  test('tenant-discovery cannot write an expert row', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT enter_system_scope('tenant-discovery')`);
        await expect(
          c.query(
            `INSERT INTO "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale)
             VALUES ($1, 'probe', $1 || '@system-scope.test', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr')`,
            [`epr-discovery-${RUN}`]
          )
        ).rejects.toThrow(/row-level security/i);
      } finally {
        await c.query('ROLLBACK');
      }
    });
  });
});

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — purpose 'expert-directory': the verified expert
 * pre-registrations M8 offers as seat candidates. It opens the expert_directory
 * SELECT policy and nothing else: a pending row stays shut, no write passes, and
 * no other system_scope table opens. Fixture rows are written by public-intake in
 * the same transaction and rolled back.
 */
describe('expert-directory reads verified expert rows and nothing else', () => {
  const insert = `INSERT INTO "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale, status)
     VALUES ($1, 'probe', $1 || '@system-scope.test', '06', true, '{}', '{researcher}', '{horizon-europe-h2020}', '{}', now(), now(), 'tr', $2)`;

  test('a verified row is seen, a pending one is not, and no write or other table opens', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const verified = `epr-dir-verified-${RUN}`;
    const pending = `epr-dir-pending-${RUN}`;
    // rls-verify-system-scope-policy-set.live swaps expert_directory out under this lock.
    const seen = await withTestDbLock(ADMIN_URL!, EXPERT_DIRECTORY_POLICY_LOCK, () =>
      asApp(async (c) => {
        await c.query('BEGIN');
        try {
          await c.query(`SELECT enter_system_scope('public-intake')`);
          await c.query(insert, [verified, 'verified']);
          await c.query(insert, [pending, 'pending']);
          await c.query(`SELECT enter_system_scope('expert-directory')`);
          const rows = (
            await c.query<{ id: string }>(`SELECT id FROM "ExpertPreRegistration" WHERE id = ANY($1) ORDER BY id`, [[verified, pending]])
          ).rows;
          const memberships = Number(
            (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Membership" WHERE "tenantId" = ANY($1)`, [FIXTURE_TENANTS])).rows[0]?.n ?? -1
          );
          const updated = (await c.query(`UPDATE "ExpertPreRegistration" SET province = '34' WHERE id = $1`, [verified])).rowCount;
          await c.query('SAVEPOINT w');
          const write = await c
            .query(insert, [`epr-dir-write-${RUN}`, 'verified'])
            .then(() => 'written')
            .catch((e: Error) => e.message);
          await c.query('ROLLBACK TO SAVEPOINT w');
          return { rows, memberships, updated, write };
        } finally {
          await c.query('ROLLBACK');
        }
      })
    );
    expect(seen.rows).toEqual([{ id: verified }]);
    expect(seen.memberships).toBe(0);
    expect(seen.updated).toBe(0);
    expect(seen.write).toMatch(/row-level security/i);
  });
});

/**
 * NG-187 (SEC NG-185 F-2) — the seal binds the purpose. `app.system_scope_purpose` is USERSET,
 * so the app role can `SET LOCAL` it after enter_system_scope(). Before NG-187 the seal covered
 * only secret | pid | transaction_timestamp, the new purpose took effect, and an
 * 'expert-directory' scope read every expert row (pending and disabled too) and updated one.
 * Now the seal is computed over the purpose: a changed purpose breaks it and the sealed branch
 * opens nothing. Calling enter_system_scope(<other purpose>) is still the legitimate switch.
 * Fixture rows are written by public-intake in the same transaction and rolled back.
 */
describe('NG-187: the seal binds the purpose, a later purpose change opens nothing', () => {
  const insert = `INSERT INTO "ExpertPreRegistration" (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale, status)
     VALUES ($1, 'probe', $1 || '@system-scope.test', '06', true, '{}', '{researcher}', '{horizon-europe-h2020}', '{}', now(), now(), 'tr', $2)`;
  const ids = (tag: string) => ({ verified: `epr-seal-v-${tag}-${RUN}`, pending: `epr-seal-p-${tag}-${RUN}` });
  const expertRows = async (c: pg.Client, wanted: string[]): Promise<string[]> =>
    (await c.query<{ id: string }>(`SELECT id FROM "ExpertPreRegistration" WHERE id = ANY($1) ORDER BY id`, [wanted])).rows.map((r) => r.id);
  const sealed = async (c: pg.Client): Promise<boolean> =>
    (await c.query<{ s: boolean }>('SELECT public.system_scope_sealed() AS s')).rows[0]?.s === true;
  const tryWrite = async (c: pg.Client, sql: string, params: unknown[]): Promise<number | string> => {
    await c.query('SAVEPOINT w');
    try {
      return (await c.query(sql, params)).rowCount ?? 0;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT w');
    }
  };

  test("the F-2 reproduction: expert-directory, then SET LOCAL purpose = 'platform-admin' reads 0 and updates 0", async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const { verified, pending } = ids('f2');
    // rls-verify-system-scope-policy-set.live swaps expert_directory out under this lock.
    const seen = await withTestDbLock(ADMIN_URL!, EXPERT_DIRECTORY_POLICY_LOCK, () =>
      asApp(async (c) => {
        await c.query('BEGIN');
        try {
          await c.query(`SELECT enter_system_scope('public-intake')`);
          await c.query(insert, [verified, 'verified']);
          await c.query(insert, [pending, 'pending']);
          await c.query(`SELECT enter_system_scope('expert-directory')`);
          const before = await expertRows(c, [verified, pending]);
          await c.query(`SET LOCAL app.system_scope_purpose = 'platform-admin'`);
          const purpose = (await c.query<{ p: string }>(`SELECT current_setting('app.system_scope_purpose') AS p`)).rows[0]?.p;
          const after = await expertRows(c, [verified, pending]);
          const memberships = await fixtureCount(c);
          const updated = await tryWrite(c, `UPDATE "ExpertPreRegistration" SET "fullName" = 'elevated' WHERE id = ANY($1)`, [[verified, pending]]);
          const audit = await tryWrite(c, `INSERT INTO "AuditEvent" (id, "tenantId", type) VALUES ($1, NULL, 'ng187.test')`, [`ae-seal-${RUN}`]);
          return { before, purpose, after, memberships, updated, audit, sealedAfter: await sealed(c) };
        } finally {
          await c.query('ROLLBACK');
        }
      })
    );
    expect(seen.before).toEqual([verified]); // control: the legitimate expert-directory read
    expect(seen.purpose).toBe('platform-admin'); // the GUC really changed; only the seal refuses it
    expect(seen.sealedAfter).toBe(false);
    expect(seen.after).toEqual([]);
    expect(seen.memberships).toBe(0);
    expect(seen.updated).toBe(0);
    expect(seen.audit).toMatch(/row-level security/i);
  });

  test('for every purpose, changing the purpose after the seal (to any other purpose or empty) opens nothing', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const { verified, pending } = ids('all');
    const result = await withTestDbLock(ADMIN_URL!, EXPERT_DIRECTORY_POLICY_LOCK, () =>
      asApp(async (c) => {
        await c.query('BEGIN');
        try {
          await c.query(`SELECT enter_system_scope('public-intake')`);
          await c.query(insert, [verified, 'verified']);
          await c.query(insert, [pending, 'pending']);
          const legit: Record<string, { sealed: boolean; experts: number; memberships: number }> = {};
          const leaks: string[] = [];
          for (const p of SYSTEM_SCOPE_PURPOSES) {
            await c.query('SELECT enter_system_scope($1)', [p]);
            legit[p] = { sealed: await sealed(c), experts: (await expertRows(c, [verified, pending])).length, memberships: await fixtureCount(c) };
            for (const q of [...SYSTEM_SCOPE_PURPOSES.filter((x) => x !== p), '']) {
              await c.query('SELECT enter_system_scope($1)', [p]);
              await c.query(`SELECT set_config('app.system_scope_purpose', $1, true)`, [q]);
              const label = `${p} -> '${q}'`;
              if (await sealed(c)) leaks.push(`${label}: still sealed`);
              const experts = await expertRows(c, [verified, pending]);
              if (experts.length > 0) leaks.push(`${label}: ${experts.length} expert rows`);
              const m = await fixtureCount(c);
              if (m !== 0) leaks.push(`${label}: ${m} memberships`);
              const upd = await tryWrite(c, `UPDATE "ExpertPreRegistration" SET "fullName" = 'elevated' WHERE id = ANY($1)`, [[verified, pending]]);
              if (upd !== 0) leaks.push(`${label}: UPDATE ${upd}`);
              const ins = await tryWrite(c, `INSERT INTO "AuditEvent" (id, "tenantId", type) VALUES ($1, NULL, 'ng187.test')`, [`ae-seal-${p}-${q}-${RUN}`]);
              if (typeof ins !== 'string' || !/row-level security/i.test(ins)) leaks.push(`${label}: AuditEvent INSERT ${ins}`);
            }
          }
          return { legit, leaks };
        } finally {
          await c.query('ROLLBACK');
        }
      })
    );
    expect(result.leaks).toEqual([]);
    // The legitimate paths are untouched: each purpose still opens what it opened before NG-187.
    const two = FIXTURE_TENANTS.length;
    expect(result.legit).toEqual({
      'tenant-discovery': { sealed: true, experts: 0, memberships: two },
      'subject-scoped': { sealed: true, experts: 0, memberships: two },
      'platform-admin': { sealed: true, experts: 2, memberships: two },
      'platform-aggregate': { sealed: true, experts: 2, memberships: two },
      'cross-tenant-job': { sealed: true, experts: 2, memberships: two },
      'public-intake': { sealed: true, experts: 2, memberships: 0 },
      'expert-directory': { sealed: true, experts: 1, memberships: 0 },
    });
  });

  test('the seal is for the purpose it was entered with: setting that purpose back, or entering another one, works', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const seen = await asApp(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT enter_system_scope('platform-admin')`);
        await c.query(`SET LOCAL app.system_scope_purpose = 'tenant-discovery'`);
        const changed = await fixtureCount(c);
        await c.query(`SET LOCAL app.system_scope_purpose = 'platform-admin'`);
        const restored = await fixtureCount(c);
        await c.query(`SELECT enter_system_scope('tenant-discovery')`);
        const reentered = await fixtureCount(c);
        return { changed, restored, reentered };
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(seen).toEqual({ changed: 0, restored: FIXTURE_TENANTS.length, reentered: FIXTURE_TENANTS.length });
  });
});
