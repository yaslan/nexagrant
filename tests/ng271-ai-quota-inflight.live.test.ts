import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * NG-271 (NG-250 review O1 / probe P2) — the NexaGrant monthly AI allowance under concurrency, on a
 * real database over `fabrika_app`.
 *
 * The quota check runs under the tenant credit lock, but that lock is released when the check's
 * transaction commits — BEFORE the provider is called — and the `AiUsageLog` row it counts is written
 * only after the answer. N calls that start together therefore all see the same count: the review
 * measured `N=12 limit=50 start=49 passed=12 finalUsed=61`. A call in flight must count.
 *
 *   1. 12 parallel calls one below the limit (the adapter's own reservation): exactly one passes,
 *      11 are refused with NG_PLAN_LIMIT_REACHED, the month ends at the limit (overshoot 0);
 *   2. the same for a caller that reserved its credits itself (`creditsReserved`, M17/M18);
 *   3. a provider error gives the in-flight hold back: the next call passes;
 *   4. so does a timeout (deadline reached while the provider is silent);
 *   5. a hold leaked by a dead process stops counting when it expires — the tenant is not locked out
 *      for good — and a live one counts.
 *
 * Only `fetch` (the Anthropic endpoint) is replaced: no real model call.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop) => (prop === 'ANTHROPIC_API_KEY' ? 'test-key' : Reflect.get(target, prop)),
    }),
  };
});

const { createDbClient, prisma } = await import('@/lib/db');
const { generateCompletion } = await import('@/lib/llm');
const { NgPlanLimitError } = await import('@/lib/billing/nexagrant/usage');
const { EMBEDDING_MODEL_PREFIX } = await import('@/lib/llm-embedding-model');
const { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } = await import('./helpers/live-db-role');
const { presentIds } = await import('./helpers/teardown-guard');

const SUITE = 'ng271-ai-quota-inflight.live';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
if (REACHABLE) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `ng271-${Math.random().toString(36).slice(2, 10)}`;
const LIMIT = 50; // ng-pro ai_writing_monthly (prisma/seed-data/nexagrant-catalog.ts)
const N = 12;
const tenantIds: string[] = [];
const userIds: string[] = [];

type Owner = { tenantId: string; userId: string };

/** A NexaGrant trial tenant on ng-pro with `used` writings this month and credits to spare. */
async function trialTenant(key: string, used = LIMIT - 1): Promise<Owner> {
  const t = await admin.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', orgType: 'SME' },
    select: { id: true },
  });
  tenantIds.push(t.id);
  const day = 86_400_000;
  await admin.ngSubscription.create({
    data: {
      tenantId: t.id,
      planId: 'ng-pro',
      status: 'TRIALING',
      provider: 'ng-trial',
      trialSegment: 'default',
      trialStartedAt: new Date(Date.now() - 3 * day),
      trialEndsAt: new Date(Date.now() + 3 * day),
      trialEndPlanId: 'ng-free',
    },
  });
  await admin.creditLedger.create({ data: { tenantId: t.id, delta: 1000, reason: 'purchase' } });
  const u = await admin.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  userIds.push(u.id);
  await admin.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
  await admin.aiUsageLog.createMany({
    data: Array.from({ length: used }, () => ({
      tenantId: t.id,
      module: 'M2',
      purpose: 'concept-note',
      provider: 'anthropic',
      model: 'scripted',
      promptHash: 'h',
      inputTokens: 1,
      outputTokens: 1,
      credits: 1,
    })),
  });
  return { tenantId: t.id, userId: u.id };
}

/** What the quota counts: this tenant's generations (no embedding rows are written here). */
const writings = (tenantId: string) =>
  admin.aiUsageLog.count({ where: { tenantId, NOT: { model: { startsWith: EMBEDDING_MODEL_PREFIX } } } });
const holds = (tenantId: string) => admin.ngAiQuotaHold.count({ where: { tenantId } });

function answer(): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** The provider takes `ms` to answer: every call of a burst is in flight at the same time. */
function slowProvider(ms: number): void {
  vi.stubGlobal('fetch', async () => {
    await new Promise((r) => setTimeout(r, ms));
    return answer();
  });
}

const call = (o: Owner, extra: Record<string, unknown> = {}) =>
  generateCompletion({ tenantId: o.tenantId, userId: o.userId, module: 'M2', purpose: 'concept-note', prompt: 'scripted', ...extra });

