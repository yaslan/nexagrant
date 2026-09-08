import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * TASK-MTSXGXBCJ007W — Fabrika used to carry two LLM adapters. Both wrote
 * `AiUsageLog` and both moved `CreditLedger`, with different formulas: the same
 * 4.000-in / 1.000-out call cost **1** credit through `src/lib/ai/llm.ts` and
 * **7** through `src/lib/llm.ts`, inside the same module (M2), decided purely by
 * which screen the tenant clicked. They also defaulted to different models and
 * hashed prompts to different lengths, so an audit could not join the two sets
 * of rows.
 *
 * These tests hold the merge shut. Reintroduce a second formula, a second
 * default model or a second hash length and they go red.
 */

const mockPrisma = vi.hoisted(() => ({
  aiUsageLog: { create: vi.fn() },
  creditLedger: { aggregate: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: 'sk-ant-test' as string | undefined,
  OPENAI_API_KEY: 'sk-openai-test' as string | undefined,
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import { generateText, generateCompletion, creditsForUsage } from './llm';

/** Stands in for what a tenant actually sends: the prompt must never be stored. */
const SECRET_PROMPT =
  'Draft the impact section for Ayşe Yılmaz, TCKN 12345678901, Horizon Europe başvurusu.';
const SYSTEM_PROMPT = 'You are an expert EU Horizon Europe proposal writer.';

interface StubOptions {
  inputTokens?: number;
  outputTokens?: number;
  /** Content blocks the provider returns, in order. */
  content?: unknown[];
}

function stubAnthropic(opts: StubOptions = {}) {
  const {
    inputTokens = 4000,
    outputTokens = 1000,
    content = [{ type: 'text', text: 'generated section' }],
  } = opts;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The `$transaction(cb)` shape the adapter uses, with the mock delegates. */
function runTransactions() {
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ aiUsageLog: mockPrisma.aiUsageLog, creditLedger: mockPrisma.creditLedger })
  );
}

const baseOptions = {
  tenantId: 'tenant_1',
  userId: 'user_1',
  module: 'M2',
  purpose: 'concept_note_draft',
  prompt: SECRET_PROMPT,
  system: SYSTEM_PROMPT,
};

function usageRow() {
  return mockPrisma.aiUsageLog.create.mock.calls[0]?.[0]?.data;
}
function ledgerRow() {
  return mockPrisma.creditLedger.create.mock.calls[0]?.[0]?.data;
}
function requestBody(fetchMock: ReturnType<typeof stubAnthropic>) {
  return JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.ANTHROPIC_API_KEY = 'sk-ant-test';
  mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
  mockPrisma.aiUsageLog.create.mockResolvedValue({ id: 'log_1' });
  mockPrisma.creditLedger.create.mockResolvedValue({ id: 'ledger_1' });
  runTransactions();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('creditsForUsage — one formula, and only one', () => {
  it('prices the call the card measured (4.000 in / 1.000 out) at a single figure', () => {
    // The whole defect in one line: this used to be 1 on one path and 7 on the
    // other. Whatever the agreed number becomes, there is now exactly one.
    expect(creditsForUsage(4000, 1000)).toBe(1);
  });

  it('never charges less than one credit for a call that reached the provider', () => {
    expect(creditsForUsage(1, 0)).toBe(1);
    expect(creditsForUsage(0, 0)).toBe(1);
  });

  it('scales with total tokens', () => {
    expect(creditsForUsage(12000, 3000)).toBe(2);
    expect(creditsForUsage(100000, 0)).toBe(10);
  });

  it('does not distinguish the two input shapes — only the token counts matter', () => {
    expect(creditsForUsage(3000, 2000)).toBe(creditsForUsage(2000, 3000));
  });
});

describe('generateCompletion — one usage row and one ledger row per call', () => {
  it('writes exactly one AiUsageLog row and one CreditLedger row', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.creditLedger.create).toHaveBeenCalledTimes(1);
  });

  it('charges the ledger exactly what the usage row records, and reports it back', async () => {
    stubAnthropic({ inputTokens: 12000, outputTokens: 3000 });

    const result = await generateCompletion(baseOptions);

    expect(result.credits).toBe(2);
    expect(usageRow().credits).toBe(2);
    expect(ledgerRow().delta).toBe(-2);
  });

  it('records tenant, user, module, purpose, provider, model and token counts', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    const row = usageRow();
    expect(row.tenantId).toBe('tenant_1');
    expect(row.userId).toBe('user_1');
    expect(row.module).toBe('M2');
    expect(row.purpose).toBe('concept_note_draft');
    expect(row.provider).toBe('anthropic');
    expect(row.inputTokens).toBe(4000);
    expect(row.outputTokens).toBe(1000);
  });

  it('books the ledger entry against the proposal it belongs to', async () => {
    stubAnthropic();

    await generateCompletion({ ...baseOptions, proposalId: 'note_9', section: 'impact' });

    expect(ledgerRow().refId).toBe('note_9');
    expect(usageRow().proposalId).toBe('note_9');
    expect(usageRow().section).toBe('impact');
  });
});

