import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-99: a tenant template's `maxWords` can be a fraction or above the prompt's
 * ceiling. The section still shows in the editor, so the "AI draft" button has to
 * refuse it the way the M2 path does: `InvalidTemplateSectionError`, before the RAG
 * lookup and before the model, which is where the credits go.
 */

const h = vi.hoisted(() => ({
  buildRagContext: vi.fn(async () => 'retrieved context'),
  generateCompletion: vi.fn(async () => ({ text: 'draft', inputTokens: 1, outputTokens: 1, credits: 1 })),
}));

vi.mock('@/lib/rag', () => ({ buildRagContext: h.buildRagContext }));
vi.mock('@/lib/llm', () => ({ generateCompletion: h.generateCompletion }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn(async () => ({ tenantId: 'tenant-1', userId: 'user-1' })),
}));
vi.mock('@/lib/modules/access', () => ({ assertModuleAccess: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai/prompts/locale', () => ({ promptLocale: vi.fn(async () => 'en') }));
vi.mock('@/lib/db', () => ({
  assertTenantScope: vi.fn(),
  prisma: {},
  withTenant: vi.fn(async () => undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { generateSectionDraft } from '@/app/[locale]/(app)/[workspace]/concept-notes/actions';
import { InvalidTemplateSectionError, invalidTemplateSectionKey } from '@/modules/m2/invalid-section';

const draft = (maxWords: unknown) =>
  generateSectionDraft('note-1', 'objectives', 'Objectives', maxWords as number, 'Opportunity');

beforeEach(() => {
  h.buildRagContext.mockClear();
  h.generateCompletion.mockClear();
});

describe('generateSectionDraft word limit', () => {
  test.each([
    ['a fraction', 1500.5],
    ['above the ceiling', 25000],
    ['zero', 0],
    ['NaN', Number.NaN],
  ])('%s is refused by section, with no RAG lookup and no model call', async (_name, maxWords) => {
    const error = await draft(maxWords).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidTemplateSectionError);
    expect(invalidTemplateSectionKey(error)).toBe('objectives');
    expect(h.buildRagContext).not.toHaveBeenCalled();
    expect(h.generateCompletion).not.toHaveBeenCalled();
  });

  // The action is a public POST: `maxWords` can be any type. `Number(true)` is 1 and
  // `Number("1e3")` is 1000, so only a number or digits-only text may pass.
  test.each([
    ['the text "abc"', 'abc'],
    ['the empty text', ''],
    ['the boolean true', true],
    ['the exponent text "1e3"', '1e3'],
    ['the hex text "0x10"', '0x10'],
    ['the padded text " 25 "', ' 25 '],
  ])('%s is refused by section, with no RAG lookup and no model call', async (_name, maxWords) => {
    const error = await draft(maxWords).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidTemplateSectionError);
    expect(invalidTemplateSectionKey(error)).toBe('objectives');
    expect(h.buildRagContext).not.toHaveBeenCalled();
    expect(h.generateCompletion).not.toHaveBeenCalled();
  });

  test('digits-only text "1500" is drafted as 1500 words', async () => {
    const result = await draft('1500');

    expect(result.text).toBe('draft');
    expect(h.generateCompletion).toHaveBeenCalledTimes(1);
  });

  test('the ceiling itself, 20000, is drafted', async () => {
    const result = await draft(20000);

    expect(result.text).toBe('draft');
    expect(h.buildRagContext).toHaveBeenCalledTimes(1);
    expect(h.generateCompletion).toHaveBeenCalledTimes(1);
  });
});
