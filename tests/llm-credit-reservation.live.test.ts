import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * FO-288 — `generateCompletion` reserves its price BEFORE the provider is called, under the tenant
 * credit lock (the M17 model, FO-274). On a real database, with the real `generateCompletion`:
 *
 *  - two calls racing for the credits of one call: exactly one reaches the provider, the other is
 *    refused, and the balance never goes below zero — for every priced caller of the product;
 *  - a call the provider does not answer (rejected request) gives its reservation back;
 *  - a cut-off answer (`max_tokens`) gives its reservation back and books no credit.
 *
 * Only `fetch` is replaced (the Anthropic endpoint, with a short delay so two calls overlap).
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` (seeded catalogue) and
 * `pnpm db:rls-role`. Run it through `pnpm gate:isolated` for a throwaway database.
 */

const SUITE = 'llm-credit-reservation.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `fo288-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  /** Provider answers handed out per request: a status and the body, or a stop reason to answer with. */
  provider: { status: 200, stopReason: 'end_turn' as string, delayMs: 250 },
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
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient } = await import('@/lib/db');
const { generateCompletion } = await import('@/lib/llm');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];

/** Every priced caller of the product, with its catalogue price (`docs/BILLING.md` §1). */
const PRICED_CALLERS = [
  { label: 'M2 concept-note draft', module: 'M2', purpose: 'Drafting section: impact', price: 1 },
  { label: 'M6 evaluation', module: 'M6', purpose: 'evaluation', price: 3 },
  { label: 'M7 TTO/IP checklist', module: 'M7', purpose: 'tto_ip_checklist', price: 1 },
  { label: 'M9 meeting brief', module: 'M9', purpose: 'meeting_brief', price: 1 },
  { label: 'M10 award pack document', module: 'M10', purpose: 'document_generation_award_pack', price: 1 },
] as const;

function anthropicReply(stopReason: string) {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: 'generated' }],
      stop_reason: stopReason,
      usage: { input_tokens: 1000, output_tokens: 500 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

async function makeTenant(key: string, grant: number): Promise<{ tenantId: string; userId: string }> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(t.id);
  await admin!.creditLedger.create({ data: { tenantId: t.id, delta: grant, reason: 'purchase' } });
  const u = await admin!.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  users.push(u.id);
  await admin!.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
  return { tenantId: t.id, userId: u.id };
}

async function balance(tenantId: string): Promise<number> {
  const r = await admin!.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
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
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

/** Fake Anthropic endpoint: counts the requests that reach the provider and answers with a delay. */
function stubProvider() {
  state.requests = 0;
  vi.stubGlobal('fetch', async () => {
    state.requests += 1;
    await new Promise((resolve) => setTimeout(resolve, state.provider.delayMs));
    return anthropicReply(state.provider.stopReason);
  });
}

describe('generateCompletion — credits reserved before the provider (FO-288)', () => {
  beforeAll(() => {
    if (!ready) skipOrFailInCi(SUITE, skipReason || 'live database not ready');
  });

  for (const caller of PRICED_CALLERS) {
    test(`${caller.label}: two racing calls for one call's credits — one runs, the balance stays at 0`, async () => {
      if (!ready) return;
      const owner = await makeTenant(`race-${caller.module}-${caller.purpose.replace(/\W+/g, '').slice(0, 12)}`, caller.price);
      stubProvider();
      state.provider.stopReason = 'end_turn';

      const messages = [{ role: 'user' as const, content: 'draft' }];
      const base = { tenantId: owner.tenantId, userId: owner.userId, module: caller.module, purpose: caller.purpose, messages };
      const results = await Promise.allSettled([generateCompletion(base), generateCompletion(base)]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const refused = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(String((refused[0] as PromiseRejectedResult).reason)).toMatch(/Insufficient AI credits/);
      expect(state.requests).toBe(1);
      expect(await balance(owner.tenantId)).toBe(0);
    }, 20_000);
  }

  test('a rejected provider request gives its reservation back', async () => {
    if (!ready) return;
    const owner = await makeTenant('reject', 5);
    vi.stubGlobal('fetch', async () => {
      state.requests += 1;
      return new Response('{"error":"bad request"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
    });

    await expect(
      generateCompletion({ tenantId: owner.tenantId, userId: owner.userId, module: 'M2', purpose: 'Drafting section: impact', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/400/);

    expect(await balance(owner.tenantId)).toBe(5);
  }, 20_000);

  test('a cut-off answer keeps no credit and still records the call with credits 0', async () => {
    if (!ready) return;
    const owner = await makeTenant('cutoff', 5);
    stubProvider();
    state.provider.stopReason = 'max_tokens';

    await expect(
      generateCompletion({ tenantId: owner.tenantId, userId: owner.userId, module: 'M2', purpose: 'Drafting section: impact', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/cut off/);

    expect(await balance(owner.tenantId)).toBe(5);
    const logs = await admin!.aiUsageLog.findMany({ where: { tenantId: owner.tenantId }, select: { credits: true } });
    expect(logs).toEqual([{ credits: 0 }]);
    state.provider.stopReason = 'end_turn';
  }, 20_000);
});
