import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * TASK-MTSXGXBCJ007W — FonBridge used to carry two LLM adapters. Both wrote
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
  creditLedger: { aggregate: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  withTenant: vi.fn(),
}));

/**
 * TASK-MTSYH8LDGV5YU — only `withTenant` is exported here, deliberately. Every
 * table this adapter touches is FORCE ROW LEVEL SECURITY with
 * `WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))`, and
 * `withTenant` is the only thing that sets that GUC. A write through the global
 * `prisma` client is refused by Postgres with 42501 in production while passing
 * every mocked test. So the mock has no `prisma` export: reintroduce one and
 * the suite goes red here instead of on the first real deployment.
 */
vi.mock('@/lib/db', () => ({ withTenant: mockPrisma.withTenant }));

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: 'sk-ant-test' as string | undefined,
  OPENAI_API_KEY: 'sk-openai-test' as string | undefined,
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import {
  generateText,
  generateCompletion,
  creditsForUsage,
  resolveCredits,
  UnpricedAiActionError,
  AiUsageLogWriteError,
} from './llm';

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

/** The `withTenant(tenantId, cb)` shape the adapter uses, with the mock delegates. */
function runTransactions() {
  mockPrisma.withTenant.mockImplementation(
    async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) =>
      cb({ aiUsageLog: mockPrisma.aiUsageLog, creditLedger: mockPrisma.creditLedger, $executeRaw: async () => 0 })
  );
}

