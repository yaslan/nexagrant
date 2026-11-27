import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * TASK-MUN4PSBP19RKK — `callProvider` never read `stop_reason`. A document the
 * model stopped writing at the 4096-token ceiling ("…and will notify TÜB") was
 * returned as the answer, saved, and charged; a refusal was charged too. The
 * default model did this to M10 AWARD_PACK in 2 of 3 measured runs
 * (docs/agent-results/TASK-MUN3FWZWT11MX-se-fb.md §2).
 *
 * These tests hold the four Anthropic stop reasons and the OpenAI equivalents
 * to one rule: a finished answer is returned and charged; a cut-off or declined
 * one is thrown, recorded with credits 0, and moves no credit.
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

const mockEnv = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: 'sk-ant-test' as string | undefined,
  OPENAI_API_KEY: 'sk-openai-test' as string | undefined,
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

import {
  generateCompletion,
  generateText,
  maxTokensFor,
  LlmTruncatedError,
  LlmRefusalError,
  AiUsageLogWriteError,
} from './llm';
import { isLlmRefused, isLlmTruncated, LLM_REFUSED_DIGEST, LLM_TRUNCATED_DIGEST } from './llm-outcome';

const baseOptions = {
  tenantId: 'tenant_1',
  userId: 'user_1',
  module: 'M10',
  purpose: 'document_generation_award_pack',
  prompt: 'Draft the award pack.',
  system: 'You are a grants officer.',
};

function stubAnthropic(stopReason: string | undefined, extra: Record<string, unknown> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: stopReason === 'refusal' ? [] : [{ type: 'text', text: '…and will notify TÜB' }],
      ...(stopReason === undefined ? {} : { stop_reason: stopReason }),
      usage: { input_tokens: 500, output_tokens: stopReason === 'max_tokens' ? 8192 : 3000 },
      ...extra,
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubOpenAI(finishReason: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'partial' }, finish_reason: finishReason }],
      usage: { prompt_tokens: 500, completion_tokens: 3000 },
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Sum of every ledger movement written: a reserved and then refunded call nets to 0. */
function netLedgerMovement(): number {
  return mockPrisma.creditLedger.create.mock.calls.reduce((sum, c) => sum + (c[0]?.data?.delta ?? 0), 0);
}
function usageRow() {
  return mockPrisma.aiUsageLog.create.mock.calls[0]?.[0]?.data;
}
function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
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
  mockPrisma.withTenant.mockImplementation(
    async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) =>
      cb({ aiUsageLog: mockPrisma.aiUsageLog, creditLedger: mockPrisma.creditLedger, $executeRaw: async () => 0 })
  );
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Anthropic stop_reason — finished answers', () => {
  it.each(['end_turn', 'stop_sequence'])('%s: returns the text, reports the reason, charges the price', async (reason) => {
    stubAnthropic(reason);

    const result = await generateCompletion(baseOptions);

    expect(result.stopReason).toBe(reason);
    expect(result.text).toBe('…and will notify TÜB');
    expect(result.credits).toBe(1);
    expect(usageRow().credits).toBe(1);
    expect(mockPrisma.creditLedger.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.creditLedger.create.mock.calls[0]?.[0]?.data.delta).toBe(-1);
  });

  it('an absent stop_reason is treated as finished, as before this card', async () => {
    stubAnthropic(undefined);
    const result = await generateCompletion(baseOptions);
    expect(result.stopReason).toBeNull();
    expect(result.credits).toBe(1);
  });
});

