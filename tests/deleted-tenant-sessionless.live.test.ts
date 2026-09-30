import crypto from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * TASK-MUO4GO5ARDY2W (İNCELEME-86 Y-1) — a soft-deleted tenant (`Tenant.deletedAt`
 * set, in its hold before the purge) is closed on the paths that have no
 * session: the Partner REST API key, the partner portal magic link (read and
 * write), and the cron fan-outs that grant credits or mail people. The session
 * path already drops such a tenant in the jwt callback (TASK-MUO2B59ZNY7D7).
 *
 * Each case also clears `deletedAt` again and checks that the same credential
 * works: the deletion hold is reversible, so nothing here may revoke anything.
 *
 * Runs as `fabrika_app` (NOBYPASSRLS), the production role; fixtures are
 * written through the owner connection. Every row is removed by the ids this
 * file created.
 */

const env = vi.hoisted(() => {
  const admin = process.env.DATABASE_URL;
  const rls = process.env.DATABASE_URL_RLS_TEST;
  if (rls) process.env.DATABASE_URL = rls;
  return { admin, rls };
});

const notFoundMarker = vi.hoisted(() => new Error('NEXT_NOT_FOUND'));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundMarker;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

const SUITE = 'deleted-tenant-sessionless.live';
const RUN = `dts-${Date.now().toString(36)}`;

let admin: PrismaClient;
let rls: PrismaClient;
let ready = false;
const tenantIds: string[] = [];
const userIds: string[] = [];

let lib: {
  db: typeof import('../src/lib/db');
  scope: typeof import('../src/lib/system-scope');
  token: typeof import('../src/lib/secret-token');
  opportunities: typeof import('../src/app/api/v1/opportunities/route');
  m11: typeof import('../src/modules/m11/server/actions');
  portal: typeof import('../src/app/[locale]/portal/partner/[token]/page');
  credits: typeof import('../src/lib/jobs/tasks/credits-monthly-grant');
  alerts: typeof import('../src/lib/jobs/tasks/alerts-daily');
  m4: typeof import('../src/lib/jobs/tasks/m4-weekly-summary');
};

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(env.rls, SUITE);
  if (!env.admin) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !env.admin) return;
  lib = {
    db: await import('../src/lib/db'),
    scope: await import('../src/lib/system-scope'),
    token: await import('../src/lib/secret-token'),
    opportunities: await import('../src/app/api/v1/opportunities/route'),
    m11: await import('../src/modules/m11/server/actions'),
    portal: await import('../src/app/[locale]/portal/partner/[token]/page'),
    credits: await import('../src/lib/jobs/tasks/credits-monthly-grant'),
    alerts: await import('../src/lib/jobs/tasks/alerts-daily'),
    m4: await import('../src/lib/jobs/tasks/m4-weekly-summary'),
  };
  admin = lib.db.createDbClient(env.admin);
  rls = lib.db.prisma;
  // The singleton is what the code under test uses; it must be the RLS subject.
  await assertRlsSubjectRole(rls, SUITE);
  ready = true;
});

afterAll(async () => {
  if (!admin) return;
  await admin.savedSearch.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
  await admin.relationship.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
  await admin.apiKey.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
  await admin.applicationPart.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
  await admin.opportunity.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
  await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
  await admin.user.deleteMany({ where: { id: { in: presentIds(userIds) } } });
  await admin.$disconnect();
});

beforeEach((ctx) => {
  if (!ready) ctx.skip();
});

async function makeTenant(tag: string): Promise<string> {
  const t = await admin.tenant.create({
    data: { name: `${RUN} ${tag}`, slug: `${RUN}-${tag}`, country: 'TR' },
    select: { id: true },
  });
  tenantIds.push(t.id);
  return t.id;
}

async function makeOpportunity(tenantId: string, title: string): Promise<string> {
  const ws = await admin.workspace.create({ data: { tenantId, name: 'w', slug: `${RUN}-ws-${tenantIds.length}` } });
  const opp = await admin.opportunity.create({ data: { tenantId, workspaceId: ws.id, title } });
  return opp.id;
}

const softDelete = (id: string, at: Date | null) => admin.tenant.update({ where: { id }, data: { deletedAt: at } });

describe('Partner REST API key (authenticateApiKey)', () => {
  test('a soft-deleted tenant’s key is 401 and leaves no trace; restoring the tenant restores the key', async () => {
    const tenantId = await makeTenant('api');
    await makeOpportunity(tenantId, `${RUN} secret opp`);
    const raw = `fp_live_${RUN}_${crypto.randomBytes(8).toString('hex')}`;
    const key = await admin.apiKey.create({
      data: {
        tenantId,
        name: 'k',
        prefix: raw.slice(0, 12),
        keyHash: crypto.createHash('sha256').update(raw).digest('hex'),
      },
    });
    const get = () =>
      lib.opportunities.GET(new Request('http://localhost/api/v1/opportunities', { headers: { 'x-api-key': raw } }));

    const live = await get();
    expect(live.status).toBe(200);
    expect(JSON.stringify(await live.json())).toContain(`${RUN} secret opp`);

    await softDelete(tenantId, new Date());
    const before = await admin.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    const denied = await get();
    expect(denied.status).toBe(401);
    const body = await denied.json();
    expect(body.code).toBe('AUTH_INVALID_API_KEY');
    expect(JSON.stringify(body)).not.toContain('secret opp');
    // Neither counted against the limit nor stamped as used.
    const after = await admin.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(after.rateWindowCount).toBe(before.rateWindowCount);
    expect(after.lastUsedAt?.getTime()).toBe(before.lastUsedAt?.getTime());

    // A deletion scheduled for later still counts as deleted: "set" means deleted.
    await softDelete(tenantId, new Date(Date.now() + 86_400_000));
    expect((await get()).status).toBe(401);

    await softDelete(tenantId, null);
    const back = await get();
    expect(back.status).toBe(200);
    expect(JSON.stringify(await back.json())).toContain(`${RUN} secret opp`);
  });
});

