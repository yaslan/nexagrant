/**
 * M17 rubric arithmetic (FO-186, rubric from FO-187 §5.1). Pure: no database, no
 * numbers of its own — every mark, maximum and threshold comes from the rubric
 * row (InterregRubric / InterregRubricCriterion, seeded from
 * prisma/seed-data/interreg-rubrics.ts), so another programme's grid is data.
 *
 *   raw      = Σ criterion marks                       (each one of `allowedMarks`)
 *   score100 = round(raw / maxRaw × 100, 1)            (proportional, FO-187 §5.1)
 *   passes   = raw ≥ passRaw  ∧  no mark < knockoutBelow
 *
 * The result is an internal pre-assessment estimate, never an official score.
 */

export interface RubricCriterionDef {
  criterionKey: string;
  maxMark: number;
  knockoutBelow: number | null;
}

export interface RubricDef {
  id: string;
  allowedMarks: readonly number[];
  maxRaw: number;
  passRaw: number | null;
  criteria: readonly RubricCriterionDef[];
}

/** Rounds to one decimal, the precision of every stored score. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * What is wrong with a rubric definition; empty when it is consistent. The seed
 * refuses to write a rubric with problems, so a mistyped total cannot ship.
 */
export function rubricProblems(def: RubricDef): string[] {
  const problems: string[] = [];
  if (def.criteria.length === 0) problems.push('no criteria');
  const keys = def.criteria.map((c) => c.criterionKey);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) problems.push(`duplicate criterionKey: ${[...new Set(dup)].join(', ')}`);
  if (def.allowedMarks.length === 0) problems.push('no allowedMarks');
  const sum = round1(def.criteria.reduce((s, c) => s + c.maxMark, 0));
  if (sum !== def.maxRaw) problems.push(`maxRaw ${def.maxRaw} ≠ Σ maxMark ${sum}`);
  if (def.passRaw !== null && (def.passRaw <= 0 || def.passRaw > def.maxRaw)) {
    problems.push(`passRaw ${def.passRaw} outside (0, ${def.maxRaw}]`);
  }
  for (const c of def.criteria) {
    if (!def.allowedMarks.includes(c.maxMark)) problems.push(`${c.criterionKey}: maxMark ${c.maxMark} not an allowed mark`);
    if (c.knockoutBelow !== null && (c.knockoutBelow <= Math.min(...def.allowedMarks) || c.knockoutBelow > c.maxMark)) {
      problems.push(`${c.criterionKey}: knockoutBelow ${c.knockoutBelow} can never or always trigger`);
    }
  }
  return problems;
}

export type RubricMarkErrorCode = 'missing_mark' | 'unknown_criterion' | 'mark_not_allowed';

export class RubricMarkError extends Error {
  constructor(
    readonly code: RubricMarkErrorCode,
    readonly criterionKey: string,
  ) {
    super(`${code}: ${criterionKey}`);
    this.name = 'RubricMarkError';
  }
}

export interface RubricScore {
  rubricId: string;
  raw: number;
  maxRaw: number;
  score100: number;
  passRaw: number | null;
  pass100: number | null;
  belowPass: boolean;
  /** criterionKeys whose mark is below their knockout floor, in rubric order. */
  knockouts: string[];
  passesThresholds: boolean;
}

/** The 0..100 view of a raw total on this rubric's scale. */
export function to100(def: Pick<RubricDef, 'maxRaw'>, raw: number): number {
  return round1((raw / def.maxRaw) * 100);
}

/**
 * Scores one mark per criterion. Every criterion needs a mark, every mark must be
 * one of `allowedMarks` and not above its criterion's maximum; otherwise
 * RubricMarkError (the F2 writer rejects the model's answer rather than guess).
 */
export function scoreMarks(def: RubricDef, marks: Readonly<Record<string, number>>): RubricScore {
  const known = new Set(def.criteria.map((c) => c.criterionKey));
  for (const key of Object.keys(marks)) {
    if (!known.has(key)) throw new RubricMarkError('unknown_criterion', key);
  }
  let raw = 0;
  const knockouts: string[] = [];
  for (const c of def.criteria) {
    const mark = marks[c.criterionKey];
    if (mark === undefined) throw new RubricMarkError('missing_mark', c.criterionKey);
    if (!def.allowedMarks.includes(mark) || mark > c.maxMark) {
      throw new RubricMarkError('mark_not_allowed', c.criterionKey);
    }
    raw += mark;
    if (c.knockoutBelow !== null && mark < c.knockoutBelow) knockouts.push(c.criterionKey);
  }
  raw = round1(raw);
  const belowPass = def.passRaw !== null && raw < def.passRaw;
  return {
    rubricId: def.id,
    raw,
    maxRaw: def.maxRaw,
    score100: to100(def, raw),
    passRaw: def.passRaw,
    pass100: def.passRaw === null ? null : to100(def, def.passRaw),
    belowPass,
    knockouts,
    passesThresholds: !belowPass && knockouts.length === 0,
  };
}

/** One reason the programme would reject the application whatever else it scores. */
export type KnockoutFlag =
  | { kind: 'criterion'; criterionKey: string; mark: number; floor: number }
  | { kind: 'total'; raw: number; passRaw: number };

/**
 * The elimination risks of a set of marks (FO-188): every knockout criterion
 * below its floor (1.1, 1.2, 5.1 < 3 on the BSB grids), then the total below
 * `passRaw`. Empty when the marks clear every threshold. Validates the marks
 * the way `scoreMarks` does — it is computed from it, not alongside it.
 */
export function knockoutFlags(def: RubricDef, marks: Readonly<Record<string, number>>): KnockoutFlag[] {
  const score = scoreMarks(def, marks);
  const flags: KnockoutFlag[] = [];
  for (const key of score.knockouts) {
    const c = def.criteria.find((x) => x.criterionKey === key)!;
    flags.push({ kind: 'criterion', criterionKey: key, mark: marks[key]!, floor: c.knockoutBelow! });
  }
  if (score.belowPass) flags.push({ kind: 'total', raw: score.raw, passRaw: score.passRaw! });
  return flags;
}
