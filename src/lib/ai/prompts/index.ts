import m10StandardDocEn from './m10/standard-doc.en';
import m17CallContextEn from './m17/call-context.en';
import m17CallContextTr from './m17/call-context.tr';
import m17EvaluateEn from './m17/evaluate.en';
import m17EvaluateTr from './m17/evaluate.tr';
import m17EvaluateRetryEn from './m17/evaluate-retry.en';
import m17EvaluateRetryTr from './m17/evaluate-retry.tr';
import m2ConceptNoteSectionEn from './m2/concept-note-section.en';
import m2SectionDraftEn from './m2/section-draft.en';
import m6EsrParseEn from './m6/esr-parse.en';
import m6EvaluationEn from './m6/evaluation.en';
import m7IpChecklistEn from './m7/ip-checklist.en';
import m9MeetingBriefEn from './m9/meeting-brief.en';
import sharedUntrustedDataRuleEn from './shared/untrusted-data-rule.en';

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
 *
 * Instructions and data travel apart outside M17 (NG-40, spec §18.3): the
 * template holds only instructions and goes in `system`, and whatever a user, an
 * uploaded document or a tenant-owned template supplied goes, fenced, in the user
 * message. {@link separatedPrompt} is the way to build such a request.
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
  'm6/esr-parse': { vars: [], text: { en: m6EsrParseEn } },
  'm6/evaluation': { vars: [], text: { en: m6EvaluationEn } },
  'm7/ip-checklist': { vars: [], text: { en: m7IpChecklistEn } },
  'm9/meeting-brief': { vars: [], text: { en: m9MeetingBriefEn } },
  'm10/standard-doc': { vars: [], text: { en: m10StandardDocEn } },
  // M17 Interreg pre-assessment (FO-188): stage 1 = call guide as system context, stage 2 = project vs grid.
  'm17/call-context': { vars: ['call_context'], text: { en: m17CallContextEn, tr: m17CallContextTr } },
  'm17/evaluate': { vars: ['rubric', 'project_context'], text: { en: m17EvaluateEn, tr: m17EvaluateTr } },
  'm17/evaluate-retry': { vars: ['problems'], text: { en: m17EvaluateRetryEn, tr: m17EvaluateRetryTr } },
  'm2/concept-note-section': { vars: ['maxWords'], text: { en: m2ConceptNoteSectionEn } },
  'm2/section-draft': { vars: ['maxWords'], text: { en: m2SectionDraftEn } },
  'shared/untrusted-data-rule': { vars: [], text: { en: sharedUntrustedDataRuleEn } },
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

/** A prompt whose template is instructions only (M17 fences its own documents). */
type SeparatedPromptId = Exclude<PromptId, `m17/${string}` | 'shared/untrusted-data-rule'>;

const DATA_TAG = 'user_data';
const DATA_FIELD_RE = /^[a-z_]+$/;

/**
 * The `<` of anything that reads as our tag: either case, with or without a slash,
 * spaced, or with invisible characters or a separator slipped in. `\W` covers those
 * inside the name; the class before it covers the characters around the slash.
 */
const DATA_TAG_RE = /<(?=[\s​-‍⁠﻿]*\/?[\s​-‍⁠﻿]*user[\W_]*data(?![\w-]))/gi;

/**
 * A value that writes `</user_data>` would close its block early and what follows
 * would read as the prompt's own text. Same cure as M17's `neutralizeFenceTags`: the
 * `<` becomes the full-width `＜`, one character for one.
 */
function neutralizeDataTags(text: string): string {
  return text.replace(DATA_TAG_RE, '＜');
}

function fenceData(data: Record<string, string | number>): string {
  return Object.entries(data)
    .map(([field, value]) => {
      if (!DATA_FIELD_RE.test(field)) throw new PromptTemplateError(`Data field "${field}" is not a valid name`);
      if (value === undefined) throw new PromptTemplateError(`Data field "${field}" was not passed`);
      return `<${DATA_TAG} field="${field}">\n${neutralizeDataTags(String(value))}\n</${DATA_TAG}>`;
    })
    .join('\n');
}

/**
 * One model request with its instructions and its data apart (NG-40): the `system`
 * and `prompt` of `generateText` / `generateCompletion`.
 *
 * `instructions` fill the template, so only finite numbers are accepted, at run
 * time too: a server action is a public POST endpoint and its TypeScript signature
 * does not bind the caller. Text belongs in `data`, keyed by the field name the
 * template refers to.
 */
export function separatedPrompt<I extends SeparatedPromptId>(
  id: I,
  instructions: Record<(typeof PROMPTS)[I]['vars'][number], number>,
  data: Record<string, string | number>,
  locale?: string
): { system: string; prompt: string } {
  for (const [name, value] of Object.entries(instructions)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new PromptTemplateError(`Prompt ${id}: instruction variable "${name}" must be a finite number`);
    }
  }
  const body = renderPrompt(id, instructions as unknown as PromptVars<I>, locale);
  const rule = renderPrompt('shared/untrusted-data-rule', {}, locale);
  return { system: `${body}\n\n${rule}`, prompt: fenceData(data) };
}
