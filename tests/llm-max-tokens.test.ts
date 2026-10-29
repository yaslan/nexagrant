import { describe, expect, test, vi } from 'vitest';

/**
 * FO-188 — the output ceiling of the M17 evaluate calls. Round 2 of the real run cut
 * the Turkish object at 12 288 tokens (stop_reason max_tokens), so both evaluate
 * purposes take 24 576; every other action keeps its previous ceiling.
 */

vi.mock('@/lib/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key', OPENAI_API_KEY: undefined } }));

const { maxTokensFor } = await import('@/lib/llm');

describe('maxTokensFor — M17 evaluate calls', () => {
  test('evaluate-attempt and evaluate-retry both take 24 576', () => {
    expect(maxTokensFor('M17', 'evaluate-attempt')).toBe(24576);
    expect(maxTokensFor('M17', 'evaluate-retry')).toBe(24576);
  });

  test('an explicit ceiling still wins over the table', () => {
    expect(maxTokensFor('M17', 'evaluate-attempt', 1000)).toBe(1000);
  });
});

describe('maxTokensFor — other actions are unchanged', () => {
  test('M7 and M10 keep 8192', () => {
    expect(maxTokensFor('M7', 'anything')).toBe(8192);
    expect(maxTokensFor('M10', 'AWARD_PACK')).toBe(8192);
  });

  test('an unlisted action falls back to the default 4096', () => {
    expect(maxTokensFor('M4', 'unpriced')).toBe(4096);
  });
});
