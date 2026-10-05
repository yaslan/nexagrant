import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MULUJ8O4JH1PF — an AuditEvent row with no tenant belongs to NO tenant.
 *
 * Under the `tenant_or_shared` policy AuditEvent carried from TASK-MTU6HUB8FUHMG
 * C-2, `"tenantId" IS NULL` made every such row — plan admin events, and the
 * KVKK/GDPR erasure record of a user with no membership — readable by every
 * tenant, and let any tenant session insert one. Measured through fabrika_app
 * before the fix: tenant A read 331 of 331 NULL rows; a forged NULL insert was
 * accepted.
 *
 * Every arm runs over `DATABASE_URL_RLS_TEST` (NOBYPASSRLS, asserted first):
 * through the local `fabrika` role RLS is inert and all of this passes vacuously.
 *
 *   1. Tenant A reads its own row (control) and NOT the tenant-less one.
 *   2. Tenant A cannot insert a tenant-less row.
 *   3. System scope — the platform-admin view /admin/audit uses — reads the
 *      tenant-less row, and can write one (the erasure writers' path).
 *   4. No context at all reads nothing.
 *
 * The fixture (one tenant, one tenant row, one NULL row with a marker type) is
 * written over the owning handle and removed in afterAll.
 */

const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const SUITE = 'auditevent-null-system-only live test';

const RUN = `aenull-${Date.now()}-${process.pid}`;
const TENANT_A = `t-${RUN}`;
const MARKER = `test.auditevent-null.${RUN}`;

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let fixtureWritten = false;

async function wipeFixture(db: PrismaClient): Promise<void> {
  // Tenant rows go with the tenant (onDelete: Cascade); the NULL rows by marker.
  await db.auditEvent.deleteMany({ where: { type: { startsWith: MARKER } } });
  await db.tenant.deleteMany({ where: { id: TENANT_A } });
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
  await assertRlsSubjectRole(rls, SUITE);

  fixtureWritten = true;
  await wipeFixture(admin);
  await admin.tenant.create({
    data: { id: TENANT_A, name: `auditevent-null probe ${RUN}`, slug: TENANT_A, country: 'TR' },
  });
  await admin.auditEvent.create({ data: { tenantId: TENANT_A, type: `${MARKER}.own` } });
  await admin.auditEvent.create({ data: { type: `${MARKER}.null`, target: 'no-tenant' } });
  ready = true;
});

afterAll(async () => {
  if (fixtureWritten && admin) await wipeFixture(admin);
  await rls?.$disconnect().catch(() => {});
  await admin?.$disconnect().catch(() => {});
});

const isRlsRefusal = (e: unknown) =>
  e instanceof Error && /row-level security|violates row-level/i.test(e.message);

describe('AuditEvent: a tenant-less row is readable and writable in system scope only', () => {
  test('tenant A reads its own row but not the tenant-less one', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    const seen = await withTenantOn(rls, TENANT_A, (tx) =>
      tx.auditEvent.findMany({ where: { type: { startsWith: MARKER } }, select: { type: true } })
    );
    // Positive control first: a missing GRANT would also read zero.
    expect(seen.map((r) => r.type)).toEqual([`${MARKER}.own`]);

    const nullRows = await withTenantOn(rls, TENANT_A, (tx) =>
      tx.auditEvent.count({ where: { tenantId: null } })
    );
    expect(nullRows).toBe(0);
  });

  test('tenant A cannot insert a tenant-less row', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    const attempt = withTenantOn(rls, TENANT_A, (tx) =>
      tx.auditEvent.create({ data: { type: `${MARKER}.forged` } })
    );
    const err = await attempt.then(
      () => null,
      (e: unknown) => e
    );
    expect(isRlsRefusal(err), `expected an RLS refusal, got: ${String(err)}`).toBe(true);
  });

  test('system scope (the /admin/audit view) reads the tenant-less row and both tenants', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    const seen = await withSystemScopeOn(rls, 'platform-admin', 'test.auditNull', (tx) =>
      tx.auditEvent.findMany({ where: { type: { startsWith: MARKER } }, select: { type: true } })
    );
    expect(seen.map((r) => r.type).sort()).toEqual([`${MARKER}.null`, `${MARKER}.own`]);
  });

  test('system scope can write a tenant-less row (the erasure writers path)', async (ctx) => {
    if (!ready || !rls || !admin) return ctx.skip(skipReason);
    await withSystemScopeOn(rls, 'subject-scoped', 'test.erasureAudit', (tx) =>
      tx.auditEvent.create({ data: { type: `${MARKER}.erasure`, target: 'subject-ref' } })
    );
    // Read back over the owning handle: the truth, not the thing under test.
    const landed = await admin.auditEvent.count({ where: { type: `${MARKER}.erasure`, tenantId: null } });
    expect(landed).toBe(1);
  });

  test('with no context at all, no AuditEvent row is visible', async (ctx) => {
    if (!ready || !rls) return ctx.skip(skipReason);
    expect(await rls.auditEvent.count()).toBe(0);
  });
});
