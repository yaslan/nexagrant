import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { SYSTEM_SCOPE_PURPOSES, withSystemScopeOn } from '@/lib/system-scope';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

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
 * has none. It writes NOTHING: fixtures are two tenants' worth of rows that the
 * seed already provides, and the reads are counts.
 */

const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
/** A table with rows in at least two tenants, chosen at runtime from the seed. */
let probeTenants: string[] = [];

const SUITE = 'system-scope live test';

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
  // Which tenants own Membership rows, asked over the privileged handle so the
  // expectation is built from the truth rather than from the thing under test.
  const rows = await admin.$queryRaw<Array<{ tenantId: string }>>`
    SELECT DISTINCT "tenantId" FROM "Membership" LIMIT 5`
    .catch((e: unknown) => {
      skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
      return [];
    });
  probeTenants = rows.map((r) => r.tenantId);
  ready = probeTenants.length >= 2;
  if (!ready) {
    skipReason ||= `needs Membership rows in 2+ tenants; found ${probeTenants.length}. Run \`pnpm db:seed\`.`;
    skipOrFailInCi(SUITE, skipReason);
  }
});

afterAll(async () => {
  await rls?.$disconnect().catch(() => {});
  await admin?.$disconnect().catch(() => {});
});

describe('withSystemScope over a NOBYPASSRLS role', () => {
  test('outside the path, a cross-tenant read returns nothing', async () => {
    if (!ready || !rls) return expect(skipReason).toBeTruthy();
    const count = await rls.membership.count();
    expect(count).toBe(0);
  });

  test('inside the path, the same read spans tenants', async () => {
    if (!ready || !rls || !admin) return expect(skipReason).toBeTruthy();

    const truth = await admin.membership.count();
    const seen = await withSystemScopeOn(rls, 'platform-aggregate', 'test.membershipCount', (tx) =>
      tx.membership.findMany({ select: { tenantId: true } })
    );

    expect(seen.length).toBe(truth);
    // Not just "more than zero": rows from more than one tenant is the property
    // that distinguishes an open scope from a lucky single-tenant read.
    expect(new Set(seen.map((m) => m.tenantId)).size).toBeGreaterThan(1);
  });

  test('the scope dies with its transaction', async () => {
    if (!ready || !rls) return expect(skipReason).toBeTruthy();
    await withSystemScopeOn(rls, 'platform-aggregate', 'test.scopeLifetime', async (tx) => {
      expect(await tx.membership.count()).toBeGreaterThan(0);
    });
    // Same client, next statement, no scope.
    expect(await rls.membership.count()).toBe(0);
  });

  test('the database refuses a purpose that is not on the list', async () => {
    if (!ready || !rls) return expect(skipReason).toBeTruthy();
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

  test('every purpose is accepted by the database', async () => {
    if (!ready || !rls) return expect(skipReason).toBeTruthy();
    for (const purpose of SYSTEM_SCOPE_PURPOSES) {
      await withSystemScopeOn(rls, purpose, `test.${purpose}`, async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ p: string }>>`
          SELECT current_setting('app.system_scope_purpose', true) AS p`;
        expect(row?.p).toBe(purpose);
      });
    }
  });
});
