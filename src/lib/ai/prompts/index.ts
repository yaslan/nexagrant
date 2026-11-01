import m10StandardDocEn from './m10/standard-doc.en';
import m10StandardDocSystemEn from './m10/standard-doc-system.en';
import m17CallContextEn from './m17/call-context.en';
import m17CallContextTr from './m17/call-context.tr';
import m17EvaluateEn from './m17/evaluate.en';
import m17EvaluateTr from './m17/evaluate.tr';
import m17EvaluateRetryEn from './m17/evaluate-retry.en';
import m17EvaluateRetryTr from './m17/evaluate-retry.tr';
import m2ConceptNoteSectionEn from './m2/concept-note-section.en';
import m2SectionDraftSystemEn from './m2/section-draft-system.en';
import m2SectionDraftUserEn from './m2/section-draft-user.en';
import m6EsrParseEn from './m6/esr-parse.en';
import m6EsrParseSystemEn from './m6/esr-parse-system.en';
import m6EvaluationEn from './m6/evaluation.en';
import m6EvaluationSystemEn from './m6/evaluation-system.en';
import m7IpChecklistEn from './m7/ip-checklist.en';
import m7IpChecklistSystemEn from './m7/ip-checklist-system.en';
import m9MeetingBriefEn from './m9/meeting-brief.en';
import m9MeetingBriefSystemEn from './m9/meeting-brief-system.en';
import ragRetrievedContextEn from './rag/retrieved-context.en';

/**
 * The one place prompt text is loaded from (CLAUDE.md rule 5, ROADMAP open
 * decision #19 — TASK-MULQLQIE3ES6G).
 *
 * Every prompt lives in its own file, `<module>/<name>.<locale>.ts`, whose only
 * export is the template. A prompt edit is therefore a diff of that file and
 * nothing else. `.ts` rather than `.md` on purpose: the app builds with
 * `output: 'standalone'`, and a file read at run time by a computed path is not
 * traced into the bundle, so an `.md` would work in dev and be missing in
 * production. An import is traced and type-checked.
 *
 * Placeholders are `{{name}}`. Each prompt declares its variables below; a
 * placeholder the prompt does not declare, or a declared variable the caller
 * does not pass, throws — a half-filled prompt is never sent.
 *
 * Locale: `renderPrompt` takes the caller's locale (see `promptLocale()` in
 * ./locale.ts) and falls back to `en`. Every prompt but M17's exists in `en`
 * only — the text is the pre-move text byte for byte, including the language
 * instructions baked into some of them — so their output is the same for every
 * locale until a `<name>.tr.ts` is added and registered here. Adding one is a
 * behaviour change and is reviewed as such. M17 (FO-188) was written with both,
 * and tests/prompt-snapshots.test.ts pins both.
 */

/**
 * The app's locales (src/i18n/routing.ts). Not imported from there: that module
 * also builds next-intl's navigation helpers, which pull `next/navigation` into
 * every server action and test that loads a prompt. prompts.test.ts pins the two
 * lists together.
 */
export const PROMPT_LOCALES = ['en', 'tr'] as const;
export const DEFAULT_PROMPT_LOCALE = 'tr' satisfies PromptLocale;
export type PromptLocale = (typeof PROMPT_LOCALES)[number];

/** The language every prompt is written in; the fallback for a missing locale. */
export const PROMPT_SOURCE_LOCALE: PromptLocale = 'en';

interface PromptDef {
  vars: readonly string[];
  text: { en: string } & Partial<Record<PromptLocale, string>>;
}

const PROMPTS = {
  'm6/esr-parse': { vars: ['documentText'], text: { en: m6EsrParseEn } },
  'm6/esr-parse-system': { vars: [], text: { en: m6EsrParseSystemEn } },
  'm6/evaluation': { vars: ['opportunityId'], text: { en: m6EvaluationEn } },
  'm6/evaluation-system': { vars: [], text: { en: m6EvaluationSystemEn } },
  'm7/ip-checklist': { vars: ['title', 'trl', 'patentStatus'], text: { en: m7IpChecklistEn } },
  'm7/ip-checklist-system': { vars: [], text: { en: m7IpChecklistSystemEn } },
  'm9/meeting-brief': { vars: ['partnerName', 'callTopic'], text: { en: m9MeetingBriefEn } },
  'm9/meeting-brief-system': { vars: [], text: { en: m9MeetingBriefSystemEn } },
  'm10/standard-doc': { vars: ['kind', 'opportunityTitle'], text: { en: m10StandardDocEn } },
  'm10/standard-doc-system': { vars: [], text: { en: m10StandardDocSystemEn } },
  // M17 Interreg pre-assessment (FO-188): stage 1 = call guide as system context, stage 2 = project vs grid.
  'm17/call-context': { vars: ['call_context'], text: { en: m17CallContextEn, tr: m17CallContextTr } },
  'm17/evaluate': { vars: ['rubric', 'project_context'], text: { en: m17EvaluateEn, tr: m17EvaluateTr } },
  'm17/evaluate-retry': { vars: ['problems'], text: { en: m17EvaluateRetryEn, tr: m17EvaluateRetryTr } },
  'm2/concept-note-section': {
    vars: ['topicTitle', 'topicIdentifier', 'opportunityTitle', 'inputsJson', 'context', 'task', 'maxWords'],
    text: { en: m2ConceptNoteSectionEn },
  },
  'm2/section-draft-system': { vars: ['maxWords'], text: { en: m2SectionDraftSystemEn } },
  'm2/section-draft-user': {
    vars: ['sectionLabel', 'opportunityTitle', 'ragPrompt', 'maxWords'],
    text: { en: m2SectionDraftUserEn },
  },
  'rag/retrieved-context': { vars: ['context', 'question'], text: { en: ragRetrievedContextEn } },
} as const satisfies Record<string, PromptDef>;

export type PromptId = keyof typeof PROMPTS;
export type PromptVars<I extends PromptId> = Record<(typeof PROMPTS)[I]['vars'][number], string | number>;

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

/** Every registered prompt id — for tests that check each template against its declaration. */
export const PROMPT_IDS = Object.keys(PROMPTS) as PromptId[];

/** The raw template text for a locale (or the `en` fallback), placeholders unfilled. */
export function promptTemplate(id: PromptId, locale: string = PROMPT_SOURCE_LOCALE): string {
  const def: PromptDef = PROMPTS[id];
  return def.text[locale as PromptLocale] ?? def.text.en;
}

/** The variables a prompt declares. */
export function promptVars(id: PromptId): readonly string[] {
  return PROMPTS[id].vars;
}

/**
 * Fill a prompt. Values are inserted verbatim in a single pass — a value that
 * itself contains `{{x}}` or `$&` is not expanded, exactly as the template
 * literals these prompts used to be.
 */
export function renderPrompt<I extends PromptId>(id: I, vars: PromptVars<I>, locale?: string): string {
  const declared = new Set<string>(PROMPTS[id].vars);
  const given = vars as Record<string, string | number | undefined>;
  for (const name of declared) {
    if (given[name] === undefined) throw new PromptTemplateError(`Prompt ${id}: variable "${name}" was not passed`);
  }
  return promptTemplate(id, locale).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (!declared.has(name)) throw new PromptTemplateError(`Prompt ${id}: placeholder "{{${name}}}" is not declared`);
    return String(given[name]);
  });
}
