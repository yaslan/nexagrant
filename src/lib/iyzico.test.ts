import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  // `env` is parsed at import time, so the credentials must exist before the
  // module under test is loaded.
  process.env.IYZICO_API_KEY = 'test-api-key';
  process.env.IYZICO_SECRET_KEY = 'test-secret-key';
  process.env.IYZICO_BASE_URL = 'https://sandbox-api.example.test';
  // Same reason: the invoice writer reads the VAT rate through the parsed `env`,
  // so it has to be present before the module graph loads.
  process.env.INVOICE_VAT_RATE = '20';
});

vi.mock('@/lib/db', () => {
  const prisma: Record<string, unknown> = {
    tenant: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    planVersion: { findFirst: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn() },
    creditLedger: { create: vi.fn() },
    moduleState: { upsert: vi.fn() },
    auditEvent: { findFirst: vi.fn(), create: vi.fn() },
    // The webhook issues the invoice for the payment (TASK-MTSWL8ADKZKDM), so
    // the fake has to carry the tables that write path touches.
    invoice: { findFirst: vi.fn(), create: vi.fn() },
    tenantBillingIdentity: { findUnique: vi.fn() },
    systemAlert: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

import {
  buildAuthorizationHeader,
  buildConversationId,
  createIyzicoCheckout,
  handleIyzicoWebhook,
  notificationEventId,
  parseConversationId,
  signNotification,
  tryPriceMinor,
  verifyIyzicoSignature,
  type IyzicoNotification,
} from './iyzico';
import { prisma } from '@/lib/db';

const SECRET = 'test-secret-key';
const TENANT = 'tenant_try_1';

/**
 * The mocked client, typed loosely on purpose: every leaf is a `vi.fn()` and
 * the tests only ever read `.mock.calls`, so mirroring PrismaClient's real
 * types here would add noise without catching anything.
 */
type MockFn = ReturnType<typeof vi.fn>;
type MockedPrisma = Record<string, Record<string, MockFn> & MockFn>;

const db = prisma as unknown as MockedPrisma;

function planRow(id: string, credits: number, modules: string[]) {
  return { id, name: id, monthlyCents: 0, yearlyCents: 0, currency: 'USD', seats: 3, workspaces: 1, aiCreditsMonthly: credits, modules };
}

function successfulDetail(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    paymentStatus: 'SUCCESS',
    paymentId: '1234567',
    paidPrice: '7850.00',
    price: '7850.00',
    currency: 'TRY',
    ...overrides,
  };
}

function notificationFor(conversationId: string, overrides: Partial<IyzicoNotification> = {}): IyzicoNotification {
  return {
    iyziEventType: 'CHECKOUT_FORM_AUTH',
    iyziReferenceCode: 'ref-abc-1',
    token: 'tok_1',
    paymentId: '1234567',
    paymentConversationId: conversationId,
    status: 'SUCCESS',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  db.tenant.findUnique.mockResolvedValue({ id: TENANT, name: 'Anadolu' });
  db.plan.findUnique.mockResolvedValue(planRow('pro', 500, ['M1', 'M2', 'M3']));
  db.subscription.findUnique.mockResolvedValue(null);
  db.auditEvent.findFirst.mockResolvedValue(null);
  db.invoice.findFirst.mockResolvedValue(null);
  db.invoice.create.mockResolvedValue({ id: 'inv_1', number: 'FB-2026-000001', ettn: 'ettn-1' });
  db.systemAlert.create.mockResolvedValue({ id: 'alert_1' });
  db.systemAlert.findMany.mockResolvedValue([]);
  // No buyer fiscal identity by default: that is the state every tenant is in
  // until one is supplied, and in it a payment must complete without an invoice.
  db.tenantBillingIdentity.findUnique.mockResolvedValue(null);
});

describe('conversationId', () => {
  it('round-trips tenant, plan and interval', () => {
    const id = buildConversationId(TENANT, 'pro', 'year');
    expect(parseConversationId(id)).toMatchObject({ tenantId: TENANT, planId: 'pro', interval: 'year' });
  });

  it('rejects a conversationId we did not mint', () => {
    expect(parseConversationId('other:tenant:team:month:xx')).toBeNull();
    expect(parseConversationId('fabrika:tenant:team:weekly:xx')).toBeNull();
    expect(parseConversationId('fabrika:team:month')).toBeNull();
    expect(parseConversationId(undefined)).toBeNull();
  });
});

describe('signature verification', () => {
  it('accepts a correctly signed notification', () => {
    const n = notificationFor(buildConversationId(TENANT, 'pro', 'month'));
    expect(verifyIyzicoSignature(n, signNotification(n, SECRET), SECRET)).toBe(true);
  });

  it('rejects a missing signature', () => {
    const n = notificationFor(buildConversationId(TENANT, 'pro', 'month'));
    expect(verifyIyzicoSignature(n, null, SECRET)).toBe(false);
    expect(verifyIyzicoSignature(n, '', SECRET)).toBe(false);
  });

  it('rejects a body edited after signing', () => {
    const n = notificationFor(buildConversationId(TENANT, 'pro', 'month'));
    const signature = signNotification(n, SECRET);
    const tampered = { ...n, status: 'FAILURE' };
    expect(verifyIyzicoSignature(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const n = notificationFor(buildConversationId(TENANT, 'pro', 'month'));
    expect(verifyIyzicoSignature(n, signNotification(n, 'attacker-secret'), SECRET)).toBe(false);
  });

  it('rejects a wrong-length signature without throwing', () => {
    const n = notificationFor(buildConversationId(TENANT, 'pro', 'month'));
    expect(verifyIyzicoSignature(n, 'deadbeef', SECRET)).toBe(false);
  });
});

describe('buildAuthorizationHeader', () => {
  it('produces the IYZWSv2 header over randomKey + path + body', () => {
    const header = buildAuthorizationHeader(
      { apiKey: 'k', secretKey: 's', baseUrl: 'https://x' },
      '/path',
      '{"a":1}',
      'rnd'
    );
    const decoded = Buffer.from(header.replace('IYZWSv2 ', ''), 'base64').toString('utf8');
    expect(decoded).toContain('apiKey:k');
    expect(decoded).toContain('randomKey:rnd');
    // HMAC-SHA256("s", "rnd" + "/path" + '{"a":1}') — hex, 64 chars.
    expect(decoded).toMatch(/&signature:[0-9a-f]{64}$/);
  });
});

describe('createIyzicoCheckout', () => {
  it('sends the server-side price, not a caller-supplied one', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ status: 'success', token: 'tok_9', paymentPageUrl: 'https://pay/tok_9' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createIyzicoCheckout({
      tenantId: TENANT,
      planId: 'pro',
      interval: 'month',
      buyer: { id: 'u1', name: 'Ada', surname: 'Yılmaz', email: 'ada@example.com' },
      callbackUrl: 'https://app.example.com/tr/billing/iyzico/return',
    });

    expect(result.status).toBe('success');
    expect(result.token).toBe('tok_9');
    expect(result.priceMinor).toBe(tryPriceMinor('pro', 'month'));
    expect(result.currency).toBe('TRY');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sandbox-api.example.test/payment/iyzipos/checkoutform/initialize/auth/ecom');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^IYZWSv2 /);

    const sent = JSON.parse(init.body as string);
    expect(sent.price).toBe('7850.00');
    expect(sent.paidPrice).toBe('7850.00');
    expect(sent.currency).toBe('TRY');
    expect(parseConversationId(sent.conversationId)).toMatchObject({ tenantId: TENANT, planId: 'pro' });
  });

  it('reports a provider failure instead of pretending success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ status: 'failure', errorCode: '5008', errorMessage: 'İmza doğrulanamadı' }),
      { status: 200 }
    )));

    const result = await createIyzicoCheckout({
      tenantId: TENANT,
      planId: 'pro',
      interval: 'month',
      buyer: { id: 'u1', name: 'Ada', surname: 'Yılmaz', email: 'ada@example.com' },
      callbackUrl: 'https://app.example.com/return',
    });

    expect(result.status).toBe('failure');
    expect(result.errorCode).toBe('5008');
    expect(result.token).toBeUndefined();
  });

  it('refuses a plan with no TRY price', async () => {
    await expect(
      createIyzicoCheckout({
        tenantId: TENANT,
        planId: 'free',
        interval: 'month',
        buyer: { id: 'u1', name: 'Ada', surname: 'Yılmaz', email: 'ada@example.com' },
        callbackUrl: 'https://app.example.com/return',
      })
    ).rejects.toThrow(/No TRY price/);
  });
});

