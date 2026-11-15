import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * NG-136 (M18-F5) — the two M18 AI actions on a real database, through the REAL `src/lib/llm.ts`:
 *
 *  - enrichment (M18:enrich-organization) reserves its catalogue price under the tenant credit lock
 *    BEFORE the model call (one `usage:M18` row), the model call itself is logged as the free
 *    `enrich-organization-attempt`; a site that cannot be read reaches no model and costs nothing;
 *  - an answer that is no use (bad JSON, empty pre-report) or a report that cannot be saved gives the
 *    reservation back (`refund:M18`, same refId) — the M17 pattern (K-582507 = A);
 *  - the eligibility pre-report (M18:eligibility-pre-report) does the same, is saved as a DRAFT under
 *    RLS, is invisible to another tenant, and is releasable (the deal brief contract) only once
 *    APPROVED.
 *
 * PATRON KURALI (15.11.2026): no AI provider is called. Only `fetch` is replaced — the Anthropic
 * endpoint answers from this file — and the site reader is a stub. `.live`: needs `pnpm db:setup`
 * (seeded catalogue) and `pnpm db:rls-role`; run it through `pnpm gate:isolated`.
 */

const SUITE = 'm18-ai.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng136-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  replies: [] as string[],
  requests: 0,
}));

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop) => (prop === 'ANTHROPIC_API_KEY' ? 'test-key' : Reflect.get(target, prop)),
    }),
  };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) => actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient, withTenant } = await import('@/lib/db');
const { aiCreditEntry } = await import('@/lib/billing/catalog');
const enrichment = await import('@/modules/m18/server/enrichment');
const eligibility = await import('@/modules/m18/server/eligibility');
const { createDealBriefContextPort } = await import('@/modules/m18/server/deal-brief-context');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];
const calls: string[] = [];

function stubProvider() {
  state.requests = 0;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.startsWith('https://api.anthropic.com/')) throw new Error(`unexpected request to ${url}`);
    state.requests += 1;
    const text = state.replies.shift() ?? '{}';
    return new Response(
      JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 800, output_tokens: 300 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
}

async function makeTenant(key: string, grant: number) {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(t.id);
  await admin!.creditLedger.create({ data: { tenantId: t.id, delta: grant, reason: 'purchase' } });
  const u = await admin!.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  users.push(u.id);
  await admin!.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
  const org = await admin!.leadOrganization.create({
    data: { tenantId: t.id, name: `Acme ${key}`, provinceCode: '06', website: 'https://acme.example.com.tr' },
    select: { id: true },
  });
  return { tenantId: t.id, userId: u.id, organizationId: org.id };
}

