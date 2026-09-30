/**
 * İNCELEME-75 D-2 (TASK-MUNY0O53ITDU4) — what POST /api/webhooks/stripe tells
 * an unauthenticated caller.
 *
 * The 400 used to be `Webhook Error: Missing STRIPE_WEBHOOK_SECRET` or the SDK's
 * verification text, which told anyone how the endpoint was configured. Stripe
 * retries every non-2xx, so the fix keeps each failure non-2xx and only drops
 * the detail from the body; it stays in the log.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const m = vi.hoisted(() => ({ constructEvent: vi.fn(), retrieve: vi.fn() }));

vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: m.constructEvent };
    subscriptions = { retrieve: m.retrieve };
  },
}));
vi.mock('@/lib/billing/subscription-sync', () => ({
  syncStripeSubscription: vi.fn(async () => {
    throw new Error('Unable to determine tenantId from subscription sub_x');
  }),
  handleSubscriptionCancellation: vi.fn(),
  logInvoicePayment: vi.fn(),
}));
vi.mock('@/lib/billing/lifetime-licence', () => ({ recordLifetimeLicence: vi.fn() }));

async function post(secret: string | undefined) {
  vi.resetModules();
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret ?? '');
  const { POST } = await import('@/app/api/webhooks/stripe/route');
  return POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=x' } }));
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  m.constructEvent.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('stripe webhook failure bodies', () => {
  test('no secret configured: 503, fixed code, not a word about the secret', async () => {
    const res = await post(undefined);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'service_unavailable' });
    expect(text).not.toMatch(/STRIPE|secret/i);
    expect(m.constructEvent).not.toHaveBeenCalled();
  });

  test('bad signature: 400 invalid_signature, the SDK text only in the log', async () => {
    const sdkText = 'No signatures found matching the expected signature for payload. Are you passing the raw request body?';
    m.constructEvent.mockImplementation(() => {
      throw new Error(sdkText);
    });
    const res = await post('whsec_test');
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('invalid_signature');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(sdkText));
  });

  test('a processing failure is still a 500 so Stripe redelivers', async () => {
    m.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_x' } },
    });
    const res = await post('whsec_test');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });
});
