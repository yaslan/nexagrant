/**
 * What POST /api/interreg-review/analyses/[id]/evaluate and GET …/result answer
 * with (`{ result }`, FO-188 `InterregResultView` in server/evaluate.ts). Kept
 * here, free of server imports, so the report screen (FO-189) can type the
 * response; the fields it reads are the ones listed. When FO-188 lands,
 * server/evaluate.ts should `import type` this instead of declaring its own.
 */
export interface InterregResultView {
  analysisId: string;
  /** Internal pre-assessment, never an official score. */
  assessmentKind: 'internal_pre_assessment';
  rubricId: string;
  rawScore: number;
  maxRaw: number;
  score100: number;
  passesThresholds: boolean;
  /** Criterion keys marked below their knockout floor (rubric.ts `scoreMarks`). */
  knockouts: string[];
  /** Four sections, generated from the checked answer (FO-188 report.ts). */
  reportMarkdown: string;
}
