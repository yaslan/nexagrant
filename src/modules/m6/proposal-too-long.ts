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

/** Context window of the model M6 evaluation runs on, `claude-opus-5` (src/lib/llm.ts MODEL_OVERRIDES). */
const MODEL_CONTEXT_TOKENS = 1_000_000;
/** The call's output ceiling (4096, `maxTokensFor('M6', 'evaluation')`) plus the instructions and the data fence. */
const REQUEST_OVERHEAD_TOKENS = 8_000;
/**
 * Anthropic's published average is about 2.5 characters per token. Turkish suffixes and
 * the numbers in budget tables tokenize worse than prose, so the limit assumes 2.
 */
const CHARS_PER_TOKEN_FLOOR = 2;

/** The longest proposal text sent to the model, counted on the joined text that is sent. */
export const MAX_PROPOSAL_TEXT_CHARS = (MODEL_CONTEXT_TOKENS - REQUEST_OVERHEAD_TOKENS) * CHARS_PER_TOKEN_FLOOR;

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