describe('Partner portal magic link', () => {
  async function portalFixture(tag: string) {
    const tenantId = await makeTenant(tag);
    const oppId = await makeOpportunity(tenantId, `${RUN} portal opp ${tag}`);
    const raw = lib.token.generateSecretToken();
    const part = await admin.applicationPart.create({
      data: { tenantId, opportunityId: oppId, part: 'PART_A', content: {}, magicTokenHash: lib.token.hashSecretToken(raw) },
    });
    const budgetLines = async () => {
      const row = await admin.applicationPart.findUniqueOrThrow({ where: { id: part.id }, select: { content: true } });
      return ((row.content as { budget?: unknown[] } | null)?.budget ?? []).length;
    };
    return { tenantId, raw, budgetLines };
  }

  test('a write through a soft-deleted tenant’s link is refused and writes nothing; restored, it writes', async () => {
    const { tenantId, raw, budgetLines } = await portalFixture('write');

    await softDelete(tenantId, new Date());
    expect(await lib.m11.addBudgetLineByToken(raw, 'ACME', 2)).toEqual({ success: false });
    expect(await budgetLines()).toBe(0);

    await softDelete(tenantId, null);
    const ok = await lib.m11.addBudgetLineByToken(raw, 'ACME', 2);
    expect(ok.success).toBe(true);
    expect(await budgetLines()).toBe(1);
  });

  test('the page and its metadata do not open a soft-deleted tenant’s part; restored, they do', async () => {
    const { tenantId, raw } = await portalFixture('read');
    const params = Promise.resolve({ token: raw, locale: 'en' });
    const title = async () => String((await lib.portal.generateMetadata({ params })).title);

    expect(await title()).toContain(`${RUN} portal opp read`);
    await expect(lib.portal.default({ params })).resolves.toBeTruthy();

    await softDelete(tenantId, new Date());
    await expect(lib.portal.default({ params })).rejects.toBe(notFoundMarker);
    expect(await title()).not.toContain(`${RUN} portal opp read`);

    await softDelete(tenantId, null);
    await expect(lib.portal.default({ params })).resolves.toBeTruthy();
    expect(await title()).toContain(`${RUN} portal opp read`);
  });
});

describe('cron fan-outs leave a soft-deleted tenant out', () => {
  test('credits-monthly-grant: GRANTABLE_TENANTS_QUERY skips it, and picks it up once restored', async () => {
    const live = await makeTenant('cr-live');
    const gone = await makeTenant('cr-gone');
    await softDelete(gone, new Date());
    const q = lib.credits.GRANTABLE_TENANTS_QUERY;
    const pick = async () =>
      (await rls.tenant.findMany({ ...q, where: { ...q.where, id: { in: [live, gone] } } })).map((t) => t.id);

    expect(await pick()).toEqual([live]);
    await softDelete(gone, null);
    expect((await pick()).sort()).toEqual([live, gone].sort());
  });

  test('alerts-daily and m4-weekly: a soft-deleted tenant’s rows are not handed on; restored, they are', async () => {
    const live = await makeTenant('fo-live');
    const gone = await makeTenant('fo-gone');
    const user = await admin.user.create({ data: { email: `${RUN}-fo@example.com` }, select: { id: true } });
    userIds.push(user.id);
    const due = new Date(Date.now() + 86_400_000);
    for (const tenantId of [live, gone]) {
      await admin.savedSearch.create({ data: { tenantId, userId: user.id, name: RUN, filters: {}, notify: true } });
      await admin.relationship.create({ data: { tenantId, kind: 'partner', counterpartName: RUN, nextStepDue: due } });
    }
    await softDelete(gone, new Date());

    const tenantsSeen = async () => {
      const searches = await lib.scope.withSystemScopeOn(rls, 'cross-tenant-job', 'alerts-daily.enabledSearches', (tx) =>
        lib.alerts.alertEnabledSearches(tx)
      );
      const actions = await lib.scope.withSystemScopeOn(rls, 'cross-tenant-job', 'm4-weekly.dueActions', (tx) =>
        lib.m4.dueRelationshipActions(tx, new Date(Date.now() + 7 * 86_400_000))
      );
      const mine = (rows: Array<{ tenantId: string }>) =>
        [...new Set(rows.map((r) => r.tenantId).filter((t) => t === live || t === gone))].sort();
      return { searches: mine(searches), actions: mine(actions) };
    };

    expect(await tenantsSeen()).toEqual({ searches: [live], actions: [live] });
    await softDelete(gone, null);
    expect(await tenantsSeen()).toEqual({ searches: [live, gone].sort(), actions: [live, gone].sort() });
  });
});
