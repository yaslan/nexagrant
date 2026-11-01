/**
 * What the M17 run sends the model besides the prompt text (FO-188): the grid,
 * serialised from the rubric rows, and the two documents, fitted to the window.
 * Pure, so both are unit tested without a database.
 */

export interface PromptRubricCriterion {
  criterionKey: string;
  officialRef: string;
  section: string;
  name: string;
  maxMark: number;
  subQuestions: string[];
  afSections: string[];
  evidenceExpectation: string | null;
}

export interface PromptRubric {
  id: string;
  label: string;
  allowedMarks: number[];
  criteria: PromptRubricCriterion[];
  programChecks: { key: string; rule: string }[];
}

/**
 * The grid as the model reads it: what to mark and on which scale. The pass mark
 * and the knockout floors are left out on purpose — they decide the outcome from
 * the marks afterwards (`scoreMarks`, `knockoutFlags`) and would only pull marks
 * toward a threshold.
 */
export function serializeRubric(r: PromptRubric): string {
  return JSON.stringify(
    {
      id: r.id,
      label: r.label,
      allowedMarks: r.allowedMarks,
      criteria: r.criteria.map((c) => ({
        criterionKey: c.criterionKey,
        officialRef: c.officialRef,
        section: c.section,
        name: c.name,
        maxMark: c.maxMark,
        subQuestions: c.subQuestions,
        afSections: c.afSections,
        evidenceExpectation: c.evidenceExpectation,
      })),
      programChecks: r.programChecks.map((p) => ({ key: p.key, rule: p.rule })),
    },
    null,
    2,
  );
}

/**
 * Characters of document text one run may send. Two documents at the upload cap
 * (`INTERREG_UPLOAD_LIMITS.maxChars`, 400 000 each) are ~200 000 tokens — over
 * a 200k window once the prompt and the answer are added. 560 000 characters is
 * ~140 000 tokens, leaving room for both.
 */
export const CONTEXT_CHAR_BUDGET = 560_000;

/**
 * The prompt tags the documents are fenced in (src/lib/ai/prompts/m17/*.en|tr.ts).
 * The call guide sits in the SYSTEM message, between <call_context> tags; the project
 * file and the grid sit in the user message. Both are strangers' text.
 */
const FENCE_TAGS = ['call_context', 'project_context', 'rubric'] as const;

const FENCE_TAG_RE = new RegExp(`<(?=\\s*/?\\s*(?:${FENCE_TAGS.join('|')})(?![\\w-]))`, 'gi');

/**
 * A document that writes `</call_context>` closes the fence early and what follows it
 * reads as the prompt's own text — in the system message, for the call guide (FO-191 B1).
 * The `<` of any such tag (either case, with or without a slash, any spacing) becomes the
 * full-width `＜`, so no tag the prompt uses can appear inside a fenced document. One
 * character for one, so lengths, the context budget and `…CharsOmitted` are unchanged;
 * every other character, including other tags and markup, is untouched.
 */
export function neutralizeFenceTags(text: string): string {
  return text.replace(FENCE_TAG_RE, '\uFF1C');
}

export interface FittedContext {
  callText: string;
  projectText: string;
  /** Characters cut from the end of the call guide (0 = the whole of it is sent). */
  callCharsOmitted: number;
  projectCharsOmitted: number;
}

/**
 * Both documents whole when they fit (the usual case: a call guide is 100–200k
 * characters, an application 150–250k). Otherwise the call guide gives way first
 * — its end is annexes and contacts, while every page of the project is what is
 * being assessed — and the project file only if it alone is over the budget.
 * What was cut is reported, never silent.
 */
export function fitContext(callText: string, projectText: string, budget = CONTEXT_CHAR_BUDGET): FittedContext {
  const project = projectText.slice(0, budget);
  const call = callText.slice(0, Math.max(0, budget - project.length));
  return {
    callText: neutralizeFenceTags(call),
    projectText: neutralizeFenceTags(project),
    callCharsOmitted: callText.length - call.length,
    projectCharsOmitted: projectText.length - project.length,
  };
}