/** Tenant ids `withTenant` was opened with, in call order. */
function tenantScopes(): string[] {
  return mockPrisma.withTenant.mock.calls.map((c: unknown[]) => c[0] as string);
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
/** Sum of every ledger movement written: a reserved and then refunded call nets to 0. */
function netLedgerMovement(): number {
  return mockPrisma.creditLedger.create.mock.calls.reduce((sum, c) => sum + (c[0]?.data?.delta ?? 0), 0);
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
  // FO-288: the reservation is a debit row; its refund looks the debit up by refId.
  mockPrisma.creditLedger.findFirst.mockImplementation(async (args: { where: { delta?: unknown } }) => (args.where.delta ? { delta: -1 } : null));
  runTransactions();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('creditsForUsage — the published price, and only the published price', () => {
  /**
   * Owner decision "option C" (TASK-MTSXGXBCJ007W): the ledger moves by the
   * figure docs/BILLING.md §1 sells, not by one derived from token counts.
   *
   * The table below IS §1. If these numbers and that document ever disagree,
   * the product is charging a price it does not publish — which is the whole
   * defect this card closes, in its second form.
   */
  const PUBLISHED: ReadonlyArray<[string, string, number]> = [
    ['M1', 'profile_summary', 1],
    ['M2', 'concept_note_draft', 1],
    ['M3', 'source_summary', 1],
    ['M6', 'evaluation', 3],
    ['M9', 'meeting_brief', 1],
    ['M10', 'document_generation_lou', 1],
    ['M11', 'section_draft', 2],
  ];

  it.each(PUBLISHED)('charges %s/%s the %i credit(s) BILLING.md §1 sells', (module, purpose, credits) => {
    expect(creditsForUsage({ module, purpose })).toBe(credits);
  });

  it('ignores the token counts entirely — the same action costs the same', () => {
    // The old formula returned 1 here and 10 there. That is precisely what a
    // customer could not predict from the price list, so it had to go.
    const cheap = creditsForUsage({ module: 'M6', purpose: 'evaluation', inputTokens: 1, outputTokens: 0 });
    const vast = creditsForUsage({ module: 'M6', purpose: 'evaluation', inputTokens: 400_000, outputTokens: 90_000 });
    expect(cheap).toBe(3);
    expect(vast).toBe(3);
  });

  it('prices a purpose the call site builds from data by its module', () => {
    // M2 sends `Drafting section: ${key}` and M10 `document_generation_${kind}`,
    // so no purpose-keyed table could ever have covered them.
    expect(creditsForUsage({ module: 'M2', purpose: 'Drafting section: impact' })).toBe(1);
    expect(creditsForUsage({ module: 'M10', purpose: 'document_generation_consortium_agreement' })).toBe(1);
  });

  it('lets a purpose override beat its module', () => {
    expect(creditsForUsage({ module: 'M6', purpose: 'evaluation' })).toBe(3);
    expect(creditsForUsage({ module: 'M6', purpose: 'esr-parser' })).toBe(0);
  });

  describe('figures the owner has not signed off', () => {
    // Two live call sites have no figure in §1. They are priced, because an
    // unpriced action cannot be billed at all — but `published: false` is the
    // machine-readable record that a customer never agreed to these.
    it('M7 tto_ip_checklist is 1, and marked unpublished', () => {
      const quote = resolveCredits('M7', 'tto_ip_checklist');
      expect(quote).toEqual({ credits: 1, published: false });
    });

    it('M6 esr-parser is 0, and marked unpublished', () => {
      const quote = resolveCredits('M6', 'esr-parser');
      expect(quote).toEqual({ credits: 0, published: false });
    });

    it('marks the seven §1 figures as published, so the two above stand out', () => {
      for (const [module, purpose] of PUBLISHED) {
        expect(resolveCredits(module, purpose).published).toBe(true);
      }
    });
  });

  describe('an action nobody priced', () => {
    // The two silent defaults are both wrong: 0 gives away provider spend and
    // leaves a deliberate-looking row; 1 invents a price no document sells.
    it('refuses an unknown module rather than guessing', () => {
      expect(() => creditsForUsage({ module: 'M4', purpose: 'anything' })).toThrow(UnpricedAiActionError);
    });

    it('names the action and the two files that have to change', () => {
      expect(() => creditsForUsage({ module: 'M99', purpose: 'new_thing' })).toThrow(
        /M99:new_thing.*catalog\.ts.*BILLING\.md/s
      );
    });

    it('does not treat the empty string as a module', () => {
      expect(() => creditsForUsage({ module: '', purpose: '' })).toThrow(UnpricedAiActionError);
    });
  });
});

describe('generateCompletion — refuses an unpriced action before spending money', () => {
  it('never reaches the provider when the action has no catalogue entry', async () => {
    const fetchMock = stubAnthropic();

    await expect(
      generateCompletion({ ...baseOptions, module: 'M4', purpose: 'unpriced' })
    ).rejects.toThrow(UnpricedAiActionError);

    // The point of pricing up front: the refusal is free. Resolving the price
    // after the response would have paid for a call we cannot bill or log.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generateCompletion — every database touch is tenant-scoped (RLS)', () => {
  // TASK-MTSYH8LDGV5YU. Measured against the NOBYPASSRLS role `fabrika_app`:
  // the balance read returned 0 outside the wrapper (a 500-credit row existed)
  // and the usage/ledger insert was refused with 42501. Neither showed up under
  // the local SUPERUSER role, so only these assertions keep it from coming back.

  it('reads the credit balance inside a tenant scope, not through the global client', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    // The balance read is the first thing the adapter does. Unscoped it reads a
    // confident 0 and the caller is told to buy credits it already owns.
    expect(tenantScopes()[0]).toBe('tenant_1');
    expect(mockPrisma.creditLedger.aggregate).toHaveBeenCalledTimes(1);
  });

  it('writes the usage row and the ledger row inside the caller tenant scope', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    // Two scopes: the balance read, then the write transaction. Both are the
    // tenant the call was made for — never a default and never unset.
    expect(tenantScopes()).toEqual(['tenant_1', 'tenant_1']);
  });

  it('scopes to the tenant that was passed, not to a hardcoded one', async () => {
    stubAnthropic();

    await generateCompletion({ ...baseOptions, tenantId: 'tenant_other' });

    expect(new Set(tenantScopes())).toEqual(new Set(['tenant_other']));
    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant_other' }) })
    );
  });

  it('keeps the usage row and the ledger row in ONE scope, so neither can land alone', async () => {
    stubAnthropic();

    await generateCompletion(baseOptions);

    // Both writes come from a single withTenant call: one transaction, one
    // rollback boundary. Splitting them would let a charge survive a failed
    // usage row (or the reverse) and silently break the billing audit trail.
    const writeScopeCalls = mockPrisma.withTenant.mock.calls.filter(
      (c: unknown[]) => typeof c[1] === 'function'
    );
    expect(writeScopeCalls).toHaveLength(2); // balance read + write transaction
    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.creditLedger.create).toHaveBeenCalledTimes(1);
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
    // A deliberately large response: under the old token formula this was 2
    // credits. M2 is sold at 1 (BILLING.md §1), so 1 is what all three say.
    stubAnthropic({ inputTokens: 12000, outputTokens: 3000 });

    const result = await generateCompletion(baseOptions);

    expect(result.credits).toBe(1);
    expect(usageRow().credits).toBe(1);
    expect(ledgerRow().delta).toBe(-1);
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

    // FO-288: the ledger row's refId is the call's own reservation key (unique per call, so its
    // refund finds exactly its own debit). The proposal link lives on the usage row.
    expect(ledgerRow()).toMatchObject({ reason: 'usage:M2', delta: -1 });
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
    // 1, the same as the small call above: since option C the response size is
    // recorded on the row but is not what the tenant is charged for.
    expect(fromMessages.credits).toBe(1);
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
    // The SAME action as baseOptions (M2), sent in the other input shape — the
    // two adapters used to default to different models, and that is what this
    // holds shut. A different action may legitimately use a different model;
    // see the override test below.
    await generateCompletion({
      tenantId: 'tenant_1',
      module: 'M2',
      purpose: 'concept_note_draft',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(modelFromPrompt).toBe('claude-sonnet-5');
    expect(requestBody(fetchMock2).model).toBe(modelFromPrompt);
    expect(usageRow().model).toBe(modelFromPrompt);
  });

  it('serves the M6 evaluation with the Opus-class model, and records that', async () => {
    // The product's most expensive action (3 credits) and the only override.
    // ASSUMPTION on the card, revertible in one line — see MODEL_OVERRIDES.
    const fetchMock = stubAnthropic();

    await generateCompletion({
      tenantId: 'tenant_1',
      module: 'M6',
      purpose: 'evaluation',
      prompt: 'Evaluate this call.',
    });

    expect(requestBody(fetchMock).model).toBe('claude-opus-5');
    // The row must name the model actually used, or a cost audit is fiction.
    expect(usageRow().model).toBe('claude-opus-5');
    expect(usageRow().credits).toBe(3);
  });

  it('lets an explicit model beat the override', async () => {
    const fetchMock = stubAnthropic();

    await generateCompletion({
      tenantId: 'tenant_1',
      module: 'M6',
      purpose: 'evaluation',
      prompt: 'Evaluate this call.',
      model: 'claude-haiku-4-5-20251001',
    });

    expect(requestBody(fetchMock).model).toBe('claude-haiku-4-5-20251001');
  });

  it('does not send an Anthropic model id to OpenAI', async () => {
    // The override table is Anthropic's. Applying it to another provider would
    // send `claude-opus-5` to /v1/chat/completions and 400 the whole action.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        choices: [{ message: { content: 'x' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateCompletion({
      tenantId: 'tenant_1',
      module: 'M6',
      purpose: 'evaluation',
      prompt: 'Evaluate this call.',
      provider: 'openai',
    });

    expect(requestBody(fetchMock).model).toBe('gpt-4o');
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
    expect(netLedgerMovement()).toBe(0);
  });
});

