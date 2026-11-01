/**
 * M17 rubric reads (FO-186). The rubric tables are platform reference data
 * (platform_read: readable inside any tenant transaction, never writable by the
 * app role), so reads run in the caller's `withTenant` like everything else here.
 */
import type { Prisma } from '@prisma/client';

import { withTenant } from '@/lib/db';

import { rubricProblems, to100, type RubricDef } from '../rubric';

export const RUBRIC_SELECT = {
  id: true,
  programme: true,
  label: true,
  isDefault: true,
  allowedMarks: true,
  maxRaw: true,
  passRaw: true,
  budgetMinMinor: true,
  budgetMaxMinor: true,
  currency: true,
  maxDurationMonths: true,
  criteria: {
    orderBy: { position: 'asc' },
    select: { criterionKey: true, officialRef: true, section: true, group: true, name: true, maxMark: true, knockoutBelow: true },
  },
} satisfies Prisma.InterregRubricSelect;

type RubricRow = Prisma.InterregRubricGetPayload<{ select: typeof RUBRIC_SELECT }>;

export interface InterregRubricCriterionView {
  criterionKey: string;
  officialRef: string;
  section: string;
  group: string;
  name: string;
  maxMark: number;
  knockoutBelow: number | null;
}

export interface InterregRubricView {
  id: string;
  programme: string;
  label: string;
  isDefault: boolean;
  allowedMarks: number[];
  maxRaw: number;
  passRaw: number | null;
  /** `passRaw` on the 0..100 view (FO-187 §5.1), e.g. 37/56 → 66.1. */
  pass100: number | null;
  budgetMinMinor: number | null;
  budgetMaxMinor: number | null;
  currency: string | null;
  maxDurationMonths: number | null;
  criteria: InterregRubricCriterionView[];
}

/** `allowedMarks` is JSON; anything that is not a list of finite numbers is an empty scale. */
function marksOf(value: Prisma.JsonValue): number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v))
    ? (value as number[])
    : [];
}

export function toRubricView(row: RubricRow): InterregRubricView {
  const maxRaw = Number(row.maxRaw);
  const passRaw = row.passRaw === null ? null : Number(row.passRaw);
  return {
    id: row.id,
    programme: row.programme,
    label: row.label,
    isDefault: row.isDefault,
    allowedMarks: marksOf(row.allowedMarks),
    maxRaw,
    passRaw,
    pass100: passRaw === null ? null : to100({ maxRaw }, passRaw),
    budgetMinMinor: row.budgetMinMinor,
    budgetMaxMinor: row.budgetMaxMinor,
    currency: row.currency,
    maxDurationMonths: row.maxDurationMonths,
    criteria: row.criteria.map((c) => ({
      criterionKey: c.criterionKey,
      officialRef: c.officialRef,
      section: c.section,
      group: c.group,
      name: c.name,
      maxMark: Number(c.maxMark),
      knockoutBelow: c.knockoutBelow === null ? null : Number(c.knockoutBelow),
    })),
  };
}

/** The scoring definition of a rubric view, for src/modules/m17/rubric.ts. */
export function rubricDef(view: InterregRubricView): RubricDef {
  return {
    id: view.id,
    allowedMarks: view.allowedMarks,
    maxRaw: view.maxRaw,
    passRaw: view.passRaw,
    criteria: view.criteria.map(({ criterionKey, maxMark, knockoutBelow }) => ({ criterionKey, maxMark, knockoutBelow })),
  };
}

/** Every rubric, default first, for the profile picker. */
export async function listRubrics(tenantId: string): Promise<InterregRubricView[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.interregRubric.findMany({ orderBy: [{ programme: 'asc' }, { isDefault: 'desc' }, { id: 'asc' }], select: RUBRIC_SELECT }),
  );
  return rows.map(toRubricView);
}

export async function getRubric(tenantId: string, id: string): Promise<InterregRubricView | null> {
  const row = await withTenant(tenantId, (tx) => tx.interregRubric.findUnique({ where: { id }, select: RUBRIC_SELECT }));
  return row ? toRubricView(row) : null;
}

export type ScorableRubricErrorCode = 'rubric_not_found' | 'rubric_inconsistent';

export class ScorableRubricError extends Error {
  constructor(
    readonly code: ScorableRubricErrorCode,
    readonly rubricId: string,
    readonly problems: readonly string[] = [],
  ) {
    super(`${code}: ${rubricId}${problems.length ? ` (${problems.join('; ')})` : ''}`);
    this.name = 'ScorableRubricError';
  }
}

/**
 * The scoring definition of a rubric view, or a throw if the stored grid cannot
 * be scored. Every score is computed from what the database holds right now;
 * this is the check between that and `scoreMarks` (FO-196 B1), so a criterion
 * left behind or a total edited by hand stops the run instead of skewing a score.
 */
export function scorableDef(view: InterregRubricView): RubricDef {
  const def = rubricDef(view);
  const problems = rubricProblems(def);
  if (problems.length) throw new ScorableRubricError('rubric_inconsistent', view.id, problems);
  return def;
}

/** Reads the rubric and returns its definition only if it is consistent. The F2 score writer calls this, not `getRubric`. */
export async function loadScorableRubric(tenantId: string, id: string): Promise<RubricDef> {
  const view = await getRubric(tenantId, id);
  if (!view) throw new ScorableRubricError('rubric_not_found', id);
  return scorableDef(view);
}
