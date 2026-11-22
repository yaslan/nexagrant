/**
 * A concept-note template section whose word limit cannot be used, as the browser
 * sees it (NG-40). Thrown before the first model call, so nothing is billed.
 *
 * In production a thrown action's message is withheld and its digest is all the
 * browser receives (see src/lib/pilot-expired.ts), so the digest carries the section
 * key. No server-only import here: the editor imports this too.
 */
const DIGEST_PREFIX = 'INVALID_TEMPLATE_SECTION:';

export class InvalidTemplateSectionError extends Error {
  readonly digest: string;

  constructor(sectionKey: string) {
    super(`Template section "${sectionKey}" has no valid word limit`);
    this.name = 'InvalidTemplateSectionError';
    this.digest = `${DIGEST_PREFIX}${sectionKey}`;
  }
}

/** The section key of an invalid-section refusal, or `null` for any other error. */
export function invalidTemplateSectionKey(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { digest } = error as { digest?: unknown };
  return typeof digest === 'string' && digest.startsWith(DIGEST_PREFIX) ? digest.slice(DIGEST_PREFIX.length) : null;
}