describe('handleIyzicoWebhook', () => {
  it('activates the subscription and records an invoice on a successful payment', async () => {
    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId }),
    });

    expect(result).toMatchObject({
      success: true,
      outcome: 'synced',
      tenantId: TENANT,
      planId: 'pro',
      status: 'ACTIVE',
      amountMinor: 785_000,
      currency: 'TRY',
      creditsGranted: 500,
    });

    expect(db.subscription.upsert).toHaveBeenCalledTimes(1);
    const upsert = db.subscription.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ tenantId: TENANT });
    expect(upsert.create).toMatchObject({ provider: 'iyzico', status: 'ACTIVE', planId: 'pro' });

    expect(db.creditLedger.create).toHaveBeenCalledTimes(1);

    const auditTypes = db.auditEvent.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { type: string } }).data.type
    );
    expect(auditTypes).toEqual(['subscription.updated', 'invoice.payment_succeeded']);

    const invoice = db.auditEvent.create.mock.calls[1][0].data.data;
    expect(invoice).toMatchObject({ amountMinor: 785_000, currency: 'TRY', provider: 'iyzico' });
    expect(Number.isInteger(invoice.amountMinor)).toBe(true);
  });

  it('issues no invoice while the tenant has supplied no fiscal identity', async () => {
    // The payment must still go through — a sale that happened stays recorded —
    // but no document may name a taxpayer nobody supplied (TASK-MTRD9QBJ2G32E).
    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId }),
    });

    expect(result).toMatchObject({ success: true, outcome: 'synced', invoiceNumber: null });
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('issues the invoice once the tenant has a fiscal identity', async () => {
    db.tenantBillingIdentity.findUnique.mockResolvedValue({
      buyerName: 'Anadolu Teknoloji A.Ş.',
      buyerVknTckn: '2840958172',
      buyerTaxOffice: 'Doğanbey V.D.',
      buyerAddress: 'ODTÜ Teknokent Blok B',
      buyerCity: 'Ankara',
      buyerCountry: 'Türkiye',
    });
    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId }),
    });

    expect(result).toMatchObject({ success: true, invoiceNumber: 'FB-2026-000001' });
    expect(db.invoice.create).toHaveBeenCalledTimes(1);
    const row = db.invoice.create.mock.calls[0][0].data;
    expect(row).toMatchObject({
      tenantId: TENANT,
      buyerVknTckn: '2840958172',
      currency: 'TRY',
      // Nothing has been filed with GİB, so the row must not claim otherwise.
      gibEnvelopeId: null,
    });
    // ₺7850.00 charged at 20% is stored net; adding the VAT back returns the charge.
    const lines = row.lines as Array<{ unitPriceMinor: number; vatRate: number }>;
    const total = lines.reduce(
      (sum, l) => sum + l.unitPriceMinor + Math.round((l.unitPriceMinor * l.vatRate) / 100),
      0
    );
    expect(total).toBe(785_000);
  });

  it('is idempotent: the same event twice writes once', async () => {
    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const notification = notificationFor(conversationId);
    const retrievePayment = async () => successfulDetail({ conversationId });

    const first = await handleIyzicoWebhook(notification, { retrievePayment });
    expect(first.outcome).toBe('synced');

    // Second delivery: the audit row written by the first one is now found.
    db.auditEvent.findFirst.mockResolvedValue({ id: 'audit_1', tenantId: TENANT });

    const second = await handleIyzicoWebhook(notification, { retrievePayment });
    expect(second).toMatchObject({ success: true, outcome: 'duplicate' });

    expect(db.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(db.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(db.auditEvent.create).toHaveBeenCalledTimes(2);
  });

  it('takes the idempotency key from the provider reference code', () => {
    expect(notificationEventId({ iyziReferenceCode: 'ref-1' } as IyzicoNotification)).toBe('ref-1');
    expect(notificationEventId({ iyziEventType: 'T', paymentId: 9 } as IyzicoNotification)).toBe('T:9');
    expect(notificationEventId({} as IyzicoNotification)).toBeNull();
  });

  it('refuses a notification whose conversationId is not ours', async () => {
    const result = await handleIyzicoWebhook(
      notificationFor('someone-elses-conversation'),
      { retrievePayment: async () => successfulDetail() }
    );

    expect(result).toMatchObject({ success: false, outcome: 'not_attributable' });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  it('refuses a payment the provider reports as unsuccessful, even when the body says SUCCESS', async () => {
    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId, paymentStatus: 'FAILURE' }),
    });

    expect(result).toMatchObject({ success: false, outcome: 'payment_not_successful' });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it('refuses a payment that belongs to a different conversation', async () => {
    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId: buildConversationId('other', 'pro', 'month') }),
    });

    expect(result).toMatchObject({ success: false, outcome: 'not_attributable' });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it('refuses an unknown tenant', async () => {
    db.tenant.findUnique.mockResolvedValue(null);
    const conversationId = buildConversationId('ghost-tenant', 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId }),
    });

    expect(result).toMatchObject({ success: false, outcome: 'unknown_tenant' });
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it('does not re-grant credits when an already-active subscription renews', async () => {
    db.subscription.findUnique.mockResolvedValue({ tenantId: TENANT, planId: 'pro', status: 'ACTIVE' });
    const conversationId = buildConversationId(TENANT, 'pro', 'month');

    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId }),
    });

    expect(result.creditsGranted).toBe(0);
    expect(db.creditLedger.create).not.toHaveBeenCalled();
  });

  it('turns off modules the new plan no longer covers on a downgrade', async () => {
    db.subscription.findUnique.mockResolvedValue({ tenantId: TENANT, planId: 'ultra', status: 'ACTIVE' });
    db.plan.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'ultra'
        ? planRow('ultra', 2000, ['M1', 'M2', 'M3', 'M6', 'M9'])
        : planRow('pro', 500, ['M1', 'M2', 'M3'])
    );

    const conversationId = buildConversationId(TENANT, 'pro', 'month');
    const result = await handleIyzicoWebhook(notificationFor(conversationId), {
      retrievePayment: async () => successfulDetail({ conversationId }),
    });

    expect(result.disabledModules).toEqual(['M6', 'M9']);
    expect(db.moduleState.upsert).toHaveBeenCalledTimes(2);
  });
});
