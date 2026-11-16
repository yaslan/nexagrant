import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from 'vitest';

/**
 * NG-209 — the e2e fake provider (`E2E_FAKE_AI=true`), the one seam that lets a browser click reach
 * the whole AI path (reserve → "provider" → AiUsageLog → result) without any model being called.
 *
 *  - it lives in src/lib/llm.ts only: the reservation, the AiUsageLog row and the price are the
 *    real ones; only the HTTP request to the provider is replaced;
 *  - no provider key is needed and `fetch` is never called;
 *  - default-deny (NG-209 sec F1): on only for the literal flag `true`, in a build that is not a
 *    production build, with NODE_ENV explicitly `development` or `test`. Any other NODE_ENV —
 *    `production`, `staging`, `preview`, blank, unset — keeps it off, and `assertFakeAiAllowed`
 *    (server start) refuses such a server when the flag is on.
 *  - the build-time half is the module's own `process.env.NODE_ENV` constant, not a parameter
 *    (sec F6): these tests load llm.ts afresh under a given NODE_ENV to exercise it.
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
// `declaredNodeEnv` is NODE_ENV as the process set it (undefined when unset), while `env.NODE_ENV`
// carries the schema default 'development'. The mock keeps both, like src/lib/env.ts.
const declared = vi.hoisted(() => ({ nodeEnv: 'test' as string | undefined }));
vi.mock('@/lib/env', () => ({
  env: mockEnv,
  get declaredNodeEnv() {
    return declared.nodeEnv;
  },
}));

import { assertFakeAiAllowed, fakeAiEnabled, FakeAiNotAllowedError, generateCompletion } from './llm';

/** llm.ts evaluated afresh with process.env.NODE_ENV = `nodeEnv` at load: the build-time constant. */
async function loadLlmBuiltWith(nodeEnv: string): Promise<typeof import('./llm')> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  try {
    return await import('./llm');
  } finally {
    vi.unstubAllEnvs();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.E2E_FAKE_AI = undefined;
  mockEnv.NODE_ENV = 'test';
  declared.nodeEnv = 'test';
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

describe('fakeAiEnabled — default-deny: development or test only (sec F1)', () => {
  it('is on only for the literal `true` with NODE_ENV development or test', () => {
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV: 'development' })).toBe(true);
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV: 'test' })).toBe(true);
    expect(fakeAiEnabled({ E2E_FAKE_AI: 'false', NODE_ENV: 'development' })).toBe(false);
    expect(fakeAiEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('is off for every other NODE_ENV: production, staging, preview, blank, unset', () => {
    for (const NODE_ENV of ['production', 'staging', 'preview', '', 'Development', undefined]) {
      expect(fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV }), String(NODE_ENV)).toBe(false);
    }
  });

  it('reads NODE_ENV as the process declared it: unset is off, not the schema default "development"', () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'development'; // what env.ts parses an absent NODE_ENV to
    declared.nodeEnv = undefined;
    expect(fakeAiEnabled()).toBe(false);
    declared.nodeEnv = 'development';
    expect(fakeAiEnabled()).toBe(true);
  });
});

describe('the build-time lock — the real module constant, no parameter (sec F2/F6)', () => {
  it('a module built with NODE_ENV=production keeps the fake off whatever the runtime NODE_ENV says', async () => {
    const built = await loadLlmBuiltWith('production');
    for (const NODE_ENV of ['development', 'test']) {
      expect(built.fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV }), NODE_ENV).toBe(false);
      expect(() => built.assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV }), NODE_ENV).toThrow(built.FakeAiNotAllowedError);
    }
    expect(() => built.assertFakeAiAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('a module built with NODE_ENV=test lets the e2e combination through', async () => {
    const built = await loadLlmBuiltWith('test');
    expect(built.fakeAiEnabled({ E2E_FAKE_AI: 'true', NODE_ENV: 'development' })).toBe(true);
    expect(() => built.assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV: 'development' })).not.toThrow();
  });

  it('takes no build parameter: no caller can pass the lock open (checked by tsc)', () => {
    expectTypeOf<Parameters<typeof fakeAiEnabled>['length']>().toEqualTypeOf<0 | 1>();
    expectTypeOf<Parameters<typeof assertFakeAiAllowed>['length']>().toEqualTypeOf<0 | 1>();
  });
});

describe('assertFakeAiAllowed — a server with the flag on starts only in development or test', () => {
  it('throws for every NODE_ENV other than development and test', () => {
    for (const NODE_ENV of ['production', 'staging', 'preview', '', undefined]) {
      expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV }), String(NODE_ENV)).toThrow(FakeAiNotAllowedError);
    }
  });

  it('throws when NODE_ENV is unset, even though env.NODE_ENV defaults to "development"', () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'development';
    declared.nodeEnv = undefined;
    expect(() => assertFakeAiAllowed()).toThrow(FakeAiNotAllowedError);
  });

  it('names the environment it refused in the message', () => {
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV: 'staging' })).toThrow(/E2E_FAKE_AI.*NODE_ENV=staging/s);
  });

  it('lets every other combination start', () => {
    expect(() => assertFakeAiAllowed({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'false', NODE_ENV: 'staging' })).not.toThrow();
    expect(() => assertFakeAiAllowed({ NODE_ENV: undefined })).not.toThrow();
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertFakeAiAllowed({ E2E_FAKE_AI: 'true', NODE_ENV: 'test' })).not.toThrow();
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
    declared.nodeEnv = 'production';
    await expect(generateCompletion(options)).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });

  it('is not used when NODE_ENV is unset, even with the flag on (sec F1)', async () => {
    mockEnv.E2E_FAKE_AI = 'true';
    mockEnv.NODE_ENV = 'development';
    declared.nodeEnv = undefined;
    await expect(generateCompletion(options)).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });
});
