/**
 * FO-186 (TASK-MVRIV9LCDHYKO) — M17 rubric as data, aligned to FO-187
 * (TASK-MVRIVI9Y62503 §1.3, §5): Annex 7, 14 sub-criteria × 4 = 56, half points,
 * no 0, reject < 37, knockout 1.1 / 1.2 / 5.1 < 3. The FO-185 draft
 * (7 criteria, 20-20-15-15-15-10-5 of 100) is gone.
 */
import { describe, expect, it } from 'vitest';

import { INTERREG_RUBRICS } from '../prisma/seed-data/interreg-rubrics';
import { RubricMarkError, rubricProblems, scoreMarks, to100, type RubricDef } from '../src/modules/m17/rubric';

const bsb = INTERREG_RUBRICS.find((r) => r.id === 'interreg-next-bsb.call2.regular')!;
const keys = bsb.criteria.map((c) => c.criterionKey);
const all = (mark: number) => Object.fromEntries(keys.map((k) => [k, mark]));

describe('seeded rubric — Interreg NEXT BSB 2nd call Regular (Annex 7)', () => {
  it('is consistent and the only default', () => {
    expect(rubricProblems(bsb)).toEqual([]);
    expect(INTERREG_RUBRICS.filter((r) => r.programme === bsb.programme && r.isDefault).map((r) => r.id)).toEqual([bsb.id]);
  });

  it('has the 14 official sub-criteria in Annex 7 order, 4 points each, 56 in all', () => {
    expect(bsb.criteria.map((c) => c.officialRef)).toEqual([
      '1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '5.3', '6.1', '7.1', '7.2',
    ]);
    expect(new Set(bsb.criteria.map((c) => c.maxMark))).toEqual(new Set([4]));
    expect(bsb.maxRaw).toBe(56);
    expect(bsb.passRaw).toBe(37);
  });

  it('uses the half-point scale 1..4 with no 0', () => {
    expect(bsb.allowedMarks).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4]);
  });

  it('knocks out exactly 1.1, 1.2 and 5.1 below 3', () => {
    expect(bsb.criteria.filter((c) => c.knockoutBelow !== null).map((c) => [c.officialRef, c.knockoutBelow])).toEqual([
      ['1.1', 3],
      ['1.2', 3],
      ['5.1', 3],
    ]);
  });

  it('stores the Regular budget range in cent and the 30-month cap', () => {
    expect([bsb.budgetMinMinor, bsb.budgetMaxMinor, bsb.currency, bsb.maxDurationMonths]).toEqual([
      50_000_100, 150_000_000, 'EUR', 30,
    ]);
  });

  it('labels itself an internal pre-assessment and does not claim the assessor guidelines', () => {
    expect(bsb.label).toMatch(/iç ön değerlendirme \(resmî puan değildir\)/);
    expect(bsb.source.assessorGuidelines).toMatch(/doğrulanmadı/);
  });
});

describe('scoreMarks on the seeded rubric', () => {
  it('maps the raw total proportionally to 100 (FO-187 §5.1)', () => {
    expect(scoreMarks(bsb, all(4))).toMatchObject({ raw: 56, score100: 100, passesThresholds: true });
    expect(scoreMarks(bsb, all(1))).toMatchObject({ raw: 14, score100: 25, belowPass: true, passesThresholds: false });
    expect(scoreMarks(bsb, all(3))).toMatchObject({ raw: 42, score100: 75, knockouts: [], passesThresholds: true });
    expect(to100(bsb, 37)).toBe(66.1);
    expect(scoreMarks(bsb, all(3)).pass100).toBe(66.1);
  });

  it('passes at exactly 37 and fails at 36.5', () => {
    // 1.1, 1.2, 5.1 at 3 (no knockout) = 9; the other eleven make up the rest.
    const at = (rest: number[]) => {
      const marks: Record<string, number> = { relevance_so_fit: 3, relevance_transnational_value: 3, workplan_coherent: 3 };
      keys.filter((k) => !(k in marks)).forEach((k, i) => (marks[k] = rest[i]!));
      return scoreMarks(bsb, marks);
    };
    const pass = at([3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2]); // 9 + 18 + 10 = 37
    expect(pass).toMatchObject({ raw: 37, belowPass: false, passesThresholds: true });
    const fail = at([3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1.5]); // 36.5
    expect(fail).toMatchObject({ raw: 36.5, belowPass: true, passesThresholds: false, knockouts: [] });
  });

  it('a knockout criterion below 3 fails the application whatever the total', () => {
    const r = scoreMarks(bsb, { ...all(4), relevance_transnational_value: 2.5, workplan_coherent: 2 });
    expect(r.raw).toBe(52.5);
    expect(r.belowPass).toBe(false);
    expect(r.knockouts).toEqual(['relevance_transnational_value', 'workplan_coherent']);
    expect(r.passesThresholds).toBe(false);
  });

  it('refuses a mark off the scale, a missing criterion and an unknown one', () => {
    for (const bad of [0, 4.5, 2.25, 5]) {
      expect(() => scoreMarks(bsb, { ...all(3), communication: bad })).toThrow(RubricMarkError);
    }
    const missing = all(3);
    delete missing.budget_eligibility;
    expect(() => scoreMarks(bsb, missing)).toThrow(/missing_mark: budget_eligibility/);
    expect(() => scoreMarks(bsb, { ...all(3), cross_border_value: 3 })).toThrow(/unknown_criterion: cross_border_value/);
  });
});

describe('the arithmetic is programme-independent', () => {
  const other: RubricDef = {
    id: 'other-programme.call1',
    allowedMarks: [0, 1, 2, 3, 4, 5],
    maxRaw: 15,
    passRaw: 10,
    criteria: [
      { criterionKey: 'excellence', maxMark: 5, knockoutBelow: 3 },
      { criterionKey: 'impact', maxMark: 5, knockoutBelow: null },
      { criterionKey: 'implementation', maxMark: 5, knockoutBelow: null },
    ],
  };

  it('scores any grid from its own data', () => {
    expect(rubricProblems(other)).toEqual([]);
    expect(scoreMarks(other, { excellence: 4, impact: 3, implementation: 3 })).toMatchObject({
      raw: 10, maxRaw: 15, score100: 66.7, pass100: 66.7, passesThresholds: true,
    });
    expect(scoreMarks(other, { excellence: 2, impact: 5, implementation: 5 }).knockouts).toEqual(['excellence']);
  });

  it('a grid without a total threshold only applies its knockouts', () => {
    const noTotal = { ...other, passRaw: null };
    expect(scoreMarks(noTotal, { excellence: 3, impact: 0, implementation: 0 })).toMatchObject({
      belowPass: false, pass100: null, passesThresholds: true,
    });
  });

  it('rubricProblems catches a mistyped total, a duplicate key and a dead knockout', () => {
    expect(rubricProblems({ ...other, maxRaw: 100 })).toEqual(['maxRaw 100 ≠ Σ maxMark 15']);
    expect(rubricProblems({ ...other, criteria: [...other.criteria, { ...other.criteria[0]! }], maxRaw: 20 })).toEqual([
      'duplicate criterionKey: excellence',
    ]);
    expect(rubricProblems({ ...other, criteria: [{ ...other.criteria[0]!, knockoutBelow: 0 }, ...other.criteria.slice(1)] })).toEqual([
      'excellence: knockoutBelow 0 can never or always trigger',
    ]);
    expect(rubricProblems({ ...other, passRaw: 16 })).toEqual(['passRaw 16 outside (0, 15]']);
  });
});