/**
 * TASK-MTVBM0C2QWPCL — `embedText` already names this failure; the generation
 * path, which spends 3x the credits, did not. Once `callProvider` returns, the
 * tenant's prompt has reached Anthropic and the bill is incurred, so a thrown
 * raw Prisma error is indistinguishable from one raised *before* the call — the
 * caller cannot tell "nothing happened" from "we paid and recorded nothing".
 *
 * These tests hold the two branches apart. Mirror of `llm.embed.test.ts`.
 */
describe('generateCompletion — an unrecorded paid call is named, not raw', () => {
  it('reports a failed AiUsageLog write as AiUsageLogWriteError', async () => {
    // The prompt has already reached the provider at this point. A bare
    // `Error: db down` here reads exactly like a pre-call database fault.
    stubAnthropic();
    mockPrisma.aiUsageLog.create.mockRejectedValue(new Error('db down'));

    await expect(generateCompletion(baseOptions)).rejects.toBeInstanceOf(AiUsageLogWriteError);
  });

  it('a failed reservation is a plain error, and the provider is never called', async () => {
    // FO-288: the price is reserved BEFORE the provider, so a failed ledger write here means nothing
    // was spent. It must not wear AiUsageLogWriteError, which promises "paid and unrecorded".
    const fetchMock = stubAnthropic();
    mockPrisma.creditLedger.create.mockRejectedValue(new Error('db down'));

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(AiUsageLogWriteError);
    expect((error as Error).message).toBe('db down');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an RLS refusal on the bookkeeping transaction as a log-write failure', async () => {
    // What production throws when `app.tenant_id` is not set for the write.
    stubAnthropic();
    const refusal = Object.assign(
      new Error('new row violates row-level security policy for table "AiUsageLog"'),
      { code: 'P2039' }
    );
    mockPrisma.withTenant.mockImplementation(
      async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
        // The balance read must still succeed — only the post-call write fails,
        // otherwise this would be testing a pre-call fault again.
        if (mockPrisma.withTenant.mock.calls.length > 1) throw refusal;
        return cb({ aiUsageLog: mockPrisma.aiUsageLog, creditLedger: mockPrisma.creditLedger, $executeRaw: async () => 0 });
      }
    );

    await expect(generateCompletion(baseOptions)).rejects.toBeInstanceOf(AiUsageLogWriteError);
  });

  it('carries the original database error as `cause`', async () => {
    stubAnthropic();
    const original = Object.assign(new Error('db down'), { code: 'P2002' });
    mockPrisma.aiUsageLog.create.mockRejectedValue(original);

    await expect(generateCompletion(baseOptions)).rejects.toMatchObject({ cause: original });
  });

  it('does NOT name a pre-call database failure as AiUsageLogWriteError', async () => {
    // The distinguishing test. `getCreditBalance` fails the same way, through
    // the same `withTenant` wrapper, but nothing has been paid for yet — so
    // treating it as an unrecorded-paid-call would be a false alarm, and a
    // blanket try/catch around the whole function would produce exactly that.
    const fetchMock = stubAnthropic();
    mockPrisma.creditLedger.aggregate.mockRejectedValue(new Error('db down'));

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AiUsageLogWriteError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT name a provider rejection as AiUsageLogWriteError', async () => {
    // Nothing was charged and nothing needed logging: a 400 is a caller fault,
    // not a bookkeeping fault.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' })
    );

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AiUsageLogWriteError);
  });
});
