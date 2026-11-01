import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MULQLQIE3ES6G — the prompts moved out of the call sites (CLAUDE.md rule 5)
 * into src/lib/ai/prompts/. The move must not change a single byte the model sees.
 *
 * This file drives every one of the 14 prompts through its real call site and
 * snapshots exactly what reaches `@/lib/llm` — `prompt`, `system`, or the
 * `messages` array. The snapshot file was written by this test against the code
 * *before* the move (the inline literals) and then left untouched; after the move
 * the same test, unchanged, must still match it. `rag.ts`'s `formatRagPrompt` is
 * pure and is called directly.
 *
 * Every LLM mock records its argument and then throws: nothing after the model
 * call matters here, and each call site's own tests cover that half.
 */

const h = vi.hoisted(() => {
  const captured: unknown[] = [];
  class Stop extends Error {}
  const capture = (arg: unknown) => {
    captured.push(arg);
    throw new Stop('captured');
  };
  const opportunity = { id: 'opp-1', title: 'Soil sensing for smart farms', topicId: 'topic-1' };
  const tx = new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          { get: () => async () => opportunity }
        ),
    }
  );
  return { captured, Stop, capture, opportunity, tx };
});

vi.mock('@/lib/llm', () => ({
  generateText: vi.fn(async (arg: unknown) => h.capture(arg)),
  generateCompletion: vi.fn(async (arg: unknown) => h.capture(arg)),
}));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: vi.fn(async () => ({ tenantId: 'tenant-1', userId: 'user-1' })),
}));
vi.mock('@/lib/modules/access', () => ({ assertModuleAccess: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({
  withTenant: vi.fn(async (_t: string, fn: (tx: unknown) => unknown) => fn(h.tx)),
  assertTenantScope: vi.fn(),
  prisma: {
    topic: {
      findUnique: vi.fn(async () => ({ title: 'Digital agriculture', identifier: 'HORIZON-CL6-2026-01' })),
    },
  },
}));
vi.mock('@/lib/rag', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/rag')>();
  return {
    ...real,
    retrieveChunks: vi.fn(async () => [
      { text: 'Prior pilot on 40 farms.', score: 0.9, documentId: 'd1' },
      { text: 'Sensor patent EP123.', score: 0.8, documentId: 'd2' },
    ]),
    buildRagPrompt: vi.fn(async (q: string) =>
      real.formatRagPrompt(q, [{ text: 'Prior pilot on 40 farms.', score: 0.91 }])
    ),
  };
});
vi.mock('@/modules/m2/server/templates', () => ({
  findAccessibleTemplate: vi.fn(async () => ({ id: 'tpl-1', schema: [] })),
  templateSections: vi.fn(() => [
    { key: 'objectives', label: 'Objectives', promptKey: 'Describe the objectives.', maxWords: 250 },
  ]),
}));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn(async () => undefined) }));
vi.mock('@/lib/calendar/sync', () => ({ syncMeetingBriefToCalendar: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

async function captureFrom(run: () => Promise<unknown>): Promise<unknown> {
  h.captured.length = 0;
  try {
    await run();
  } catch {
    // Stop (or whatever the call site turns it into) — the capture is what counts.
  }
  expect(h.captured).toHaveLength(1);
  return h.captured[0];
}

/** Only the prompt-bearing fields; tenant/user/purpose are not what moved. */
function promptOf(arg: unknown) {
  const a = arg as { prompt?: string; system?: string; messages?: unknown };
  return { prompt: a.prompt, system: a.system, messages: a.messages };
}

beforeEach(() => {
  h.captured.length = 0;
});

describe('prompt text is byte-identical to the pre-move inline literals', () => {
  test('M6 ESR parser (prompt + system)', async () => {
    const { parseEsrDocumentText } = await import('@/modules/m6/server/esr-parser');
    const arg = await captureFrom(() =>
      parseEsrDocumentText('Excellence 4.5\nImpact 4.0\nImplementation 3.5', 'tenant-1', 'user-1')
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('M6 AI evaluation (prompt + system)', async () => {
    const { generateAiEvaluation } = await import('@/modules/m6/server/actions');
    const arg = await captureFrom(() => generateAiEvaluation('cm0opportunity0000000001'));
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('M7 IP checklist (prompt + system)', async () => {
    const { generateIpChecklist } = await import('@/modules/m7/server/actions');
    const arg = await captureFrom(() =>
      generateIpChecklist({ title: 'Soil sensor array', trl: 4, patentStatus: 'granted' })
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('M9 meeting brief (prompt + system)', async () => {
    const { generateMeetingBrief } = await import('@/modules/m9/server/actions');
    const arg = await captureFrom(() =>
      generateMeetingBrief({
        interactionId: 'int-1',
        partnerName: 'Fraunhofer IGD',
        callTopic: 'HORIZON-CL6-2026-01',
      })
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('M10 standard document (prompt + system)', async () => {
    const { generateStandardDoc } = await import('@/modules/m10/server/actions');
    const arg = await captureFrom(() => generateStandardDoc('opp-1', 'NDA'));
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('M2 concept note section (prompt)', async () => {
    const { generateConceptNoteDraft } = await import('@/modules/m2/server/actions');
    const arg = await captureFrom(() =>
      generateConceptNoteDraft('opp-1', 'tpl-1', { budget: '2M EUR', partners: 'TR, DE' })
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('concept-notes section draft (system + user messages)', async () => {
    const { generateSectionDraft } = await import('@/app/[locale]/(app)/[workspace]/concept-notes/actions');
    const arg = await captureFrom(() =>
      generateSectionDraft('note-1', 'impact', 'Expected Impact', 300, 'Soil sensing for smart farms')
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test('RAG context wrapper (formatRagPrompt)', async () => {
    const { formatRagPrompt } = await import('@/lib/rag');
    expect(
      formatRagPrompt('What did the pilot measure?', [
        { text: 'Pilot on 40 farms.', score: 0.912 },
        { text: 'Yield +12%.', score: 0.5 },
      ])
    ).toMatchSnapshot();
    // No context → the question passes through untouched.
    expect(formatRagPrompt('Bare question', [])).toBe('Bare question');
  });
});

/**
 * FO-188 — M17 was written with its prompts in place (no inline literal to match),
 * in both locales. These snapshots pin the text the model sees; a change to them
 * is a behaviour change and is updated on purpose (`vitest -u`), never in passing.
 */
describe('M17 Interreg pre-assessment prompts (tr + en)', () => {
  test.each(['en', 'tr'] as const)('call context, evaluate and retry — %s', async (locale) => {
    const { renderPrompt } = await import('@/lib/ai/prompts');
    expect({
      callContext: renderPrompt('m17/call-context', { call_context: 'CALL GUIDE TEXT' }, locale),
      evaluate: renderPrompt('m17/evaluate', { rubric: '{"id":"rubric"}', project_context: 'PROJECT TEXT' }, locale),
      retry: renderPrompt('m17/evaluate-retry', { problems: '- criterionMarks: missing' }, locale),
    }).toMatchSnapshot();
  });
});
