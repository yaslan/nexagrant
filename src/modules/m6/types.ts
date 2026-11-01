/**
 * M6 Evaluator Lens — shared types (TASK-MTPZH6T9L6E2E).
 *
 * These describe the v1.1 *panel* evaluation: an Evaluation on a Proposal,
 * scored by several Reviewers against weighted Criteria.
 * The v1.0 single-reader lens (readerType HUMAN | AI on an Opportunity) keeps
 * using the raw Prisma types in src/modules/m6/server/actions.ts.
 */

export type EvaluationStatus = 'draft' | 'in-progress' | 'completed';
export type ReviewerRole = 'evaluator' | 'coordinator';
export type ReviewerStatus = 'pending' | 'completed';
export type CriterionName = 'Innovation' | 'Feasibility' | 'Impact' | 'Communication';

/** Reader kinds stored in Evaluation.readerType. PANEL is the v1.1 shape. */
export type EvaluationReaderType = 'HUMAN' | 'AI' | 'PANEL';

/** Allowed score marks. The DB enforces the same range via Score_score_check. */
export type ScoreValue = 1 | 2 | 3 | 4 | 5;

export const EVALUATION_STATUSES: readonly EvaluationStatus[] = ['draft', 'in-progress', 'completed'];
export const REVIEWER_ROLES: readonly ReviewerRole[] = ['evaluator', 'coordinator'];
export const REVIEWER_STATUSES: readonly ReviewerStatus[] = ['pending', 'completed'];

/** Default panel axes and weights; weights sum to 1.0. */
export const DEFAULT_CRITERIA: readonly { name: CriterionName; weight: number; order: number }[] = [
  { name: 'Innovation', weight: 0.3, order: 1 },
  { name: 'Feasibility', weight: 0.2, order: 2 },
  { name: 'Impact', weight: 0.3, order: 3 },
  { name: 'Communication', weight: 0.2, order: 4 },
];

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

export function isScoreValue(value: number): value is ScoreValue {
  return Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

export interface ReviewerDTO {
  id: string;
  userId: string;
  userName: string;
  role: ReviewerRole;
  status: ReviewerStatus;
  /** Unweighted 1-5 mean over this reviewer's submitted scores; undefined while pending. */
  score?: number;
}

export interface CriterionDTO {
  id: string;
  name: CriterionName;
  weight: number;
  order: number;
  /** Mean over submitted scores from completed reviewers; undefined when nobody has scored. */
  avgScore?: number;
}

export interface ScoreDTO {
  id: string;
  reviewerId: string;
  criterionId: string;
  score: ScoreValue;
  comment: string | null;
  /** null while the reviewer is still drafting. */
  submittedAt: string | null;
}

export interface EvaluationDTO {
  id: string;
  proposalId: string;
  opportunityId: string;
  status: EvaluationStatus;
  reviewers: ReviewerDTO[];
  criterions: CriterionDTO[];
  /** Weighted 1-5 panel average; null until at least one reviewer submits. */
  avgScore: number | null;
}

/** Count of reviewers who gave each mark, e.g. { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 }. */
export type ScoreDistribution = Record<ScoreValue, number>;

/** M6 panel score against the official ESR score recorded on the Proposal. */
export interface EsrComparison {
  m6Score: number;
  esrScore: number | null;
  /** false when M6 is more optimistic than the ESR (m6Score > esrScore). */
  agreement: boolean;
  /** esrScore - m6Score. Negative means M6 scored higher. */
  delta: number | null;
}

/**
 * `Evaluation.weaknesses` is a free-form JSON column. Rows written by the current actions
 * hold `{ strengths, weaknesses, recommendations }`; rows written by an earlier version
 * hold a bare `string[]` of weaknesses. Both shapes are still in the database, so both are
 * described here rather than read as `any` (CLAUDE.md forbids it).
 */
export type EvaluationNotesObject = {
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
};

export type EvaluationNotes = EvaluationNotesObject | string[] | null;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Narrow a raw JSON column value to the notes shapes, discarding anything else. */
export function toEvaluationNotes(value: unknown): EvaluationNotes {
  if (isStringArray(value)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const out: EvaluationNotesObject = {};
  if (isStringArray(raw.strengths)) out.strengths = raw.strengths;
  if (isStringArray(raw.weaknesses)) out.weaknesses = raw.weaknesses;
  if (isStringArray(raw.recommendations)) out.recommendations = raw.recommendations;
  return out;
}

/** The object form of the notes column, or null when the row holds the legacy array. */
export function notesObject(notes: EvaluationNotes | undefined): EvaluationNotesObject | null {
  return notes && !Array.isArray(notes) ? notes : null;
}
