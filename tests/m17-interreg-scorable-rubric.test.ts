/**
 * FO-196 (B1) — loadScorableRubric: the check between the stored grid and
 * scoreMarks. The database read is replaced by a row; the real-database path is
 * in tests/m17-interreg-analyses.live.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERREG_RUBRICS } from '../prisma/seed-data/interreg-rubrics';
import { scoreMarks } from '../src/modules/m17/rubric';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  withTenant: async (_tenantId: string, cb: (tx: unknown) => unknown) => cb({ interregRubric: { findUnique } }),
}));

const { ScorableRubricError, loadScorableRubric } = await import('../src/modules/m17/server/rubrics');

const bsb = INTERREG_RUBRICS.find((r) => r.id === 'interreg-next-bsb.call2.regular')!;

/** A row as Prisma returns it: Decimal columns come back as numbers-like. */
function row(change: (r: typeof bsb) => void = () => {}) {
  const r = structuredClone(bsb);
  change(r);
  return { ...r, criteria: r.criteria.map((c) => ({ ...c })) };
}

beforeEach(() => findUnique.mockReset());

describe('loadScorableRubric', () => {
  it('returns the definition of a consistent grid, ready for scoreMarks', async () => {
    findUnique.mockResolvedValue(row());
    const def = await loadScorableRubric('t1', bsb.id);
    expect(def.criteria).toHaveLength(14);
    expect([def.maxRaw, def.passRaw]).toEqual([56, 37]);
    const marks = Object.fromEntries(def.criteria.map((c) => [c.criterionKey, 3]));
    expect(scoreMarks(def, marks).raw).toBe(42);
  });

  it('throws rubric_not_found for an id that is not in the database', async () => {
    findUnique.mockResolvedValue(null);
    await expect(loadScorableRubric('t1', 'nope')).rejects.toMatchObject({ code: 'rubric_not_found', rubricId: 'nope' });
  });

  it('throws rubric_inconsistent, naming the problem, when a criterion is left over (Σ60 ≠ 56)', async () => {
    findUnique.mockResolvedValue(
      row((r) => {
        r.criteria.push({ ...r.criteria[0]!, criterionKey: 'left_over', maxMark: 4, knockoutBelow: null });
      }),
    );
    const err = await loadScorableRubric('t1', bsb.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScorableRubricError);
    expect(err).toMatchObject({ code: 'rubric_inconsistent', problems: ['maxRaw 56 ≠ Σ maxMark 60'] });
  });

  it('throws when allowedMarks is not a list of numbers (stored as an empty scale)', async () => {
    findUnique.mockResolvedValue({ ...row(), allowedMarks: { not: 'a list' } });
    await expect(loadScorableRubric('t1', bsb.id)).rejects.toMatchObject({ code: 'rubric_inconsistent' });
  });
});
