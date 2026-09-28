import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * TASK-MTVU5DI4C96DB — the iyzico webhook under the role the application
 * actually runs as.
 *
 * Sibling of `tests/stripe-webhook-idempotency-rls.live.test.ts`
 * (TASK-MTVSBEO7VX6Y4 / ADR-0003): that file measured the same class of bug
 * on the Stripe path. This one measures the iyzico path, which had a bigger
 * gap — it never opened a tenant transaction at all. Measured on `fabrika_app`
 * (NOBYPASSRLS) before the fix:
 *
 *     handler THREW: Database error. Code: `42501`. Message: `new row
 *     violates row-level security policy for table "Subscription"`
 *     after first delivery: Subscription=0 CreditLedger=0 AuditEvent=0
 *
 * i.e. every delivery 500'd and no money was ever written — not a double
 * grant like the Stripe bug, but every genuine iyzico payment silently
 * failed to activate under the role the app is being moved to.
 *
 * `vi.hoisted` swaps `DATABASE_URL` to the `fabrika_app` role before `@/lib/db`
 * loads (it reads the connection string at module scope), same trick as the
 * Stripe file.
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
  process.env.IYZICO_API_KEY ||= 'test-api-key';
  process.env.IYZICO_SECRET_KEY ||= 'test-secret-key';
  return { rlsUrl, ownerUrl };
});

import { prisma, createDbClient } from '@/lib/db';
import { handleIyzicoWebhook, buildConversationId, type IyzicoNotification } from '@/lib/iyzico';
import type { IyzicoPaymentDetail } from '@/lib/iyzico';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const PRIV_URL = OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const admin = createDbClient(PRIV_URL);

const SUITE = 'iyzico webhook RLS idempotency test';

const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

// Checked before any test runs, so a BYPASSRLS role fails the whole file rather
// than one assertion next to many vacuous greens.
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `mtvu5di-${Date.now()}`;
const TENANT = `t-rls-${RUN}`;
const PLAN = `plan-rls-${RUN}`;
const CREDITS = 777;
/** Sized to the pg pool default (max=10), so the wave cannot be won by queueing alone. */
const WAVE = 8;

function conversationIdFor(tenantId = TENANT): string {
  return buildConversationId(tenantId, PLAN, 'month');
}

function notificationFor(eventId: string, conversationId = conversationIdFor()): IyzicoNotification {
  return {
    iyziEventType: 'CHECKOUT_FORM_AUTH',
    iyziReferenceCode: eventId,
    token: `tok-${eventId}`,
    paymentId: `pay-${eventId}`,
    paymentConversationId: conversationId,
    status: 'SUCCESS',
  };
}

function detailFor(eventId: string, conversationId = conversationIdFor()): IyzicoPaymentDetail {
  return {
    status: 'success',
    paymentStatus: 'SUCCESS',
    paymentId: `pay-${eventId}`,
    conversationId,
    token: `tok-${eventId}`,
    price: '87.00',
    paidPrice: '87.00',
    currency: 'TRY',
  };
}

async function deliver(eventId: string, conversationId = conversationIdFor()) {
  return handleIyzicoWebhook(notificationFor(eventId, conversationId), {
    retrievePayment: async () => detailFor(eventId, conversationId),
  });
}

/** Every table a delivery can move, counted one at a time out of Postgres. */
async function snapshot() {
  const [subscriptions, creditRows, credits, audits] = await Promise.all([
    admin.subscription.count({ where: { tenantId: TENANT } }),
    admin.creditLedger.count({ where: { tenantId: TENANT } }),
    admin.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } }),
    admin.auditEvent.count({ where: { tenantId: TENANT } }),
  ]);
  return { subscriptions, creditRows, creditBalance: credits._sum.delta ?? 0, audits };
}

/** Never created as a real Tenant row — the "unresolvable tenant" test names it in an alert only. */
const GHOST_TENANT = `t-ghost-${RUN}`;

