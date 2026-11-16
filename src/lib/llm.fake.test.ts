import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NG-209 — the e2e fake provider (`E2E_FAKE_AI=true`), the one seam that lets a browser click reach
 * the whole AI path (reserve → "provider" → AiUsageLog → result) without any model being called.
 *
 *  - it lives in src/lib/llm.ts only: the reservation, the AiUsageLog row and the price are the
 *    real ones; only the HTTP request to the provider is replaced;
 *  - no provider key is needed and `fetch` is never called;
 *  - it can never be on in production: `fakeAiEnabled` is false for a production build or
 *    NODE_ENV=production, and `assertFakeAiAllowed` (called at server start) refuses such a server.
 */

const mockPrisma = vi.hoisted(() => ({
  aiUsageLog: { create: vi.fn() },
  creditLedger: { aggregate: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  withTenant: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ withTenant: mockPrisma.withTenant }));

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: undefined as string | undefined,
  OPENAI_API_KEY: undefined as string | undefined,
  E2E_FAKE_AI: undefined as string | undefined,
  NODE_ENV: 'test' as string,
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import { assertFakeAiAllowed, fakeAiEnabled, FakeAiInProductionError, generateCompletion } from './llm';

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.E2E_FAKE_AI = undefined;
  mockEnv.NODE_ENV = 'test';
  mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 10 } });
  mockPrisma.aiUsageLog.create.mockResolvedValue({ id: 'log_1' });
  mockPrisma.creditLedger.create.mockResolvedValue({ id: 'ledger_1' });
  mockPrisma.creditLedger.findFirst.mockResolvedValue(null);
  mockPrisma.withTenant.mockImplementation(async (_t: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({ aiUsageLog: mockPrisma.aiUsageLog, creditLedger: mockPrisma.creditLedger, $executeRaw: async () => 0 }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fakeAiEnabled — on only where it was asked for and is not production', () => {
  it('is on only for the literal `true` outside production', () => {
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV: 'development' }, false)).toBe(true);
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV: 'test' }, false)).toBe(true);
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'false', NODE_ENV: 'development' }, false)).toBe(false);
    expect(fakeAiEnabled({ NODE_ENV: 'development' }, false)).toBe(false);
  });

  it('is off with NODE_ENV=production, whatever the flag says', () => {
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV: 'production' }, false)).toBe(false);
  });

  it('is off in a production build started with any NODE_ENV', () => {
    for (const NODE_ENV of ['development', 'test', 'production'] as const) {
      expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV }, true)).toBe(false);
    }
  });
});

describe('assertFakeAiAllowed — a production server with the flag on does not start', () => {
  it('throws with NODE_ENV=production and the flag on', () => {
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV: 'production' }, false)).toThrow(FakeAiInProductionError);
  });

  it('throws in a production build whatever NODE_ENV says', () => {
    for (const NODE_ENV of ['development', 'test'] as const) {
      expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV }, true)).toThrow(FakeAiInProductionError);
    }
  });

  it('lets every other combination start', () => {
    expect(() => assertFakeAiAllowed({ NODE_ENV: 'production' }, true)).not.toThrow();
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'false', NODE_ENV: 'production' }, true)).not.toThrow();
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV: 'development' }, false)).not.toThrow();
  });
});

describe('generateCompletion with the fake provider', () => {
  const options = {
    tenantId: 'tenant_1',
    userId: 'user_1',
    module: 'M18',
    purpose: 'enrich-organization',
    prompt: 'organisation: Acme',
    system: 'system text',
  };

  it('answers without a provider key and without any network request, and still bills and logs', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    const fetchMock = vi.fn(async () => {
      throw new Error('network must not be reached');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateCompletion(options);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.provider).toBe('fake');
    expect(result.text.length).toBeGreaterThan(0);
    // The real price was reserved (one debit row) and the usage row says "fake".
    expect(mockPrisma.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.creditLedger.create.mock.calls[0]?.[0]?.data).toMatchObject({ tenantId: 'tenant_1', delta: -1, reason: 'usage:M18' });
    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.aiUsageLog.create.mock.calls[0]?.[0]?.data).toMatchObject({ provider: 'fake', module: 'M18', purpose: 'enrich-organization', credits: 1 });
  });

  it('gives the M18 enrichment attempt a JSON proposal the parser can read', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    vi.stubGlobal('fetch', vi.fn());
    const result = await generateCompletion({ ...options, purpose: 'enrich-organization-attempt', creditsReserved: true });
    const json = JSON.parse(result.text.slice(result.text.indexOf('{'), result.text.lastIndexOf('}') + 1));
    expect(json).toMatchObject({ legalName: expect.any(String), sizeBand: expect.any(String) });
  });

  it('is not used when the flag is off: no key is still a hard failure, before any charge', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateCompletion(options)).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
  });

  it('is not used in production even with the flag on', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'production';
    await expect(generateCompletion(options)).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });
});
