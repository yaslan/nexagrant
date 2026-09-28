import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import type Stripe from 'stripe';

/**
 * TASK-MULQKFER4MF0Y (closes the K1 debt of TASK-MTVTMZXYT84RZ) — the two
 * billing calls that had the tenant in hand and still went through the unscoped
 * `prisma` singleton, measured under the role the app will run as.
 *
 *   createPortalSession   subscription.findUnique  → now withTenant(tenantId)
 *   recordLifetimeLicence lifetimeLicence.create   → now withTenant(tenantId)
 *
 * On the `fabrika` superuser both work by accident, because every RLS policy is
 * skipped. On `fabrika_app` (NOBYPASSRLS), unscoped, the portal read returns no
 * row — so a paying tenant is told to "complete subscription setup first" — and
 * the licence INSERT is refused by tenant_isolation's WITH CHECK, so a paid
 * lifetime licence is never recorded. Each has a test below that goes red if the
 * wrap is taken off, and each has a cross-tenant refusal next to it.
 *
 * Same swap as stripe-webhook-idempotency-rls.live.test.ts: the singleton is
 * pointed at the RLS role before `@/lib/db` loads; fixtures and counts go
 * through the owning role.
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

/** The Stripe SDK is the transport, not the behaviour under test: echo the customer back. */
vi.mock('stripe', () => {
  class MockStripe {
    billingPortal = {
      sessions: {
        create: async ({ customer }: { customer: string }) => ({
          url: `https://billing.example.test/p/${customer}`,
        }),
      },
    };
  }
  return { default: MockStripe };
});

import { createDbClient, withTenant } from '@/lib/db';
import { createPortalSession } from '@/lib/billing/create-portal-session';
import { recordLifetimeLicence, LIFETIME_SKU } from '@/lib/billing/lifetime-licence';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');

const HAS_DB =
  RLS_URL !== undefined && (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (!HAS_DB) {
  console.warn(
    'billing K1 tenant-scope test skipped: needs Postgres and DATABASE_URL_RLS_TEST ' +
      '(`docker compose up -d` then `pnpm db:rls-role`).'
  );
}

const RUN = `mulqk-${Date.now()}`;
const TENANT_A = `t-k1-a-${RUN}`;
const TENANT_B = `t-k1-b-${RUN}`;
const TENANTS = [TENANT_A, TENANT_B];
const CUSTOMER_A = `cus-k1-a-${RUN}`;

async function wipe(): Promise<void> {
  await admin.lifetimeLicence.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.subscription.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  for (const id of TENANTS) {
    await admin.tenant.create({ data: { id, name: `K1 probe ${RUN}`, slug: id, country: 'TR' } });
  }
  await admin.subscription.create({
    data: { tenantId: TENANT_A, planId: `plan-k1-${RUN}`, status: 'ACTIVE', providerCustomerId: CUSTOMER_A },
  });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.$disconnect();
});

function lifetimeSession(id: string, tenantId: string): Stripe.Checkout.Session {
  return {
    id,
    object: 'checkout.session',
    amount_total: 128_800,
    currency: 'usd',
    created: Math.floor(Date.now() / 1000),
    client_reference_id: tenantId,
    payment_status: 'paid',
    subscription: null,
    metadata: { tenantId, skus: LIFETIME_SKU },
  } as unknown as Stripe.Checkout.Session;
}

describe.skipIf(!HAS_DB)('billing K1 call sites under fabrika_app (TASK-MULQKFER4MF0Y)', () => {
  test('createPortalSession reads the tenant’s own subscription under the RLS role', async () => {
    // Unscoped, fabrika_app sees no Subscription row and this throws
    // "No Stripe customer found".
    await expect(createPortalSession(TENANT_A, 'https://app.example.test/billing')).resolves.toBe(
      `https://billing.example.test/p/${CUSTOMER_A}`
    );
  });

  test('another tenant’s scope cannot read that subscription', async () => {
    const seen = await withTenant(TENANT_B, (tx) =>
      tx.subscription.findUnique({ where: { tenantId: TENANT_A } })
    );
    expect(seen).toBeNull();
    // And the portal for B does not borrow A's customer.
    await expect(createPortalSession(TENANT_B, 'https://app.example.test/billing')).rejects.toThrow(
      /No Stripe customer found/
    );
  });

  test('recordLifetimeLicence writes the licence under the RLS role', async () => {
    const eventId = `evt-k1-${RUN}`;
    // Unscoped, the INSERT fails tenant_isolation's WITH CHECK and this rejects.
    const result = await recordLifetimeLicence(lifetimeSession(`cs-k1-${RUN}`, TENANT_A), eventId);
    expect(result.status).toBe('recorded');
    expect(result.tenantId).toBe(TENANT_A);

    const rows = await admin.lifetimeLicence.findMany({ where: { tenantId: TENANT_A } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerEventId).toBe(eventId);

    // A redelivery is still a no-op: the idempotency path is untouched by the wrap.
    const again = await recordLifetimeLicence(lifetimeSession(`cs-k1-${RUN}`, TENANT_A), eventId);
    expect(again.status).toBe('duplicate');
    expect(await admin.lifetimeLicence.count({ where: { tenantId: TENANT_A } })).toBe(1);
  });

  test('a tenant scope cannot write a licence for another tenant', async () => {
    await expect(
      withTenant(TENANT_B, (tx) =>
        tx.lifetimeLicence.create({
          data: {
            tenantId: TENANT_A,
            seq: 900_000 + Math.floor(Math.random() * 99_999),
            amountMinor: 1,
            providerEventId: `evt-k1-cross-${RUN}`,
          },
        })
      )
    ).rejects.toThrow(/row-level security/i);
    expect(
      await admin.lifetimeLicence.count({ where: { providerEventId: `evt-k1-cross-${RUN}` } })
    ).toBe(0);
  });
});
