import { z } from 'zod';

/**
 * M10 follow-up document kinds — the closed list, and the dual approval rule
 * that hangs off it.
 *
 * No `@prisma/client` import here: the documents client component reads this
 * to hide the direct "sign" button on a dual approval kind (İNCELEME-65 Ö-2).
 *
 * İNCELEME-65 B-1: `FollowupDoc.kind` is a free-text column and the gate used
 * to be an exact `includes`. `generateStandardDoc` wrote whatever kind the
 * caller sent, so a WRITER could POST `"NDA "`, `"nda"`, `"loi"`,
 * `"Commitment"` or `"NDA​"`, get a real NDA text and sign it directly —
 * no finance, no legal. Two layers close it:
 *   1. `generateStandardDoc` parses the kind with `FollowupDocKindSchema`, so
 *      nothing outside this list is written any more.
 *   2. The gate is fail-closed: only a kind whose normalised spelling is in
 *      `DIRECT_SIGN_DOCUMENT_KINDS` is signed directly. Any other stored
 *      spelling — a variant, a homoglyph, a kind nobody knows — needs the flow.
 */
export const FOLLOWUP_DOC_KINDS = ['NDA', 'LOI', 'COMMITMENT', 'ESR_DEBRIEF', 'AWARD_PACK'] as const;

export type FollowupDocKind = (typeof FOLLOWUP_DOC_KINDS)[number];

export const FollowupDocKindSchema = z.enum(FOLLOWUP_DOC_KINDS);

/**
 * Kinds that are a legal commitment: signed by the dual approval flow
 * (finance → legal, two people), never by one click (İNCELEME-59 Y-4, owner
 * decision 30.09.2026).
 */
export const DUAL_APPROVAL_DOCUMENT_KINDS: readonly FollowupDocKind[] = ['NDA', 'LOI', 'COMMITMENT'];

/** Kinds signed directly, as before the dual approval gate. */
export const DIRECT_SIGN_DOCUMENT_KINDS: readonly FollowupDocKind[] = ['ESR_DEBRIEF', 'AWARD_PACK'];

/**
 * The spelling a stored kind is judged by: NFKC (full-width letters fold),
 * format characters removed (zero-width space/joiner, BOM, bidi marks),
 * whitespace trimmed, upper case. Locale-free `toUpperCase`, so `"loi"` is
 * `"LOI"` on a Turkish server too.
 */
export function normalizeDocumentKind(kind: string): string {
  return kind.normalize('NFKC').replace(/\p{Cf}/gu, '').trim().toUpperCase();
}

/** The known kind a stored spelling stands for, or null when it is none of them. */
export function knownDocumentKind(kind: string): FollowupDocKind | null {
  const normalized = normalizeDocumentKind(kind);
  return (FOLLOWUP_DOC_KINDS as readonly string[]).includes(normalized) ? (normalized as FollowupDocKind) : null;
}

/** Fail-closed: true unless the kind is one of the direct-sign kinds. */
export function documentKindRequiresDualApproval(kind: string): boolean {
  const known = knownDocumentKind(kind);
  return known === null || !DIRECT_SIGN_DOCUMENT_KINDS.includes(known);
}
