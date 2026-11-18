import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { canUseNgFeature } from '@/lib/billing/nexagrant/authz';
import { featureLimit } from '@/lib/billing/nexagrant/entitlement';
import { readNgBillingState, readNgCatalog, startNgTrial } from '@/lib/billing/nexagrant/repository';
import { trialEndsAt } from '@/lib/billing/nexagrant/trial';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * NG-57 — the NexaGrant plan catalogue, trial and `can()` against the real database.
 *
 * What a pure test cannot show:
 *   - the seeded catalogue is readable as `fabrika_app` and not writable by it;
 *   - registration's trial row is written under `tenant_isolation`, with 14 days for a
 *     company and 30 for a municipality, and only once;
 *   - at the end instant the tenant's plan drops to Ücretsiz Kontrol, the drop is
 *     persisted, and `can()` then refuses a feature outside that plan;
 *   - one tenant cannot read or write another's subscription row.
 *
 * Every function under test runs over the RLS-subject role; fixtures and checks of
 * what was persisted go over the owner connection.
 */

const SUITE = 'ng57-plan-entitlement.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng57-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;
const rls: PrismaClient | undefined = rlsUrl ? createDbClient(rlsUrl) : undefined;

const reachable =
  admin !== undefined &&
  rls !== undefined &&
  (await Promise.all([admin.$queryRaw`SELECT 1`, rls.$queryRaw`SELECT 1`])
    .then(() => true)
    .catch(() => false));
if (!reachable) skipOrFailInCi(SUITE, 'Postgres or the RLS-subject role is unreachable');
else await assertRlsSubjectRole(rls!, SUITE);

const T = {
  sme: `${RUN}-sme`,
  muni: `${RUN}-muni`,
  bare: `${RUN}-bare`,
};
// 18.11.2026 13:00 Istanbul.
const START = new Date('2026-11-18T10:00:00Z');

const asTenant = <R>(tenantId: string, cb: Parameters<typeof withTenantOn<R>>[2]) =>
  withTenantOn(rls!, tenantId, cb);

interface PersistedRow {
  planId: string;
  status: string;
  provider: string;
  trialSegment: string | null;
  trialEndsAt: Date | null;
  trialEndedAt: Date | null;
}
const persisted = async (tenantId: string): Promise<PersistedRow[]> =>
  admin!.$queryRaw<PersistedRow[]>`
    SELECT "planId", status::text AS status, provider, "trialSegment", "trialEndsAt", "trialEndedAt"
    FROM "NgSubscription" WHERE "tenantId" = ${tenantId}`;