async function wipe(): Promise<void> {
  await admin.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: TENANT } } });
  // `check-orphan-alerts.ts` flags exactly this shape: an alert naming a
  // tenant that was never created (and so can never be looked up) outlives
  // every run unless it is deleted by id here, since GHOST_TENANT never
  // exists as a `Tenant` row for a tenant-scoped delete to cascade from.
  await admin.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: GHOST_TENANT } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: TENANT } });
  await admin.creditLedger.deleteMany({ where: { tenantId: TENANT } });
  await admin.moduleState.deleteMany({ where: { tenantId: TENANT } });
  await admin.invoice.deleteMany({ where: { tenantId: TENANT } });
  await admin.subscription.deleteMany({ where: { tenantId: TENANT } });
  await admin.tenant.deleteMany({ where: { id: TENANT } });
  await admin.plan.deleteMany({ where: { id: PLAN } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.plan.create({
    data: {
      id: PLAN,
      name: `RLS idempotency probe ${RUN}`,
      monthlyCents: 8700,
      yearlyCents: 87000,
      currency: 'USD',
      seats: 3,
      workspaces: 1,
      aiCreditsMonthly: CREDITS,
      modules: ['M1'],
      visibility: 'private',
    },
  });
  await admin.tenant.create({ data: { id: TENANT, name: TENANT, slug: TENANT, country: 'TR' } });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('iyzico webhook idempotency under fabrika_app (live database)', () => {
  test('the handler really is running as a role the policies apply to', async () => {
    // If this ever passes on a BYPASSRLS role, every other assertion in this
    // file is meaningless — that is the false green this card was created by.
    const rows = await prisma.$queryRaw<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]?.current_user).toBe('fabrika_app');
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  test('a first delivery writes the money and the audit trail together', async () => {
    expect(await snapshot()).toMatchObject({ subscriptions: 0, creditRows: 0, audits: 0 });

    const result = await deliver(`evt-sync-${RUN}`);

    expect(result).toMatchObject({ success: true, outcome: 'synced', creditsGranted: CREDITS });
    expect(await snapshot()).toMatchObject({
      subscriptions: 1,
      creditRows: 1,
      creditBalance: CREDITS,
      // Two audit rows: `subscription.updated` and `invoice.payment_succeeded`.
      audits: 2,
    });
  });

  test('a redelivery of the same event changes no row', async () => {
    const before = await snapshot();

    const result = await deliver(`evt-sync-${RUN}`);

    expect(result).toMatchObject({ success: true, outcome: 'duplicate' });
    expect(await snapshot()).toEqual(before);
  });

  test('a new event id does move the same rows', async () => {
    // The counterfactual: without it a handler that had stopped writing
    // entirely would satisfy the assertion above just as well.
    const before = await snapshot();

    await deliver(`evt-fresh-${RUN}`);
    const after = await snapshot();

    // A renewal of an already-ACTIVE subscription grants no second allowance.
    expect(after.creditBalance).toBe(before.creditBalance);
    expect(after.audits).toBe(before.audits + 2);
    expect(after.subscriptions).toBe(1);
  });

  test('an unresolvable tenant does not throw and raises an operator-visible alert', async () => {
    const ghostConversation = conversationIdFor(GHOST_TENANT);
    const eventId = `evt-ghost-${RUN}`;

    const result = await deliver(eventId, ghostConversation);

    expect(result).toMatchObject({ success: false, outcome: 'unknown_tenant' });
    // Nothing written for a tenant that does not exist.
    expect(await admin.subscription.count({ where: { tenantId: GHOST_TENANT } })).toBe(0);

    const alert = await admin.systemAlert.findFirst({
      where: { source: 'iyzico_webhook_unattributed', meta: { path: ['eventId'], equals: eventId } },
    });
    expect(alert).not.toBeNull();
    expect(alert?.level).toBe('warn');
  });

  test('simultaneous deliveries of one event are settled by the advisory lock, not by a read', async () => {
    await admin.creditLedger.deleteMany({ where: { tenantId: TENANT } });
    await admin.auditEvent.deleteMany({ where: { tenantId: TENANT } });
    await admin.subscription.deleteMany({ where: { tenantId: TENANT } });

    const eventId = `evt-race-${RUN}`;
    const results = await Promise.allSettled(Array.from({ length: WAVE }, () => deliver(eventId)));

    const synced = results.filter(
      (r) => r.status === 'fulfilled' && r.value.outcome === 'synced'
    ).length;
    const duplicate = results.filter(
      (r) => r.status === 'fulfilled' && r.value.outcome === 'duplicate'
    ).length;
    const failed = results.filter((r) => r.status === 'rejected');

    const after = await snapshot();
    console.log(
      `wave=${WAVE} synced=${synced} duplicate=${duplicate} rejected=${failed.length} ` +
        `| creditRows=${after.creditRows} balance=${after.creditBalance}`
    );
    expect(after.subscriptions).toBe(1);
    expect(after.creditRows).toBe(1);
    expect(after.creditBalance).toBe(CREDITS);
    expect(synced).toBe(1);
    expect(synced + duplicate + failed.length).toBe(WAVE);
  });
});
