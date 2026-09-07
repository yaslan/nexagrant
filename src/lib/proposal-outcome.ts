/**
 * `Proposal.outcome` — the vocabulary, written down once.
 *
 * The column is a free `String?` (see prisma/schema.prisma), so nothing in the database
 * stops two halves of the codebase from disagreeing about its spelling. They did: every
 * writer stores snake_case (`above_threshold`, from the ESR sample set and prisma/seed-proposals.ts),
 * while the dashboard read it back with `['SUBMITTED','FUNDED','ABOVE_THRESHOLD'].includes(...)`.
 * A case mismatch on a free-text column is silent — nothing throws, the filter simply matches
 * nothing and the KPI reads a confident 0 % (docs/ROADMAP.md, TASK-MTQTYXC0NUT0B).
 *
 * So the values live here and readers go through `normalizeProposalOutcome`, which is the
 * only place a spelling is forgiven. Comparing the raw column anywhere else re-opens the bug.
 */

/**
 * Canonical values, in evaluation order (best outcome first).
 *
 * `funded | reserve | above_threshold | below` is the schema comment; `ineligible` is the
 * fifth value the ESR calibration set records for a proposal that never reached evaluation.
 */
export const PROPOSAL_OUTCOMES = [
  'funded',
  'reserve',
  'above_threshold',
  'below',
  'ineligible',
] as const;

export type ProposalOutcome = (typeof PROPOSAL_OUTCOMES)[number];

/**
 * Outcomes that mean the proposal cleared the evaluation threshold — the numerator of the
 * dashboard's "eşik üstü oranı" (docs/ROADMAP.md E5). `reserve` counts: a reserve-list
 * proposal passed evaluation and missed only on budget.
 */
export const ABOVE_THRESHOLD_OUTCOMES: readonly ProposalOutcome[] = [
  'funded',
  'reserve',
  'above_threshold',
];

const CANONICAL = new Set<string>(PROPOSAL_OUTCOMES);
const ABOVE_THRESHOLD = new Set<string>(ABOVE_THRESHOLD_OUTCOMES);

/**
 * Reads whatever the column holds and answers with a canonical value, or `null` when the
 * row carries nothing this vocabulary recognises.
 *
 * Tolerant on the way in — case and separator only — because rows predating this module were
 * written by hand and by three different seeds. Tolerance stops there: an unknown word returns
 * `null` rather than being invented into a value, so a typo shows up as "no outcome" instead of
 * quietly joining the numerator.
 *
 * `toLowerCase` (not `toLocaleLowerCase`) on purpose: the vocabulary is ASCII, and a Turkish
 * locale would fold `I` to `ı` and stop matching.
 */
export function normalizeProposalOutcome(raw: string | null | undefined): ProposalOutcome | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return CANONICAL.has(key) ? (key as ProposalOutcome) : null;
}

/** Did this proposal clear the evaluation threshold? Unknown and unrecorded outcomes: no. */
export function isAboveThreshold(raw: string | null | undefined): boolean {
  const outcome = normalizeProposalOutcome(raw);
  return outcome !== null && ABOVE_THRESHOLD.has(outcome);
}

/** Was it funded? The strictest read of the same column. */
export function isFunded(raw: string | null | undefined): boolean {
  return normalizeProposalOutcome(raw) === 'funded';
}
