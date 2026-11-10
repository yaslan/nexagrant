/**
 * An AI evaluation refused because the proposal text does not fit the model (NG-106).
 * Thrown before the model call, so no credit is reserved. The text is refused whole and
 * never cut: a score from a silently shortened proposal would be a score of a different
 * proposal.
 *
 * In production a thrown action's message is withheld and its digest is all the browser
 * receives (see src/lib/pilot-expired.ts), so the limit is exported for the page to name.
 * No server-only import here: the evaluations page imports this too.
 */
export const PROPOSAL_TOO_LONG_DIGEST = 'M6_PROPOSAL_TOO_LONG';

/**
 * The longest proposal text sent to the model, counted on the joined text that is sent.
 *
 * The model is `claude-opus-5` (src/lib/llm.ts MODEL_OVERRIDES), with a 1M-token context
 * window. At the published density of about 2.5 characters a token this limit is roughly
 * 160 000 tokens; even at one token per character (digits, non-Latin partner text) the
 * request still fits in the window. Typical application sizes are an estimate, not
 * measured here. Recheck this if M6 evaluation moves to a smaller model.
 */
export const MAX_PROPOSAL_TEXT_CHARS = 400_000;

export class ProposalTooLongError extends Error {
  readonly digest = PROPOSAL_TOO_LONG_DIGEST;

  constructor(opportunityId: string, length: number) {
    super(
      `Opportunity ${opportunityId} has ${length} characters of proposal text, over the ` +
        `${MAX_PROPOSAL_TEXT_CHARS} limit; the model was not called.`,
    );
    this.name = 'ProposalTooLongError';
  }
}

export function isProposalTooLong(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { digest?: unknown }).digest === PROPOSAL_TOO_LONG_DIGEST;
}