async function burst(o: Owner, extra: Record<string, unknown> = {}) {
  const results = await Promise.allSettled(Array.from({ length: N }, () => call(o, extra)));
  const passed = results.filter((r) => r.status === 'fulfilled').length;
  const refused = results.filter((r) => r.status === 'rejected' && r.reason instanceof NgPlanLimitError).length;
  const other = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected' && !(r.reason instanceof NgPlanLimitError))
    .map((r) => String(r.reason));
  const used = await writings(o.tenantId);
  process.stderr.write(`[${SUITE}] N=${N} limit=${LIMIT} start=${LIMIT - 1} passed=${passed} refused=${refused} finalUsed=${used} overshoot=${used - LIMIT}\n`);
  return { passed, refused, other, used };
}

describe.skipIf(!REACHABLE)('NG-271 — in-flight calls count against the NexaGrant AI allowance (live, fabrika_app)', () => {
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (presentIds(tenantIds).length > 0) {
      await admin.ngAiQuotaHold.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
      await admin.aiUsageLog.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
      await admin.creditLedger.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
      await admin.membership.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
      await admin.ngSubscription.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
      await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
    }
    if (presentIds(userIds).length > 0) await admin.user.deleteMany({ where: { id: { in: presentIds(userIds) } } });
    await admin.$disconnect();
  });

  it(`1. ${N} parallel calls at limit−1 (own reservation): one passes, ${N - 1} refused, overshoot 0`, async () => {
    const o = await trialTenant('burst');
    slowProvider(400);
    const r = await burst(o);
    expect(r.other).toEqual([]);
    expect({ passed: r.passed, refused: r.refused, used: r.used }).toEqual({ passed: 1, refused: N - 1, used: LIMIT });
    expect(await holds(o.tenantId)).toBe(0);
  }, 60_000);

  it(`2. ${N} parallel calls at limit−1 by a caller that reserved itself (creditsReserved): overshoot 0`, async () => {
    const o = await trialTenant('reserved');
    slowProvider(400);
    const r = await burst(o, { creditsReserved: true });
    expect(r.other).toEqual([]);
    expect({ passed: r.passed, refused: r.refused, used: r.used }).toEqual({ passed: 1, refused: N - 1, used: LIMIT });
    expect(await holds(o.tenantId)).toBe(0);
  }, 60_000);

  it('3. a provider error gives the hold back: no hold left, the next call passes', async () => {
    const o = await trialTenant('error');
    // 400: a client error, not retried — the call fails at once.
    vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"bad"}}', { status: 400 }));
    await expect(call(o)).rejects.toThrow();
    expect(await holds(o.tenantId)).toBe(0);
    expect(await writings(o.tenantId)).toBe(LIMIT - 1);
    slowProvider(0);
    await expect(call(o)).resolves.toMatchObject({ text: 'ok' });
    expect(await writings(o.tenantId)).toBe(LIMIT);
  }, 60_000);

  it('4. a timeout gives the hold back: no hold left, the next call passes', async () => {
    const o = await trialTenant('timeout');
    vi.stubGlobal('fetch', (_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
    );
    await expect(call(o, { deadlineAt: Date.now() + 300 })).rejects.toThrow();
    expect(await holds(o.tenantId)).toBe(0);
    slowProvider(0);
    await expect(call(o)).resolves.toMatchObject({ text: 'ok' });
    expect(await writings(o.tenantId)).toBe(LIMIT);
  }, 60_000);

  it('5. a leaked hold stops counting once expired (and is cleared); a live one counts', async () => {
    const live = await trialTenant('leak-live');
    await admin.ngAiQuotaHold.create({ data: { tenantId: live.tenantId, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    slowProvider(0);
    await expect(call(live)).rejects.toBeInstanceOf(NgPlanLimitError);

    const dead = await trialTenant('leak-expired');
    await admin.ngAiQuotaHold.create({ data: { tenantId: dead.tenantId, expiresAt: new Date(Date.now() - 1000) } });
    await expect(call(dead)).resolves.toMatchObject({ text: 'ok' });
    expect(await holds(dead.tenantId)).toBe(0);
    expect(await writings(dead.tenantId)).toBe(LIMIT);
  }, 60_000);
});
