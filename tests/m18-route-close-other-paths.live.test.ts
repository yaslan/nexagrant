import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type Stripe from 'stripe';

/**
 * NG-222 (NG-215 review, Bulgu 2) — the other four writes that take M18 out of PILOT.
 *
 * NG-215 closes a tenant's province routes when the PLATFORM ADMIN's console moves M18 out of
 * PILOT (`updateTenantModuleStatus`, tests/m18-route-close-on-module-exit.live.test.ts). Four more
 * writes set M18 OFF and none of them touches ProvinceLeadRoute:
 *
 *   1. the tenant's own settings (`toggleModuleState`, settings/modules/actions.ts);
 *   2. an iyzico payment for a plan without M18 (`handleIyzicoWebhook`, the downgrade loop);
 *   3. a Stripe subscription moved to a plan without M18 (`syncStripeSubscription`);
 *   4. a Stripe cancellation (`handleSubscriptionCancellation`, every non-free module OFF).
 *
 * After each, the route stays active: the transfer box keeps naming the tenant
 * (`province_transfer_org_name`), the submit binds the visitor's consent to it
 * (`province_transfer_org`) and the forward is refused (`tenant_ineligible`). The expectation is
 * the NG-215 one: M18 closed ⇒ in the same transaction the route is inactive, one
 * `lead-route.deactivated` audit row is written, and both functions return nothing. The audit row
 * says who closed it — the tenant's own user, or billing (no person) — and carries no e-mail or name.
 *
 * Real Postgres, the code under test on `fabrika_app` (NOBYPASSRLS); fixtures and ground truth
 * through the owner role. Faked: the session (`requireTenantAction`), Next's cache, the Stripe SDK
 * module and iyzico's payment lookup (no provider is called).
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
      if (i > 0 && t.slice(0, i) === key) return t.slice(i + 1).replace(/^["']|["']$/g, '') || undefined;
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  process.env.IYZICO_API_KEY ||= 'test-api-key';
  process.env.IYZICO_SECRET_KEY ||= 'test-secret-key';
  return { rlsUrl, ownerUrl };
});

const session = vi.hoisted(() => ({ tenantId: '', userId: '' }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: session.tenantId, userId: session.userId, role: 'TENANT_OWNER' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('stripe', () => {
  class MockStripe {
    subscriptions = { retrieve: async () => { throw new Error('not used'); } };
    webhooks = { constructEvent: () => { throw new Error('not used'); } };
  }
  return { default: MockStripe };
});

import { toggleModuleState } from '@/app/[locale]/(app)/[workspace]/settings/modules/actions';
import { PROVINCE_ROUTE_AUDIT } from '@/core/contracts/lead-routing';
import { handleIyzicoWebhook, buildConversationId } from '@/lib/iyzico';
import { handleSubscriptionCancellation, syncStripeSubscription } from '@/lib/billing/subscription-sync';
import { createDbClient, prisma } from '@/lib/db';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

const SUITE = 'm18 route close on the other module-exit paths test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);

/** One PILOT consultancy per path, each the target of its own province (no other test file routes these). */
const T = {
  settings: `ng222-settings-${RUN}`,
  iyzico: `ng222-iyzico-${RUN}`,
  stripeDown: `ng222-stripedown-${RUN}`,
  stripeCancel: `ng222-stripecancel-${RUN}`,
} as const;
type Path = keyof typeof T;
const PROVINCE: Record<Path, string> = { settings: 'Şırnak', iyzico: 'Bingöl', stripeDown: 'Iğdır', stripeCancel: 'Osmaniye' };
/** The same four, as literals: a teardown `where` must not be computed (tests/teardown-where-guard.test.ts). */
const PROVINCES = ['Şırnak', 'Bingöl', 'Iğdır', 'Osmaniye'];
const TENANTS = [T.settings, T.iyzico, T.stripeDown, T.stripeCancel];
/** A plan that carries M18 (no catalogue plan does: M18 is not sold) and one that does not. */
const PLAN_WITH_M18 = `ng222-with-m18-${RUN}`;
const PLAN_WITHOUT_M18 = `ng222-without-m18-${RUN}`;
const PLANS = [PLAN_WITH_M18, PLAN_WITHOUT_M18];
const PRICE_WITHOUT_M18 = `price-ng222-without-${RUN}`;
const OWNER_EMAIL = `ng222-owner-${RUN}@example.test`;
let OWNER = '';