describe('Anthropic stop_reason — max_tokens (cut off)', () => {
  it('throws LlmTruncatedError instead of returning half a document', async () => {
    stubAnthropic('max_tokens');

    const err = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmTruncatedError);
    expect((err as LlmTruncatedError).detail).toMatchObject({
      module: 'M10',
      stopReason: 'max_tokens',
      outputTokens: 8192,
      maxTokens: 8192,
    });
  });

  it('generateText throws too — no call site can receive the fragment as a string', async () => {
    stubAnthropic('max_tokens');
    await expect(generateText(baseOptions)).rejects.toBeInstanceOf(LlmTruncatedError);
  });

  it('moves no credit, and still records the call with credits 0', async () => {
    stubAnthropic('max_tokens');

    await expect(generateCompletion(baseOptions)).rejects.toThrow(/cut off at the length limit/);

    expect(netLedgerMovement()).toBe(0);
    expect(mockPrisma.aiUsageLog.create).toHaveBeenCalledTimes(1);
    expect(usageRow()).toMatchObject({ credits: 0, outputTokens: 8192, module: 'M10' });
  });

  it('refunds the reservation even when the usage row fails to write (FO-310 Y-1)', async () => {
    // The refund is its own transaction, so a failing AiUsageLog insert must not roll it back.
    stubAnthropic('max_tokens');
    mockPrisma.aiUsageLog.create.mockRejectedValue(new Error('db down'));

    const error = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiUsageLogWriteError);
    expect(mockPrisma.creditLedger.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.creditLedger.create.mock.calls[1]?.[0]?.data).toMatchObject({ delta: 1, reason: 'refund:M10' });
    expect(netLedgerMovement()).toBe(0);
  });

  it('carries the digest the browser receives in production', async () => {
    stubAnthropic('max_tokens');
    const err = await generateCompletion(baseOptions).catch((e: unknown) => e);
    expect((err as { digest: string }).digest).toBe(LLM_TRUNCATED_DIGEST);
    expect(isLlmTruncated(err)).toBe(true);
    expect(isLlmRefused(err)).toBe(false);
  });

  it('is not retried — the same prompt would be cut off the same way, and billed again', async () => {
    const fetchMock = stubAnthropic('max_tokens');
    await expect(generateCompletion(baseOptions)).rejects.toBeInstanceOf(LlmTruncatedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats model_context_window_exceeded as a cut-off too', async () => {
    stubAnthropic('model_context_window_exceeded');
    await expect(generateCompletion(baseOptions)).rejects.toBeInstanceOf(LlmTruncatedError);
    expect(netLedgerMovement()).toBe(0);
  });
});

describe('Anthropic stop_reason — refusal', () => {
  it('throws LlmRefusalError with the category, charges nothing, records credits 0', async () => {
    const fetchMock = stubAnthropic('refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } });

    const err = await generateCompletion(baseOptions).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmRefusalError);
    expect((err as LlmRefusalError).category).toBe('cyber');
    expect((err as { digest: string }).digest).toBe(LLM_REFUSED_DIGEST);
    expect(isLlmRefused(err)).toBe(true);
    expect(netLedgerMovement()).toBe(0);
    expect(usageRow()).toMatchObject({ credits: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tolerates a refusal with no stop_details (branch on stop_reason, not details)', async () => {
    stubAnthropic('refusal');
    const err = await generateCompletion(baseOptions).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRefusalError);
    expect((err as LlmRefusalError).category).toBeNull();
  });
});

describe('OpenAI finish_reason — the same rule', () => {
  const openai = { ...baseOptions, provider: 'openai' as const };

  it('stop: returns and charges', async () => {
    stubOpenAI('stop');
    const result = await generateCompletion(openai);
    expect(result.stopReason).toBe('stop');
    expect(result.credits).toBe(1);
    expect(mockPrisma.creditLedger.create).toHaveBeenCalledTimes(1);
  });

  it('length: LlmTruncatedError, no credit, row with credits 0', async () => {
    stubOpenAI('length');
    await expect(generateCompletion(openai)).rejects.toBeInstanceOf(LlmTruncatedError);
    expect(netLedgerMovement()).toBe(0);
    expect(usageRow()).toMatchObject({ credits: 0, provider: 'openai' });
  });

  it('content_filter: LlmRefusalError, no credit', async () => {
    stubOpenAI('content_filter');
    await expect(generateCompletion(openai)).rejects.toBeInstanceOf(LlmRefusalError);
    expect(netLedgerMovement()).toBe(0);
  });
});

describe('output ceiling per action', () => {
  it('gives the long-document modules M7 and M10 8192 tokens, everyone else 4096', () => {
    expect(maxTokensFor('M10', 'document_generation_award_pack')).toBe(8192);
    expect(maxTokensFor('M10', 'document_generation_nda')).toBe(8192);
    expect(maxTokensFor('M7', 'tto_ip_checklist')).toBe(8192);
    expect(maxTokensFor('M2', 'concept_note_draft')).toBe(4096);
    expect(maxTokensFor('M9', 'meeting_brief')).toBe(4096);
    expect(maxTokensFor('M6', 'evaluation')).toBe(4096);
  });

  it('lets an explicit maxTokens win', () => {
    expect(maxTokensFor('M10', 'document_generation_nda', 1000)).toBe(1000);
  });

  it('sends the per-action ceiling to the provider', async () => {
    const fetchMock = stubAnthropic('end_turn');
    await generateCompletion(baseOptions);
    expect(requestBody(fetchMock).max_tokens).toBe(8192);

    vi.clearAllMocks();
    mockPrisma.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: 500 } });
    const fetchMock2 = stubAnthropic('end_turn');
    await generateCompletion({ ...baseOptions, module: 'M2', purpose: 'concept_note_draft' });
    expect(requestBody(fetchMock2).max_tokens).toBe(4096);
  });
});
