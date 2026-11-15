import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MULQLQIE3ES6G — the prompts moved out of the call sites (CLAUDE.md rule 5)
 * into src/lib/ai/prompts/. The move must not change a single byte the model sees.
 *
 * This file drives every one of the 14 prompts through its real call site and
 * snapshots exactly what reaches `@/lib/llm` — `prompt`, `system`, or the
 * `messages` array. The snapshot file was written by this test against the code
 * *before* the move (the inline literals) and then left untouched; after the move
 * the same test, unchanged, must still match it. `rag.ts`'s `formatRagContext` is
 * pure and is called directly.
 *
 * NG-40 changed the non-M17 texts on purpose (instructions and data apart), and
 * their snapshots with them; tests/ai-instruction-data-separation.test.ts is what
 * pins that separation. M17's snapshots were not touched.
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
  const opportunity = {
    id: 'opp-1',
    title: 'Soil sensing for smart farms',
    topicId: 'topic-1',
    // M6 reads Part B through the same stubbed findFirst (NG-98).
    content: { sections: [{ title: '1.1 Objectives', content: 'Validate soil sensors on 40 farms.' }] },
  };
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
    buildRagContext: vi.fn(async () => real.formatRagContext([{ text: 'Prior pilot on 40 farms.', score: 0.91 }])),
  };
});
vi.mock('@/modules/m2/server/templates', async (importOriginal) => ({
  sectionsWithWordLimit: (await importOriginal<typeof import('@/modules/m2/server/templates')>()).sectionsWithWordLimit,
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

  test('RAG context (formatRagContext)', async () => {
    const { formatRagContext } = await import('@/lib/rag');
    expect(
      formatRagContext([
        { text: 'Pilot on 40 farms.', score: 0.912 },
        { text: 'Yield +12%.', score: 0.5 },
      ])
    ).toMatchSnapshot();
    expect(formatRagContext([])).toBe('');
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

/**
 * NG-136 (M18-F5) — enrichment and the eligibility pre-report were written with their prompts in
 * place, in both locales. Driven through the real call sites (`proposeEnrichment`,
 * `createEligibilityReport`) up to `@/lib/llm`; the site fetch, the credit reservation and the DRAFT
 * write are stubs, no network, no database.
 */
describe('M18 enrichment and eligibility pre-report prompts (tr + en)', () => {
  const org = {
    id: 'org-1',
    name: 'Anadolu Sensör',
    legalName: null,
    district: null,
    provinceCode: '06',
    website: 'https://anadolu-sensor.example.com.tr',
    sizeBand: null,
    themes: [],
    sectorCodes: [],
  };
  // `@/lib/llm` is mocked whole here, so the reservation (ai-credits.ts) is stubbed at its seam.
  const credits = { reserve: async () => ({ refId: 'ref-1', credits: 1 }), release: async () => {} };

  test.each(['en', 'tr'] as const)('enrich-organization — %s', async (locale) => {
    const { proposeEnrichment } = await import('@/modules/m18/server/enrichment');
    const arg = await captureFrom(() =>
      proposeEnrichment(
        { tenantId: 'tenant-1', userId: 'user-1', org, locale },
        {
          fetchSite: async () => ({
            ok: true,
            pages: [{ url: 'https://anadolu-sensor.example.com.tr/', text: 'Anadolu Sensör A.Ş. — Ankara, Çankaya. 40 çalışan.' }],
            skipped: [],
          }),
          credits,
        },
      ),
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });

  test.each(['en', 'tr'] as const)('eligibility-pre-report — %s', async (locale) => {
    const { createEligibilityReport } = await import('@/modules/m18/server/eligibility');
    const subject = {
      org: { ...org, orgType: 'SME', nuts2: 'TR51', themes: ['sensors'], sectorCodes: ['C26.5'] },
      call: {
        id: 'call-1',
        title: 'Digital SMEs',
        callIdentifier: 'DIGITAL-2026-SME-01',
        programme: 'Digital Europe',
        eligibleApplicantTypes: ['SME'],
        eligibleRegions: [],
        cofinancingRateBp: 5000,
        topics: [],
      },
    };
    const arg = await captureFrom(() =>
      createEligibilityReport({ tenantId: 'tenant-1', userId: 'user-1', subject, locale }, { credits, save: async () => ({ id: 'r-1' }) }),
    );
    expect(promptOf(arg)).toMatchSnapshot();
  });
});
