import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { NG_GATE_CODES, ngFeatureGate } from '@/lib/billing/nexagrant/gate';
import { settleNgTrial } from '@/lib/billing/nexagrant/repository';
import {
  assertNgAiQuota,
  assertNgSeatAvailable,
  istanbulMonthStart,
  NgPlanLimitError,
  readNgUsage,
} from '@/lib/billing/nexagrant/usage';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * NG-250 — the NexaGrant plan gate, counters and status guard against the real database.
 *
 * What a pure test cannot show:
 *   - the CHECK on "NgSubscription" refuses a TRIALING row without its end facts (U3);
 *   - the gate reads ModuleState and the plan over `fabrika_app` under tenant_isolation;
 *   - the AI quota counts this Istanbul month's AiUsageLog rows of the tenant, and refuses at
 *     the limit; a tenant without a NexaGrant row is not counted at all (K-584603 = A);
 *   - the seat counter counts members + pending invitations, and refuses at the NexaGrant seat
 *     limit only with the enforcement flag on.
 *
 * Functions under test run over the RLS-subject role; fixtures go over the owner connection.
 */

const SUITE = 'ng250-plan-gate.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng250-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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
  trial: `${RUN}-trial`,
  ended: `${RUN}-ended`,
  bare: `${RUN}-bare`,
  m1off: `${RUN}-m1off`,
  active: `${RUN}-active`,
  emb: `${RUN}-emb`,
};
const NOW = new Date('2026-11-19T09:00:00Z');
const OWNER = (tenantId: string) => ({ tenantId, role: 'TENANT_OWNER' as const });
const asTenant = <R>(tenantId: string, cb: Parameters<typeof withTenantOn<R>>[2]) => withTenantOn(rls!, tenantId, cb);

const trialRow = (tenantId: string, endsAt: Date) => ({
  tenantId,
  planId: 'ng-pro',
  status: 'TRIALING' as const,
  provider: 'ng-trial',
  trialSegment: 'default',
  trialStartedAt: new Date('2026-11-10T09:00:00Z'),
  trialEndsAt: endsAt,
  trialEndPlanId: 'ng-free',
});

const aiRows = (tenantId: string, n: number, at: Date) =>
  Array.from({ length: n }, () => ({
    tenantId,
    module: 'M2',
    purpose: 'concept-note',
    provider: 'anthropic',
    model: 'test',
    promptHash: 'h',
    inputTokens: 1,
    outputTokens: 1,
    credits: 1,
    createdAt: at,
  }));

// The row embedText (src/lib/llm.ts) writes for a tenant's RAG ingest chunk or search query:
// provider openai, an embedding model, no output tokens, no credits.
const embeddingRows = (tenantId: string, n: number, at: Date, model: string, purpose: string) =>
  Array.from({ length: n }, () => ({
    tenantId,
    module: 'K6',
    purpose,
    provider: 'openai',
    model,
    promptHash: 'h',
    inputTokens: 100,
    outputTokens: 0,
    credits: 0,
    createdAt: at,
  }));