describe.skipIf(!reachable)('NG-57 plan catalogue, trial and can() (live)', () => {
  beforeAll(async () => {
    await admin!.tenant.createMany({
      data: [
        { id: T.sme, name: T.sme, slug: T.sme, country: 'TR', orgType: 'SME' },
        { id: T.muni, name: T.muni, slug: T.muni, country: 'TR', orgType: 'MUNICIPALITY' },
        { id: T.bare, name: T.bare, slug: T.bare, country: 'TR', orgType: 'SME' },
      ],
    });
  });

  afterAll(async () => {
    const ids = presentIds(Object.values(T));
    const table = await admin!.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('"NgSubscription"')::text AS t`;
    if (table[0]?.t && ids.length > 0) {
      await admin!.$executeRaw`DELETE FROM "NgSubscription" WHERE "tenantId" = ANY(${ids})`;
    }
    await admin!.tenant.deleteMany({ where: { id: { in: ids } } });
    await Promise.all([admin?.$disconnect(), rls?.$disconnect()]);
  });

  it('the seeded catalogue is readable as fabrika_app, with no tenant set', async () => {
    const c = await readNgCatalog(rls!);
    expect(c.plans.map((p) => p.id)).toEqual(['ng-free', 'ng-basic', 'ng-pro', 'ng-enterprise']);
    expect(c.trialPolicies.map((p) => [p.segment, p.days]).sort()).toEqual([
      ['default', 14],
      ['municipality', 30],
    ]);
    expect(c.prices.every((p) => p.amountMinor === null)).toBe(true);
  });

  it('fabrika_app cannot write the catalogue', async () => {
    await expect(
      rls!.$executeRawUnsafe(`INSERT INTO "NgPlan"(id, tier, "sortOrder") VALUES ('${RUN}-x', 'x', 99)`)
    ).rejects.toThrow();
    await expect(rls!.$executeRawUnsafe(`UPDATE "NgPlanPrice" SET "amountMinor" = 1`)).rejects.toThrow();
    await expect(rls!.$executeRawUnsafe(`UPDATE "NgTrialPolicy" SET days = 365`)).rejects.toThrow();
  });

  it('a company gets 14 days of Profesyonel, written once', async () => {
    const first = await asTenant(T.sme, (tx) => startNgTrial(tx, { tenantId: T.sme, orgType: 'SME', now: START }));
    expect(first.kind).toBe('started');
    const again = await asTenant(T.sme, (tx) =>
      startNgTrial(tx, { tenantId: T.sme, orgType: 'SME', now: new Date(START.getTime() + 60_000) })
    );
    expect(again.kind).toBe('exists');

    const rows = await persisted(T.sme);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ planId: 'ng-pro', status: 'TRIALING', provider: 'ng-trial', trialSegment: 'default' });
    expect(rows[0]!.trialEndsAt?.toISOString()).toBe(trialEndsAt(START, 14).toISOString());
  });

  it('a municipality gets 30 days', async () => {
    const r = await asTenant(T.muni, (tx) =>
      startNgTrial(tx, { tenantId: T.muni, orgType: 'MUNICIPALITY', now: START })
    );
    expect(r.kind).toBe('started');
    const [row] = await persisted(T.muni);
    expect(row).toMatchObject({ planId: 'ng-pro', trialSegment: 'municipality' });
    expect(row!.trialEndsAt?.toISOString()).toBe('2026-12-17T21:00:00.000Z');
  });

  it('during the trial can() allows a Profesyonel feature', async () => {
    const at = new Date(trialEndsAt(START, 14).getTime() - 1);
    const state = await asTenant(T.sme, (tx) => readNgBillingState(tx, T.sme, at));
    expect(state.plan.id).toBe('ng-pro');
    expect(state.trial.kind).toBe('running');
    const ok = await asTenant(T.sme, (tx) =>
      canUseNgFeature(tx, { tenantId: T.sme, role: 'TENANT_OWNER' }, 'view_partner_search', 'partner_search', at)
    );
    expect(ok).toBe(true);
  });

  it('at the end instant the plan drops to Ücretsiz Kontrol, persisted, and can() refuses a feature outside it', async () => {
    const end = trialEndsAt(START, 14);
    const state = await asTenant(T.sme, (tx) => readNgBillingState(tx, T.sme, end));
    expect(state.plan.id).toBe('ng-free');
    expect(state.trial.kind).toBe('ended');

    const [row] = await persisted(T.sme);
    expect(row).toMatchObject({ planId: 'ng-free', status: 'ACTIVE' });
    expect(row!.trialEndedAt?.toISOString()).toBe(end.toISOString());

    const later = new Date(end.getTime() + 86_400_000);
    const partner = await asTenant(T.sme, (tx) =>
      canUseNgFeature(tx, { tenantId: T.sme, role: 'TENANT_OWNER' }, 'view_partner_search', 'partner_search', later)
    );
    expect(partner).toBe(false);
    const profile = await asTenant(T.sme, (tx) =>
      canUseNgFeature(tx, { tenantId: T.sme, role: 'TENANT_OWNER' }, 'view_proposal', 'org_profile', later)
    );
    expect(profile).toBe(true);
    // The municipality's trial is untouched by the company's drop.
    expect((await persisted(T.muni))[0]).toMatchObject({ planId: 'ng-pro', status: 'TRIALING' });
  });

  it('a tenant with no NexaGrant row is on Ücretsiz Kontrol: 3 eligibility checks, no call search', async () => {
    const state = await asTenant(T.bare, (tx) => readNgBillingState(tx, T.bare, START));
    expect(state.source).toBe('fallback');
    expect(state.plan.id).toBe('ng-free');
    expect(featureLimit(state.entitlement, 'eligibility_check')).toEqual({ granted: true, limit: 3 });
    expect(featureLimit(state.entitlement, 'call_search')).toEqual({ granted: false });
    expect(await persisted(T.bare)).toHaveLength(0);
  });

  it("one tenant neither reads nor writes another's subscription row (tenant_isolation)", async () => {
    const seen = await asTenant(T.bare, (tx) =>
      tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "NgSubscription" WHERE "tenantId" = ${T.sme}`
    );
    expect(seen[0]?.n).toBe(0);
    await expect(
      asTenant(T.bare, (tx) =>
        tx.$executeRaw`INSERT INTO "NgSubscription"("tenantId", "planId", status, provider, "updatedAt")
                       VALUES (${T.muni}, 'ng-enterprise', 'ACTIVE', 'manual', now())`
      )
    ).rejects.toThrow();
  });
});