async function balance(tenantId: string): Promise<number> {
  const r = await admin!.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

/** The tenant's ledger without the opening purchase, oldest first. */
async function moves(tenantId: string) {
  return admin!.creditLedger.findMany({
    where: { tenantId, reason: { not: 'purchase' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { reason: true, delta: true, refId: true },
  });
}

/** Exactly one `usage:M18` debit of `price` and one `refund:M18` credit of the same refId. */
function expectRefundedPair(rows: { reason: string; delta: number; refId: string | null }[], price: number) {
  expect(rows.map((r) => [r.reason, r.delta])).toEqual([
    ['usage:M18', -price],
    ['refund:M18', price],
  ]);
  expect(rows[0]!.refId).toBeTruthy();
  expect(rows[1]!.refId).toBe(rows[0]!.refId);
}

async function makeCall(key: string, data: { eligibleApplicantTypes?: string[] } = {}) {
  const programme = await admin!.programme.findFirst({ select: { id: true } });
  expect(programme, 'seeded Programme').toBeTruthy();
  const call = await admin!.call.create({
    data: { programmeId: programme!.id, callIdentifier: `${RUN}-${key}`, title: `Call ${key}`, ...data },
    select: { id: true },
  });
  calls.push(call.id);
  return call.id;
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);
  ready = true;
});

afterAll(async () => {
  if (admin) {
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } }).catch(() => {});
    await admin.call.deleteMany({ where: { id: { in: presentIds(calls) } } }).catch(() => {});
  }
  vi.unstubAllGlobals();
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('M18 AI actions through the real llm.ts (NG-136)', () => {
  beforeAll(() => {
    if (!ready) skipOrFailInCi(SUITE, skipReason || 'live database not ready');
  });

  test('enrichment: one AiUsageLog row, the catalogue price debited, nothing written to the record', async () => {
    if (!ready) return;
    const price = aiCreditEntry('M18', 'enrich-organization')!.credits;
    const owner = await makeTenant('enrich', 10);
    stubProvider();
    state.replies = ['{"legalName":"Acme Teknoloji A.Ş.","district":"Çankaya","sizeBand":"SMALL","themes":["IoT"],"sectorCodes":["C26.1"],"sources":["https://acme.example.com.tr/"]}'];

    const org = await withTenant(owner.tenantId, (tx) => enrichment.loadEnrichmentSubject(tx, owner.tenantId, owner.organizationId));
    const res = await enrichment.proposeEnrichment(
      { tenantId: owner.tenantId, userId: owner.userId, org: org!, locale: 'tr' },
      { fetchSite: async () => ({ ok: true, pages: [{ url: 'https://acme.example.com.tr/', text: 'Acme Teknoloji A.Ş., Çankaya' }], skipped: [] }) },
    );

    expect(res.ok).toBe(true);
    expect(state.requests).toBe(1);
    expect(await balance(owner.tenantId)).toBe(10 - price);
    const logs = await admin!.aiUsageLog.findMany({ where: { tenantId: owner.tenantId }, select: { module: true, purpose: true, credits: true, userId: true } });
    // The model call is the free attempt; the price is the one reservation, kept on success.
    expect(logs).toEqual([{ module: 'M18', purpose: 'enrich-organization-attempt', credits: 0, userId: owner.userId }]);
    const ledger = await moves(owner.tenantId);
    expect(ledger.map((r) => [r.reason, r.delta])).toEqual([['usage:M18', -price]]);
    expect(res.ok && res.credits).toBe(price);
    // A proposal, not a write.
    const row = await admin!.leadOrganization.findUnique({ where: { id: owner.organizationId }, select: { legalName: true } });
    expect(row?.legalName).toBeNull();

    // The user ticks one field: only that one is written.
    const applied = await withTenant(owner.tenantId, (tx) =>
      enrichment.applyEnrichment(tx, owner.tenantId, { organizationId: owner.organizationId, district: 'Çankaya' }),
    );
    expect(applied).toBe(true);
    const after = await admin!.leadOrganization.findUnique({ where: { id: owner.organizationId }, select: { legalName: true, district: true } });
    expect(after).toEqual({ legalName: null, district: 'Çankaya' });
  }, 30_000);

  test('enrichment: a site that cannot be read reaches no model and costs nothing', async () => {
    if (!ready) return;
    const owner = await makeTenant('enrich-blocked', 10);
    stubProvider();
    const org = await withTenant(owner.tenantId, (tx) => enrichment.loadEnrichmentSubject(tx, owner.tenantId, owner.organizationId));
    const res = await enrichment.proposeEnrichment(
      { tenantId: owner.tenantId, userId: owner.userId, org: org!, locale: 'tr' },
      { fetchSite: async () => ({ ok: false, reason: 'robots_disallow' }) },
    );
    expect(res).toEqual({ ok: false, code: 'SITE_UNAVAILABLE', reason: 'robots_disallow' });
    expect(state.requests).toBe(0);
    expect(await balance(owner.tenantId)).toBe(10);
    expect(await admin!.aiUsageLog.count({ where: { tenantId: owner.tenantId } })).toBe(0);
  }, 30_000);

  test('eligibility: AiUsageLog + price, saved as DRAFT, invisible to another tenant, releasable only once APPROVED', async () => {
    if (!ready) return;
    const price = aiCreditEntry('M18', 'eligibility-pre-report')!.credits;
    const owner = await makeTenant('elig', 10);
    const other = await makeTenant('elig-other', 10);
    const programme = await admin!.programme.findFirst({ select: { id: true } });
    expect(programme, 'seeded Programme').toBeTruthy();
    const call = await admin!.call.create({
      data: { programmeId: programme!.id, callIdentifier: `${RUN}-CALL`, title: 'Digital SMEs', eligibleApplicantTypes: ['SME'], cofinancingRateBp: 5000 },
      select: { id: true },
    });
    calls.push(call.id);
    const deal = await admin!.deal.create({
      data: { tenantId: owner.tenantId, organizationId: owner.organizationId, callId: call.id, title: 'Digital SMEs application' },
      select: { id: true },
    });

    stubProvider();
    state.replies = ['### Özet\nBüyük olasılıkla uygun.\n\n### Kontrol edilen ölçütler\n- SME: karşılanıyor'];
    const subject = await withTenant(owner.tenantId, (tx) => eligibility.loadEligibilitySubject(tx, owner.tenantId, owner.organizationId, call.id));
    expect(subject).not.toBeNull();
    const saved = await eligibility.createEligibilityReport({ tenantId: owner.tenantId, userId: owner.userId, subject: subject!, locale: 'tr' });

    expect(state.requests).toBe(1);
    expect(await balance(owner.tenantId)).toBe(10 - price);
    const logs = await admin!.aiUsageLog.findMany({ where: { tenantId: owner.tenantId }, select: { module: true, purpose: true, credits: true } });
    expect(logs).toEqual([{ module: 'M18', purpose: 'eligibility-pre-report-attempt', credits: 0 }]);
    expect((await moves(owner.tenantId)).map((r) => [r.reason, r.delta])).toEqual([['usage:M18', -price]]);
    expect(saved.credits).toBe(price);

    const row = await admin!.leadEligibilityReport.findUnique({ where: { id: saved.id }, select: { status: true, tenantId: true } });
    expect(row).toEqual({ status: 'DRAFT', tenantId: owner.tenantId });

    // RLS: the other tenant sees nothing, and cannot approve it.
    const seen = await withTenant(other.tenantId, (tx) => tx.leadEligibilityReport.findMany({ where: { id: saved.id } }));
    expect(seen).toEqual([]);
    expect(await withTenant(other.tenantId, (tx) => eligibility.approveEligibilityReport(tx, other.tenantId, saved.id, other.userId))).toBe(false);

    // A DRAFT does not leave M18: the query itself filters it out (not only the port's approvedAt check).
    const releasable = () => withTenant(owner.tenantId, (tx) => eligibility.releasableReport(tx, owner.tenantId, owner.organizationId, call.id));
    expect(await releasable()).toBeNull();
    const port = createDealBriefContextPort();
    expect((await port.forDeal(owner.tenantId, deal.id))?.approvedEligibility).toBeNull();
    expect(await port.forDeal(other.tenantId, deal.id)).toBeNull();

    expect(await withTenant(owner.tenantId, (tx) => eligibility.approveEligibilityReport(tx, owner.tenantId, saved.id, owner.userId))).toBe(true);
    expect((await releasable())?.id).toBe(saved.id);
    const ctx = await port.forDeal(owner.tenantId, deal.id);
    expect(ctx?.approvedEligibility?.summary).toContain('Büyük olasılıkla uygun');
    expect(ctx?.call?.callIdentifier).toBe(`${RUN}-CALL`);
  }, 30_000);

  test('a tenant with fewer credits than the price is refused before the provider', async () => {
    if (!ready) return;
    const owner = await makeTenant('elig-poor', 1);
    stubProvider();
    const programme = await admin!.programme.findFirst({ select: { id: true } });
    const call = await admin!.call.create({
      data: { programmeId: programme!.id, callIdentifier: `${RUN}-CALL2`, title: 'Other' },
      select: { id: true },
    });
    calls.push(call.id);
    const subject = await withTenant(owner.tenantId, (tx) => eligibility.loadEligibilitySubject(tx, owner.tenantId, owner.organizationId, call.id));
    await expect(
      eligibility.createEligibilityReport({ tenantId: owner.tenantId, userId: owner.userId, subject: subject!, locale: 'en' }),
    ).rejects.toThrow(/Insufficient AI credits/);
    expect(state.requests).toBe(0);
    expect(await balance(owner.tenantId)).toBe(1);
    expect(await moves(owner.tenantId)).toEqual([]);
  }, 30_000);

  test('enrichment: a malformed JSON answer gives the reservation back (usage:M18 + refund:M18, balance unchanged)', async () => {
    if (!ready) return;
    const price = aiCreditEntry('M18', 'enrich-organization')!.credits;
    const owner = await makeTenant('enrich-bad', 10);
    stubProvider();
    state.replies = ['Üzgünüm, {bu bir JSON değil'];
    const org = await withTenant(owner.tenantId, (tx) => enrichment.loadEnrichmentSubject(tx, owner.tenantId, owner.organizationId));
    const res = await enrichment.proposeEnrichment(
      { tenantId: owner.tenantId, userId: owner.userId, org: org!, locale: 'tr' },
      { fetchSite: async () => ({ ok: true, pages: [{ url: 'https://acme.example.com.tr/', text: 'Acme' }], skipped: [] }) },
    );
    expect(res).toEqual({ ok: false, code: 'BAD_ANSWER' });
    expect(state.requests).toBe(1);
    expect(await balance(owner.tenantId)).toBe(10);
    expectRefundedPair(await moves(owner.tenantId), price);
    // The call reached the provider, so it is on record — at 0 credits.
    const logs = await admin!.aiUsageLog.findMany({ where: { tenantId: owner.tenantId }, select: { purpose: true, credits: true } });
    expect(logs).toEqual([{ purpose: 'enrich-organization-attempt', credits: 0 }]);
  }, 30_000);

  test('eligibility: an empty answer gives the reservation back and saves no DRAFT', async () => {
    if (!ready) return;
    const price = aiCreditEntry('M18', 'eligibility-pre-report')!.credits;
    const owner = await makeTenant('elig-empty', 10);
    const callId = await makeCall('EMPTY');
    stubProvider();
    state.replies = ['   \n  '];
    const subject = await withTenant(owner.tenantId, (tx) => eligibility.loadEligibilitySubject(tx, owner.tenantId, owner.organizationId, callId));
    await expect(
      eligibility.createEligibilityReport({ tenantId: owner.tenantId, userId: owner.userId, subject: subject!, locale: 'tr' }),
    ).rejects.toBeInstanceOf(eligibility.EmptyEligibilityAnswerError);
    expect(state.requests).toBe(1);
    expect(await balance(owner.tenantId)).toBe(10);
    expectRefundedPair(await moves(owner.tenantId), price);
    expect(await admin!.leadEligibilityReport.count({ where: { tenantId: owner.tenantId } })).toBe(0);
  }, 30_000);

  test('eligibility: a report that cannot be saved gives the reservation back', async () => {
    if (!ready) return;
    const price = aiCreditEntry('M18', 'eligibility-pre-report')!.credits;
    const owner = await makeTenant('elig-nosave', 10);
    const callId = await makeCall('NOSAVE');
    stubProvider();
    state.replies = ['### Özet\nBelirsiz.'];
    const subject = await withTenant(owner.tenantId, (tx) => eligibility.loadEligibilitySubject(tx, owner.tenantId, owner.organizationId, callId));
    await expect(
      eligibility.createEligibilityReport(
        { tenantId: owner.tenantId, userId: owner.userId, subject: subject!, locale: 'tr' },
        { save: async () => { throw new Error('simulated write failure'); } },
      ),
    ).rejects.toThrow(/simulated write failure/);
    expect(await balance(owner.tenantId)).toBe(10);
    expectRefundedPair(await moves(owner.tenantId), price);
    expect(await admin!.leadEligibilityReport.count({ where: { tenantId: owner.tenantId } })).toBe(0);
  }, 30_000);

  test('eligibility: two concurrent runs on credits for one never take the balance below zero', async () => {
    if (!ready) return;
    const price = aiCreditEntry('M18', 'eligibility-pre-report')!.credits;
    const owner = await makeTenant('elig-race', price + 1);
    const callId = await makeCall('RACE');
    stubProvider();
    state.replies = ['### Özet\nA', '### Özet\nB'];
    const subject = await withTenant(owner.tenantId, (tx) => eligibility.loadEligibilitySubject(tx, owner.tenantId, owner.organizationId, callId));
    const run = () => eligibility.createEligibilityReport({ tenantId: owner.tenantId, userId: owner.userId, subject: subject!, locale: 'tr' });
    const results = await Promise.allSettled([run(), run()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]!.reason)).toMatch(/Insufficient AI credits/);
    expect(state.requests).toBe(1);
    expect(await balance(owner.tenantId)).toBe(1);
    expect((await moves(owner.tenantId)).map((r) => [r.reason, r.delta])).toEqual([['usage:M18', -price]]);
    expect(await admin!.leadEligibilityReport.count({ where: { tenantId: owner.tenantId } })).toBe(1);
  }, 30_000);
});
