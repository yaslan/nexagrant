/**
 * An AI evaluation refused because the opportunity has no proposal text to read
 * (NG-98). Thrown before the model call, so nothing is billed.
 *
 * In production a thrown action's message is withheld and its digest is all the
 * browser receives (see src/lib/pilot-expired.ts). No server-only import here: the
 * evaluations page imports this too.
 */
export const PROPOSAL_TEXT_MISSING_DIGEST = 'M6_PROPOSAL_TEXT_MISSING';

export class ProposalTextMissingError extends Error {
  readonly digest = PROPOSAL_TEXT_MISSING_DIGEST;

  constructor(opportunityId: string) {
    super(`Opportunity ${opportunityId} has no proposal text to evaluate; the model was not called.`);
    this.name = 'ProposalTextMissingError';
  }
}

export function isProposalTextMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { digest?: unknown }).digest === PROPOSAL_TEXT_MISSING_DIGEST;
}