async function visitorSees(province: string): Promise<{ name: string | null; recipient: string | null }> {
  const [n] = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT public.province_transfer_org_name(${province}) AS name`;
  const [r] = await prisma.$queryRaw<Array<{ tenant_id: string | null }>>`SELECT tenant_id FROM public.province_transfer_org(${province})`;
  return { name: n?.name ?? null, recipient: r?.tenant_id ?? null };
}
const m18Status = async (tenantId: string) =>
  (await admin.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId: 'M18' } }, select: { status: true } }))?.status ?? null;
const activeRoutes = (province: string) => admin.provinceLeadRoute.count({ where: { province, active: true } });
const routeAudits = (province: string) =>
  admin.auditEvent.findMany({ where: { tenantId: null, target: province, type: PROVINCE_ROUTE_AUDIT.deactivated }, select: { actorId: true, data: true } });

function stripeSubscription(tenantId: string, priceId: string): Stripe.Subscription {
  return {
    id: `sub-${tenantId}`,
    customer: `cus-${tenantId}`,
    status: 'active',
    metadata: { tenantId },
    billing_cycle_anchor: 0,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    items: { data: [{ id: `si-${tenantId}`, quantity: 1, price: { id: priceId, unit_amount: 4900, currency: 'usd' } }] },
  } as unknown as Stripe.Subscription;
}

/** What every path must leave behind: M18 closed, the route closed with it, the audit row, nothing for the visitor. */
async function expectRouteClosed(path: Path, actor: { actorId: string | null; kind: 'tenant_user' | 'billing' }) {
  const province = PROVINCE[path];
  expect(await m18Status(T[path]), 'the path really closed M18').toBe('OFF');
  expect(await activeRoutes(province), 'active routes').toBe(0);
  const audits = await routeAudits(province);
  expect(audits, 'lead-route.deactivated audit rows').toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actorId: actor.actorId,
    data: { province, fromTenantId: T[path], toTenantId: null, reason: 'module_closed', moduleId: 'M18', newStatus: 'OFF', actor: actor.kind },
  });
  expect(JSON.stringify(audits[0]?.data)).not.toContain(OWNER_EMAIL);
  expect(await visitorSees(province)).toEqual({ name: null, recipient: null });
}

async function wipe(): Promise<void> {
  for (const tenantId of TENANTS) {
    await admin.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: requireId(tenantId, 'tenantId') } } });
  }
  await admin.auditEvent.deleteMany({ where: { tenantId: null, target: { in: PROVINCES }, data: { path: ['fromTenantId'], string_starts_with: 'ng222-' } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.stripeEventLog.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.creditLedger.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.addOn.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.moduleState.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.invoice.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.subscription.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.provinceLeadRoute.deleteMany({ where: { province: { in: PROVINCES }, targetTenantId: { in: TENANTS } } });
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  await admin.plan.deleteMany({ where: { id: { in: PLANS } } });
  await admin.user.deleteMany({ where: { email: OWNER_EMAIL } });
}

describe.skipIf(!HAS_DB)('M18 closed by the tenant or by billing closes the province route too (NG-222)', () => {
  beforeAll(async () => {
    await wipe();
    const owner = await admin.user.create({ data: { email: OWNER_EMAIL, name: 'NG-222 owner' } });
    OWNER = owner.id;
    const plan = { monthlyCents: 4900, yearlyCents: 49000, currency: 'USD', seats: 3, workspaces: 1, aiCreditsMonthly: 0, visibility: 'private' } as const;
    await admin.plan.create({ data: { ...plan, id: PLAN_WITH_M18, name: `NG-222 with M18 ${RUN}`, modules: ['M1', 'M18'] } });
    await admin.plan.create({ data: { ...plan, id: PLAN_WITHOUT_M18, name: `NG-222 without M18 ${RUN}`, modules: ['M1'], stripePriceMonthly: PRICE_WITHOUT_M18 } });
    for (const path of Object.keys(T) as Path[]) {
      await admin.tenant.create({ data: { id: T[path], name: T[path], slug: T[path], country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' } });
      await admin.moduleState.create({ data: { tenantId: T[path], moduleId: 'M18', status: 'PILOT', changedBy: 'ng222 test' } });
      await admin.provinceLeadRoute.create({ data: { province: PROVINCE[path], targetTenantId: T[path], active: true } });
    }
    // The billing paths start from a paid subscription: on the plan with M18 (downgrades) or without it (cancel).
    const sub = (tenantId: string, planId: string, provider: string) =>
      admin.subscription.create({ data: { tenantId, planId, status: 'ACTIVE', billingInterval: 'month', provider, providerSubId: `sub-${tenantId}` } });
    await sub(T.iyzico, PLAN_WITH_M18, 'iyzico');
    await sub(T.stripeDown, PLAN_WITH_M18, 'stripe');
    await sub(T.stripeCancel, PLAN_WITHOUT_M18, 'stripe');
  });

  afterAll(async () => {
    await wipe();
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('the teardown list names exactly the provinces of the paths', () => {
    expect([...PROVINCES].sort()).toEqual(Object.values(PROVINCE).sort());
  });

  test('before: every PILOT target is shown to the visitor and bound by the submit', async () => {
    for (const path of Object.keys(T) as Path[]) {
      expect(await visitorSees(PROVINCE[path]), path).toEqual({ name: T[path], recipient: T[path] });
    }
  });

  test('1. the tenant turns M18 off in its own settings', async () => {
    session.tenantId = T.settings;
    session.userId = OWNER;
    await toggleModuleState('M18', 'OFF');
    await expectRouteClosed('settings', { actorId: OWNER, kind: 'tenant_user' });
  });

  test('2. an iyzico payment moves the tenant to a plan without M18', async () => {
    const conversationId = buildConversationId(T.iyzico, PLAN_WITHOUT_M18, 'month');
    const eventId = `evt-ng222-iyzico-${RUN}`;
    const result = await handleIyzicoWebhook(
      { iyziEventType: 'CHECKOUT_FORM_AUTH', iyziReferenceCode: eventId, token: `tok-${eventId}`, paymentId: `pay-${eventId}`, paymentConversationId: conversationId, status: 'SUCCESS' },
      { retrievePayment: async () => ({ status: 'success', paymentStatus: 'SUCCESS', paymentId: `pay-${eventId}`, conversationId, token: `tok-${eventId}`, price: '49.00', paidPrice: '49.00', currency: 'TRY' }) }
    );
    expect(result).toMatchObject({ success: true, outcome: 'synced' });
    await expectRouteClosed('iyzico', { actorId: null, kind: 'billing' });
  });

  test('3. a Stripe subscription moves to a plan without M18', async () => {
    const result = await syncStripeSubscription(stripeSubscription(T.stripeDown, PRICE_WITHOUT_M18), `evt-ng222-stripe-down-${RUN}`);
    expect(result).toMatchObject({ planId: PLAN_WITHOUT_M18 });
    await expectRouteClosed('stripeDown', { actorId: null, kind: 'billing' });
  });

  test('4. a Stripe cancellation turns every non-free catalogue module off', async () => {
    // The cancellation turns off what ModuleCatalog lists outside the free plan. The seed writes
    // M1–M11 only, so today it never reaches M18 (latent); a catalogue that lists M18 — the day the
    // seed catches up with the manifests — makes it close M18. The row is added for this test only.
    const added = (await admin.moduleCatalog.count({ where: { id: 'M18' } })) === 0;
    if (added) {
      await admin.moduleCatalog.create({ data: { id: 'M18', key: `ng222-m18-${RUN}`, name: 'NG-222 M18 probe', version: '0.0.0', requires: [], recommends: [], planTiers: [] } });
    }
    try {
      const result = await handleSubscriptionCancellation(stripeSubscription(T.stripeCancel, PRICE_WITHOUT_M18), `evt-ng222-stripe-cancel-${RUN}`);
      expect(result).toMatchObject({ planId: 'free' });
    } finally {
      if (added) await admin.moduleCatalog.delete({ where: { key: `ng222-m18-${RUN}` } });
    }
    await expectRouteClosed('stripeCancel', { actorId: null, kind: 'billing' });
  });
});
