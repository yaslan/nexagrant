/**
 * Project idea entry — form rules (NG-14).
 *
 * Pure functions, no DB and no React: the form calls them on submit and the unit
 * tests call them directly. The persisted shape is `ProjectIdea` (NG-38, BE-05);
 * nothing here writes it. `institution` is a form field only: the table has no
 * column for it yet, and the schema is not changed by this card.
 */

export const TRL_MIN = 1;
export const TRL_MAX = 9;

export const PROJECT_IDEA_LIMITS = {
  institution: 200,
  title: 200,
  summary: 2000,
  keywords: 10,
  keywordLength: 40,
} as const;

/** Funding programmes a project idea can target. Keys are stable; labels live in messages. */
export const TARGET_PROGRAMS = [
  'horizonEurope',
  'digitalEurope',
  'eurostars',
  'interreg',
  'life',
] as const;
export type TargetProgram = (typeof TARGET_PROGRAMS)[number];

export type ProjectIdeaDraft = {
  institution: string;
  title: string;
  summary: string;
  keywords: string[];
  trl: number | null;
  targetPrograms: string[];
};

export type ProjectIdeaField = keyof ProjectIdeaDraft;

export type ProjectIdeaErrorCode =
  | 'required'
  | 'tooLong'
  | 'trlRequired'
  | 'trlNotInteger'
  | 'trlOutOfRange'
  | 'keywordsTooMany'
  | 'keywordTooLong'
  | 'programRequired'
  | 'programUnknown';

export type ProjectIdeaValidation =
  | { ok: true; errors: Partial<Record<ProjectIdeaField, ProjectIdeaErrorCode>> }
  | { ok: false; errors: Partial<Record<ProjectIdeaField, ProjectIdeaErrorCode>> };

/**
 * Comma-separated keyword input → clean list: trimmed, empty pieces dropped,
 * case-insensitive duplicates removed (first spelling wins).
 */
export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(',')) {
    const k = piece.trim();
    if (!k) continue;
    // Locale-independent on purpose: under the 'tr' locale "IoT" lowercases to "ıot",
    // so the same keyword typed in two cases would survive as two entries.
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/** TRL must be an integer 1..9. Anything else (null, 0, 10, 4.5, NaN) is rejected. */
export function checkTrl(trl: number | null): ProjectIdeaErrorCode | null {
  if (trl === null || trl === undefined) return 'trlRequired';
  if (typeof trl !== 'number' || !Number.isFinite(trl) || !Number.isInteger(trl)) {
    return 'trlNotInteger';
  }
  if (trl < TRL_MIN || trl > TRL_MAX) return 'trlOutOfRange';
  return null;
}

export function validateProjectIdea(draft: ProjectIdeaDraft): ProjectIdeaValidation {
  const errors: Partial<Record<ProjectIdeaField, ProjectIdeaErrorCode>> = {};

  const institution = draft.institution.trim();
  if (!institution) errors.institution = 'required';
  else if (institution.length > PROJECT_IDEA_LIMITS.institution) errors.institution = 'tooLong';

  const title = draft.title.trim();
  if (!title) errors.title = 'required';
  else if (title.length > PROJECT_IDEA_LIMITS.title) errors.title = 'tooLong';

  const summary = draft.summary.trim();
  if (summary.length > PROJECT_IDEA_LIMITS.summary) errors.summary = 'tooLong';

  if (draft.keywords.length > PROJECT_IDEA_LIMITS.keywords) {
    errors.keywords = 'keywordsTooMany';
  } else if (draft.keywords.some((k) => k.trim().length > PROJECT_IDEA_LIMITS.keywordLength)) {
    errors.keywords = 'keywordTooLong';
  }

  const trlError = checkTrl(draft.trl);
  if (trlError) errors.trl = trlError;

  if (draft.targetPrograms.length === 0) {
    errors.targetPrograms = 'programRequired';
  } else if (
    draft.targetPrograms.some((p) => !(TARGET_PROGRAMS as readonly string[]).includes(p))
  ) {
    errors.targetPrograms = 'programUnknown';
  }

  const ok = Object.keys(errors).length === 0;
  return ok ? { ok: true, errors } : { ok: false, errors };
}

/**
 * TRL criterion state for the workspace: "eksik" (missing) until at least one
 * project idea exists. Per-idea scoring is NG-38's read path and is not here.
 */
export function trlCriterionState(ideaCount: number): 'missing' | 'present' {
  return ideaCount > 0 ? 'present' : 'missing';
}