describe.skipIf(!reachable)('NG-250 plan gate, counters and status guard (live)', () => {
  beforeAll(async () => {
    await admin!.tenant.createMany({
      data: Object.values(T).map((id) => ({ id, name: id, slug: id, country: 'TR', orgType: 'SME' })),
    });
    await admin!.ngSubscription.createMany({
      data: [
        trialRow(T.trial, new Date('2026-11-24T21:00:00Z')),
        trialRow(T.ended, new Date('2026-11-18T21:00:00Z')),
        trialRow(T.m1off, new Date('2026-11-24T21:00:00Z')),
        { ...trialRow(T.active, new Date('2026-11-01T21:00:00Z')), status: 'ACTIVE' as const },
        trialRow(T.emb, new Date('2026-11-24T21:00:00Z')),
      ],
    });
    await admin!.moduleState.createMany({
      data: [
        { tenantId: T.trial, moduleId: 'M1', status: 'ON' },
        { tenantId: T.ended, moduleId: 'M1', status: 'ON' },
        { tenantId: T.m1off, moduleId: 'M1', status: 'OFF' },
      ],
    });
  });

  afterAll(async () => {
    if (presentIds(Object.values(T)).length) {
      await admin!.aiUsageLog.deleteMany({ where: { tenantId: { in: presentIds(Object.values(T)) } } });
      await admin!.invitation.deleteMany({ where: { tenantId: { in: presentIds(Object.values(T)) } } });
      await admin!.moduleState.deleteMany({ where: { tenantId: { in: presentIds(Object.values(T)) } } });
      await admin!.ngSubscription.deleteMany({ where: { tenantId: { in: presentIds(Object.values(T)) } } });
      await admin!.tenant.deleteMany({ where: { id: { in: presentIds(Object.values(T)) } } });
    }
    await admin?.$disconnect();
    await rls?.$disconnect();
  });

  it('U3 CHECK: a TRIALING row without trialEndsAt or trialEndPlanId is refused by the database', async () => {
    const bad = `${RUN}-bad`;
    await admin!.tenant.create({ data: { id: bad, name: bad, slug: bad, country: 'TR', orgType: 'SME' } });
    try {
      await expect(
        admin!.$executeRaw`INSERT INTO "NgSubscription" ("tenantId","planId",status,provider,"updatedAt")
          VALUES (${bad}, 'ng-pro', 'TRIALING', 'ng-trial', now())`
      ).rejects.toThrow(/NgSubscription_trialing_has_end_check|23514/);
      await expect(
        admin!.$executeRaw`INSERT INTO "NgSubscription" ("tenantId","planId",status,provider,"trialEndsAt","updatedAt")
          VALUES (${bad}, 'ng-pro', 'TRIALING', 'ng-trial', now(), now())`
      ).rejects.toThrow(/NgSubscription_trialing_has_end_check|23514/);
      // ACTIVE without trial facts is fine (a paid or manual row).
      await admin!.$executeRaw`INSERT INTO "NgSubscription" ("tenantId","planId",status,provider,"updatedAt")
        VALUES (${bad}, 'ng-pro', 'ACTIVE', 'manual', now())`;
    } finally {
      await admin!.ngSubscription.deleteMany({ where: { tenantId: `${RUN}-bad` } });
      await admin!.tenant.deleteMany({ where: { id: `${RUN}-bad` } });
    }
  });

  it('gate: running trial → open; ended trial → NG_FEATURE_NOT_IN_PLAN; no row → open, not enrolled', async () => {
    expect(await asTenant(T.trial, (tx) => ngFeatureGate(tx, OWNER(T.trial), 'search_calls', 'call_search', NOW))).toEqual({
      allowed: true,
      enrolled: true,
    });
    expect(await asTenant(T.ended, (tx) => ngFeatureGate(tx, OWNER(T.ended), 'search_calls', 'call_search', NOW))).toEqual({
      allowed: false,
      code: NG_GATE_CODES.notInPlan,
      feature: 'call_search',
    });
    expect(await asTenant(T.bare, (tx) => ngFeatureGate(tx, OWNER(T.bare), 'search_calls', 'call_search', NOW))).toEqual({
      allowed: true,
      enrolled: false,
    });
  });

  it('gate (U5): M1 OFF closes partner search on a plan that grants it; M1 ON opens it', async () => {
    expect(
      await asTenant(T.m1off, (tx) => ngFeatureGate(tx, OWNER(T.m1off), 'view_partner_search', 'partner_search', NOW))
    ).toEqual({ allowed: false, code: NG_GATE_CODES.moduleClosed, feature: 'partner_search' });
    expect(
      await asTenant(T.trial, (tx) => ngFeatureGate(tx, OWNER(T.trial), 'view_partner_search', 'partner_search', NOW))
    ).toEqual({ allowed: true, enrolled: true });
  });

  it('AI quota: this month counts, last month does not; refused at the limit with NG_PLAN_LIMIT_REACHED', async () => {
    const monthStart = istanbulMonthStart(NOW);
    await admin!.aiUsageLog.createMany({ data: aiRows(T.trial, 5, new Date(monthStart.getTime() - 1)) });
    await admin!.aiUsageLog.createMany({ data: aiRows(T.trial, 49, monthStart) });
    const usage = await asTenant(T.trial, (tx) => readNgUsage(tx, T.trial, NOW));
    expect(usage).toMatchObject({ aiWritingMonthly: { used: 49, limit: 50 } });
    await expect(asTenant(T.trial, (tx) => assertNgAiQuota(tx, T.trial, NOW))).resolves.toBeUndefined();

    await admin!.aiUsageLog.createMany({ data: aiRows(T.trial, 1, NOW) });
    const refused = await asTenant(T.trial, (tx) => assertNgAiQuota(tx, T.trial, NOW)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(NgPlanLimitError);
    expect((refused as NgPlanLimitError).code).toBe('NG_PLAN_LIMIT_REACHED');
    expect((refused as NgPlanLimitError).feature).toBe('ai_writing_monthly');
  });

  it('B2 (review P1): embedding rows are not AI writing — 10 writings + 40 embedding rows → used 10, not refused', async () => {
    // K-584612 = A: ai_writing_monthly counts text generation (generateCompletion) only. One
    // 40-chunk document upload must not spend 40 of the month's writings.
    await admin!.aiUsageLog.createMany({ data: aiRows(T.emb, 10, NOW) });
    await admin!.aiUsageLog.createMany({ data: embeddingRows(T.emb, 38, NOW, 'text-embedding-3-large', 'rag_ingest_embedding') });
    await admin!.aiUsageLog.createMany({ data: embeddingRows(T.emb, 2, NOW, 'text-embedding-3-small', 'rag_search_embedding') });
    const usage = await asTenant(T.emb, (tx) => readNgUsage(tx, T.emb, NOW));
    // The plan screen reads this counter (usage.aiWritingMonthly.used): the same number.
    expect(usage?.aiWritingMonthly).toMatchObject({ used: 10, limit: 50 });
    await expect(asTenant(T.emb, (tx) => assertNgAiQuota(tx, T.emb, NOW))).resolves.toBeUndefined();

    // Still refused at the limit: 40 more writings → 50/50, embeddings still not counted.
    await admin!.aiUsageLog.createMany({ data: aiRows(T.emb, 40, NOW) });
    const refused = await asTenant(T.emb, (tx) => assertNgAiQuota(tx, T.emb, NOW)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(NgPlanLimitError);
    expect((refused as NgPlanLimitError).used).toBe(50);
  });

  it('AI quota: after the trial (ng-free grants no AI) the first call is refused; no row → not counted', async () => {
    const refused = await asTenant(T.ended, (tx) => assertNgAiQuota(tx, T.ended, NOW)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(NgPlanLimitError);
    await admin!.aiUsageLog.createMany({ data: aiRows(T.bare, 400, NOW) });
    await expect(asTenant(T.bare, (tx) => assertNgAiQuota(tx, T.bare, NOW))).resolves.toBeUndefined();
    expect(await asTenant(T.bare, (tx) => readNgUsage(tx, T.bare, NOW))).toBeNull();
  });

  it('seats: members + pending invitations are counted; refused at the limit only with the flag on', async () => {
    const future = new Date(NOW.getTime() + 7 * 86_400_000);
    await admin!.invitation.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        tenantId: T.trial,
        email: `${RUN}-${i}@example.test`,
        tokenHash: `${RUN}-tok-${i}`,
        expires: future,
      })),
    });
    // An expired and an accepted invitation take no seat.
    await admin!.invitation.createMany({
      data: [
        { tenantId: T.trial, email: `${RUN}-x@example.test`, tokenHash: `${RUN}-tok-x`, expires: new Date(NOW.getTime() - 1000) },
        { tenantId: T.trial, email: `${RUN}-y@example.test`, tokenHash: `${RUN}-tok-y`, expires: future, acceptedAt: new Date() },
      ],
    });
    const usage = await asTenant(T.trial, (tx) => readNgUsage(tx, T.trial, NOW));
    expect(usage?.seats).toEqual({ used: 5, limit: 5 });

    const on = { NG_SEAT_LIMIT_ENFORCED: 'true' };
    const refused = await asTenant(T.trial, (tx) => assertNgSeatAvailable(tx, T.trial, 'new@example.test', NOW, on)).catch(
      (e: unknown) => e
    );
    expect(refused).toBeInstanceOf(NgPlanLimitError);
    expect((refused as NgPlanLimitError).feature).toBe('seats');
    // Re-inviting a pending address takes no new seat.
    await expect(
      asTenant(T.trial, (tx) => assertNgSeatAvailable(tx, T.trial, `${RUN}-0@example.test`, NOW, on))
    ).resolves.toBeUndefined();
    // Flag off (the default until the seat count is approved): counted, not enforced.
    await expect(
      asTenant(T.trial, (tx) => assertNgSeatAvailable(tx, T.trial, 'new@example.test', NOW, {}))
    ).resolves.toBeUndefined();
  });

  it('Ö3: an ACTIVE row with trialEndedAt null is not settled (status guard in the settle where)', async () => {
    expect(await asTenant(T.active, (tx) => settleNgTrial(tx, T.active, NOW))).toBe(false);
    const row = await admin!.ngSubscription.findUnique({ where: { tenantId: T.active } });
    expect(row).toMatchObject({ planId: 'ng-pro', status: 'ACTIVE', trialEndedAt: null });
  });
});
