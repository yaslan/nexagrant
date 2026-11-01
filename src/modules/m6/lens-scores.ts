/**
 * Evaluator Lens marks — telling "not scored yet" apart from "scored zero".
 *
 * `Evaluation.excellence/impact/implementation` are non-null `Float @default(0)`, so a
 * row that nobody has filled in is indistinguishable from a row scored 0/0/0 if you
 * only read the columns. The lens used to read them straight and render
 * "Toplam: 0.0 / 15.0 (Eşik Altı)" over an evaluation nobody had opened — a failing
 * verdict on a proposal that has not been assessed. CLAUDE.md §7 ties every number the
 * user sees to a record; there is no record behind that 0.
 *
 * Two writers set those columns, `generateAiEvaluation` and `saveHumanEvaluation`, and
 * both write `status: 'completed'` in the same statement. So the columns are meaningful
 * exactly when:
 *
 *   • the row is `completed` — nothing has been submitted before that, and
 *   • the reader is not `PANEL` — a panel evaluation's marks live in `Reviewer`/`Score`
 *     on the weighted 1-5 scale and are shown on the panel screen; its three lens
 *     columns stay at the default 0 for the life of the row.
 *
 * Everything else has no lens score, which is `null` here and a stated reason in the UI.
 * A genuine 0 from a completed reader survives untouched and still reads as below
 * threshold, because that one *was* measured.
 */

export type LensReaderType = 'AI' | 'HUMAN' | 'PANEL';

export interface LensMarks {
  excellence: number;
  impact: number;
  implementation: number;
}

export interface LensRow {
  readerType: string;
  status: string;
  excellence: number;
  impact: number;
  implementation: number;
}

/** Narrows the free-text `readerType` column. Unknown values are treated as human. */
export function readerTypeOf(raw: string): LensReaderType {
  if (raw === 'AI') return 'AI';
  if (raw === 'PANEL') return 'PANEL';
  return 'HUMAN';
}

/** The row's three lens marks, or `null` when nobody has scored it. */
export function lensMarks(row: LensRow): LensMarks | null {
  if (readerTypeOf(row.readerType) === 'PANEL') return null;
  if (row.status !== 'completed') return null;
  return {
    excellence: row.excellence,
    impact: row.impact,
    implementation: row.implementation,
  };
}

/**
 * Lens total out of 15. Innovation Actions weight Impact ×1.5, matching the
 * multiplier the page lets the reader toggle.
 */
export function lensTotal(marks: LensMarks, innovationAction: boolean): number {
  const impact = innovationAction ? marks.impact * 1.5 : marks.impact;
  return marks.excellence + impact + marks.implementation;
}

/**
 * Mean lens total across the readers who actually scored, or `null` when none have.
 *
 * Unscored rows are not averaged in as zeros — that is how an opportunity with two
 * untouched panel rows came to show "0.0 / 15.0" instead of "not evaluated".
 */
export function averageLensTotal(
  rows: readonly { scores: LensMarks | null }[],
  innovationAction: boolean,
): number | null {
  const scored = rows.filter((r): r is { scores: LensMarks } => r.scores !== null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, r) => acc + lensTotal(r.scores, innovationAction), 0);
  return sum / scored.length;
}