describe('promptHash — one format, and the text itself never stored', () => {
  it('is a full 64-digit sha256, not a 16-digit slice', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    expect(usageRow().promptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('covers the system prompt, so two different systems cannot collide', async () => {
    stubAnthropic();
    await generateCompletion(baseOptions);
    const withSystem = usageRow().promptHash;

    vi.clearAllMocks();
    runTransactions();
    mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
    stubAnthropic();
    await generateCompletion({ ...baseOptions, system: 'A completely different system prompt.' });

    expect(usageRow().promptHash).not.toBe(withSystem);
  });

  it('matches an independently computed hash and stores no prompt text', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    const expected = crypto
      .createHash('sha256')
      .update(`system:${SYSTEM_PROMPT}\nuser:${SECRET_PROMPT}`)
      .digest('hex');
    expect(usageRow().promptHash).toBe(expected);

    const serialized = JSON.stringify(usageRow());
    expect(serialized).not.toContain(SECRET_PROMPT);
    expect(serialized).not.toContain('Ayşe Yılmaz');
    expect(serialized).not.toContain('12345678901');
  });

  it('hashes the same conversation identically whichever input shape built it', async () => {
    // This is the merge itself: `{prompt, system}` (the six module call sites)
    // and `{messages}` (the concept-notes screen) are now one path, so an audit
    // can join their rows. Before the merge they produced hashes of different
    // *lengths*.
    stubAnthropic();
    await generateCompletion(baseOptions);
    const fromPrompt = usageRow().promptHash;
    const creditsFromPrompt = usageRow().credits;

    vi.clearAllMocks();
    runTransactions();
    mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
    stubAnthropic();
    await generateCompletion({
      tenantId: 'tenant_1',
      userId: 'user_1',
      module: 'M2',
      purpose: 'concept_note_draft',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: SECRET_PROMPT },
      ],
    });

    expect(usageRow().promptHash).toBe(fromPrompt);
    expect(usageRow().credits).toBe(creditsFromPrompt);
  });
});

describe('the two input shapes are one billing path', () => {
  /** Run one call in each shape and hand back what each one was charged. */
  async function chargeBothShapes(inputTokens: number, outputTokens: number) {
    stubAnthropic({ inputTokens, outputTokens });
    await generateCompletion(baseOptions);
    const fromPrompt = { credits: usageRow().credits, hash: usageRow().promptHash };

    vi.clearAllMocks();
    runTransactions();
    mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
    stubAnthropic({ inputTokens, outputTokens });
    await generateCompletion({
      tenantId: 'tenant_1',
      userId: 'user_1',
      module: 'M2',
      purpose: 'concept_note_draft',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: SECRET_PROMPT },
      ],
    });
    const fromMessages = { credits: usageRow().credits, hash: usageRow().promptHash };
    return { fromPrompt, fromMessages };
  }

  it('charges the same for the call the card measured — 1 credit, not 1 and 7', async () => {
    const { fromPrompt, fromMessages } = await chargeBothShapes(4000, 1000);

    expect(fromMessages.credits).toBe(fromPrompt.credits);
    expect(fromMessages.credits).toBe(1);
  });

  it('charges the same on a large RAG-sized call, where the old gap widened to 10x', async () => {
    const { fromPrompt, fromMessages } = await chargeBothShapes(12000, 3000);

    expect(fromMessages.credits).toBe(fromPrompt.credits);
    expect(fromMessages.credits).toBe(2);
  });

  it('hashes both shapes to the same 64 digits, so an audit can join their rows', async () => {
    const { fromPrompt, fromMessages } = await chargeBothShapes(4000, 1000);

    expect(fromMessages.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fromPrompt.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fromMessages.hash).toBe(fromPrompt.hash);
  });
});

describe('the provider request', () => {
  it('never sends temperature — the current models reject a sampling parameter', async () => {
    const fetchMock = stubAnthropic();

    await generateCompletion(baseOptions);

    const body = requestBody(fetchMock);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
  });

  it('uses one default model for both input shapes', async () => {
    const fetchMock = stubAnthropic();
    await generateCompletion(baseOptions);
    const modelFromPrompt = requestBody(fetchMock).model;

    vi.clearAllMocks();
    runTransactions();
    mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
    const fetchMock2 = stubAnthropic();
    await generateCompletion({
      tenantId: 'tenant_1',
      module: 'M6',
      purpose: 'evaluation',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(requestBody(fetchMock2).model).toBe(modelFromPrompt);
    expect(usageRow().model).toBe(modelFromPrompt);
  });

  it('lifts the system prompt out of the message list, as the API expects', async () => {
    const fetchMock = stubAnthropic();

    await generateCompletion(baseOptions);

    const body = requestBody(fetchMock);
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.messages).toEqual([{ role: 'user', content: SECRET_PROMPT }]);
  });
});

describe('reading the answer back', () => {
  it('finds the text block by type, not by position', async () => {
    // The current models may put a thinking block first. `content[0].text` would
    // hand the caller an empty draft and still charge for it.
    stubAnthropic({
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'the real answer' },
      ],
    });

    expect(await generateText(baseOptions)).toBe('the real answer');
  });

  it('returns the text alone through generateText', async () => {
    stubAnthropic();
    expect(await generateText(baseOptions)).toBe('generated section');
  });
});

describe('credits and failures', () => {
  it('refuses the call when the tenant has no credits, and reaches no provider', async () => {
    const fetchMock = stubAnthropic();
    mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 0 } });

    await expect(generateCompletion(baseOptions)).rejects.toThrow(/Insufficient AI credits/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });

  it('retries a rate limit and still charges once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateCompletion({ ...baseOptions, prompt: 'x' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('ok');
    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
  }, 10_000);

  it('fails a missing API key immediately instead of retrying a config fault', async () => {
    const fetchMock = stubAnthropic();
    mockEnv.ANTHROPIC_API_KEY = undefined;

    await expect(generateCompletion(baseOptions)).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
  });

  it('does not retry a bad request, and charges nothing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateCompletion(baseOptions)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockPrisma.aiUsageLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.creditLedger.create).not.toHaveBeenCalled();
  });
});
