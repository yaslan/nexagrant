import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { SYSTEM_SCOPE_PURPOSES, withSystemScopeOn } from '@/lib/system-scope';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

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
