import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * FO-319 — a reserved call whose answer is not delivered (truncated, refused, or rejected by the
 * provider) gives its reservation back. Two holes in that path, both about what the caller is told:
 *
 *  - Y-3: the usage row is written, then the refund fails. The debit stays, and the caller was told
 *    "AiUsageLog row and credit deduction could not be written" — false, the row IS written. The
 *    refund is retried; if it still fails, an operator alert is recorded, and the caller gets the
 *    real outcome (truncated / refused) rather than a bookkeeping message.
 *  - Ö-3: a provider error reaches the catch, the refund fails inside it, and the refund error
 *    replaces the provider error. The original error must reach the caller; the refund failure is
 *    logged and alerted.
 */

const mockPrisma = vi.hoisted(() => ({
  aiUsageLog: { create: vi.fn() },
  creditLedger: { aggregate: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  withTenant: vi.fn(),
}));
// NG-250: the NexaGrant AI allowance has its own tests (usage.test.ts, ng250-plan-gate.live,
// llm.ng-quota.test.ts); here it is a pass, so this file's fake tx needs no NexaGrant tables.
vi.mock('@/lib/billing/nexagrant/usage', () => ({ assertNgAiQuota: async () => undefined }));
vi.mock('@/lib/db', () => ({ withTenant: mockPrisma.withTenant }));

const mockAlert = vi.hoisted(() => ({ recordAlert: vi.fn() }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: mockAlert.recordAlert }));

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: 'sk-ant-test' as string | undefined,
  OPENAI_API_KEY: 'sk-openai-test' as string | undefined,
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import { generateCompletion, AiUsageLogWriteError, LlmTruncatedError } from './llm';

const baseOptions = {
  tenantId: 'tenant_1',
  userId: 'user_1',
  module: 'M2',
  purpose: 'concept_note_draft',
  prompt: 'Draft the impact section.',
  system: 'You are an expert EU Horizon Europe proposal writer.',
};

/** Makes the next `n` refund writes (reason `refund:<module>`) fail; every other write succeeds. */
function failRefunds(n: number) {
  let left = n;
  mockPrisma.creditLedger.create.mockImplementation(async (args: { data: { reason: string } }) => {
    if (args.data.reason.startsWith('refund:') && left > 0) {
      left -= 1;
      throw new Error('refund write refused');
    }
    return { id: 'ledger_x' };
  });
}

function refundWrites() {
  return mockPrisma.creditLedger.create.mock.calls.filter(c => String(c[0]?.data?.reason).startsWith('refund:'));
}

function stubAnthropic(stopReason: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      stop_reason: stopReason,
      content: [{ type: 'text', text: 'partial' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.ANTHROPIC_API_KEY = 'sk-ant-test';
  mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
  mockPrisma.aiUsageLog.create.mockResolvedValue({ id: 'log_1' });
  mockPrisma.creditLedger.create.mockResolvedValue({ id: 'ledger_1' });
  mockPrisma.creditLedger.findFirst.mockImplementation(async (args: { where: { delta?: unknown } }) =>
    args.where.delta ? { delta: -1 } : null
  );
  mockPrisma.withTenant.mockImplementation(async (_t: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({ aiUsageLog: mockPrisma.aiUsageLog, creditLedger: mockPrisma.creditLedger, $executeRaw: async () => 0 })
  );
  mockAlert.recordAlert.mockResolvedValue({ status: 'recorded', id: 'alert_1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FO-319 Y-3 — a refund that does not land is retried, alerted, and not called a log failure', () => {
  it('a refund that fails once and then lands is retried; the reservation nets to zero and nothing is alerted', async () => {
    stubAnthropic('max_tokens');
    failRefunds(1);

    await expect(generateCompletion(baseOptions)).rejects.toBeInstanceOf(LlmTruncatedError);

    expect(refundWrites()).toHaveLength(2);
    expect(mockAlert.recordAlert).not.toHaveBeenCalled();
  });

  it('a refund that keeps failing leaves the debit standing, records an alert, and reports the real outcome', async () => {
    stubAnthropic('max_tokens');
    failRefunds(99);

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    // The usage row IS written, so the bookkeeping message would be false. The caller learns the
    // answer was cut off, which is the reason the reservation is still owed back.
    expect(error).toBeInstanceOf(LlmTruncatedError);
    expect(error).not.toBeInstanceOf(AiUsageLogWriteError);
    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
    expect(refundWrites()).toHaveLength(3);
    expect(mockAlert.recordAlert).toHaveBeenCalledTimes(1);
    const [alert] = mockAlert.recordAlert.mock.calls[0] as [{ level: string; source: string; meta: Record<string, unknown> }];
    expect(alert.level).toBe('error');
    expect(alert.source).toBe('llm-refund');
    // No tenant id: SystemAlert is outside RLS by design (see system-alert.ts).
    expect(JSON.stringify(alert)).not.toContain('tenant_1');
  });
});

describe('FO-329 — one unrefunded reservation, one open alert, per reservation', () => {
  it('two unrefunded reservations of the same module and purpose record two alerts, each keyed to its own reservation', async () => {
    stubAnthropic('max_tokens');
    failRefunds(99);

    await generateCompletion(baseOptions).catch(() => undefined);
    await generateCompletion(baseOptions).catch(() => undefined);

    expect(mockAlert.recordAlert).toHaveBeenCalledTimes(2);
    const alerts = mockAlert.recordAlert.mock.calls.map(
      c => c[0] as { dedupeKey: string; meta: { reservation: string } }
    );
    const keys = alerts.map(a => a.dedupeKey);
    // Distinct dedupe keys: the second reservation must not fold into the first open alert.
    expect(new Set(keys).size).toBe(2);
    // Each alert's key names the reservation it reports, so the operator can reconcile every one.
    for (const a of alerts) {
      expect(a.dedupeKey).toContain(a.meta.reservation);
    }
  });

  it('R2 — the extra latency a failing refund adds to the call path is bounded and measured', async () => {
    stubAnthropic('max_tokens');
    failRefunds(99);

    const started = Date.now();
    await generateCompletion(baseOptions).catch(() => undefined);
    const elapsedMs = Date.now() - started;

    // Three refund writes with 200 ms and 400 ms backoff between them: ~600 ms of sleep, plus the
    // write work. Measured here so the report carries a number, not an estimate.
    console.info(`[FO-329 R2] refund-failure path added ${elapsedMs} ms to generateCompletion`);
    expect(elapsedMs).toBeGreaterThanOrEqual(600);
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('FO-319 Ö-3 — a refund failure never replaces the provider error', () => {
  it('a provider rejection keeps its own error when the refund also fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' }));
    // The reservation is taken, then the provider rejects; the refund fails on every try.
    failRefunds(99);

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/Anthropic API error 400/);
    expect(error).not.toBeInstanceOf(AiUsageLogWriteError);
    expect(mockAlert.recordAlert).toHaveBeenCalledTimes(1);
  });

  it('a provider rejection with a healthy refund still propagates the provider error unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' }));

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/Anthropic API error 400/);
    expect(refundWrites()).toHaveLength(1);
    expect(mockAlert.recordAlert).not.toHaveBeenCalled();
  });
});
