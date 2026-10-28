/**
 * FO-186 (TASK-MVRIV9LCDHYKO) — M17 rubric as data, aligned to FO-187
 * (TASK-MVRIVI9Y62503 §1.3, §5): Annex 7, 14 sub-criteria × 4 = 56, half points,
 * no 0, reject < 37, knockout 1.1 / 1.2 / 5.1 < 3. The FO-185 draft
 * (7 criteria, 20-20-15-15-15-10-5 of 100) is gone.
 */
import { readFileSync } from 'node:fs';
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

/**
 * The §5.2 JSON of the FO-187 report (TASK-MVRIVI9Y62503-crw2-fb.md, outside this
 * repo), extracted verbatim into a fixture (crw2 Ö2). A change to the seed data
 * that drifts from the programme's grid as FO-187 recorded it fails here; a
 * deliberate revision updates both, and is a new rubric id (prisma/seed-interreg-rubrics.ts).
 */
describe('seeded rubric = FO-187 §5.2, field by field', () => {
  interface Fo187 {
    rubricId: string;
    label: string;
    source: Record<string, string>;
    scale: { allowedMarks: number[]; maxPerCriterion: number };
    totals: { maxRaw: number; passRaw: number; pass100: number };
    knockouts: ({ criterionKey: string; minMark: number } | { rule: string })[];
    tieBreak: string[];
    criteria: {
      criterionKey: string; officialRef: string; section: string; group: string; name: string; maxMark: number;
      subQuestions: string[]; afSections: string[]; evidenceExpectation: string;
    }[];
    programChecks: { key: string; rule: string; source: string }[];
  }
  const fo187 = JSON.parse(readFileSync(new URL('./fixtures/m17/fo187-bsb-call2-regular.json', import.meta.url), 'utf8')) as Fo187;

  it('has the same id, label, source, scale and totals', () => {
    expect(bsb.id).toBe(fo187.rubricId);
    expect(bsb.label).toBe(fo187.label);
    expect(bsb.source).toEqual(fo187.source);
    expect(bsb.allowedMarks).toEqual(fo187.scale.allowedMarks);
    expect(Math.max(...bsb.criteria.map((c) => c.maxMark))).toBe(fo187.scale.maxPerCriterion);
    expect([bsb.maxRaw, bsb.passRaw, to100(bsb, bsb.passRaw!)]).toEqual([fo187.totals.maxRaw, fo187.totals.passRaw, fo187.totals.pass100]);
  });

  it('has the same knockouts and tie-break order', () => {
    const floors = fo187.knockouts.flatMap((k) => ('criterionKey' in k ? [[k.criterionKey, k.minMark]] : []));
    expect(bsb.criteria.filter((c) => c.knockoutBelow !== null).map((c) => [c.criterionKey, c.knockoutBelow])).toEqual(floors);
    expect(fo187.knockouts).toContainEqual({ rule: `raw >= ${bsb.passRaw}` });
    expect(bsb.tieBreak).toEqual(fo187.tieBreak);
  });

  it('has the same 14 criteria, in order, with every text', () => {
    const fields = ['criterionKey', 'officialRef', 'section', 'group', 'name', 'maxMark', 'subQuestions', 'afSections', 'evidenceExpectation'] as const;
    const pick = (c: Record<(typeof fields)[number], unknown>) => Object.fromEntries(fields.map((f) => [f, c[f]]));
    expect(bsb.criteria.map(pick)).toEqual(fo187.criteria.map(pick));
  });

  it('has the same programme checks', () => {
    expect(bsb.programChecks).toEqual(fo187.programChecks);
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

  it('refuses an allowed mark above its own criterion maximum (mark_not_allowed)', () => {
    const capped: RubricDef = { ...other, maxRaw: 13, criteria: [{ ...other.criteria[0]!, maxMark: 3, knockoutBelow: null }, ...other.criteria.slice(1)] };
    expect(rubricProblems(capped)).toEqual([]);
    expect(scoreMarks(capped, { excellence: 3, impact: 0, implementation: 0 }).raw).toBe(3);
    expect(() => scoreMarks(capped, { excellence: 4, impact: 0, implementation: 0 })).toThrow(/mark_not_allowed: excellence/);
  });

  it('a mark equal to the knockout floor is not a knockout; one step below is', () => {
    expect(scoreMarks(other, { excellence: 3, impact: 5, implementation: 5 }).knockouts).toEqual([]);
    expect(scoreMarks(other, { excellence: 2, impact: 5, implementation: 5 }).knockouts).toEqual(['excellence']);
  });

  it('rubricProblems: the boundaries are inclusive where the rule says so', () => {
    // knockoutBelow == maxMark is valid (only the maximum passes); above it can never be met.
    const ko = (knockoutBelow: number) => ({ ...other, criteria: [{ ...other.criteria[0]!, knockoutBelow }, ...other.criteria.slice(1)] });
    expect(rubricProblems(ko(5))).toEqual([]);
    expect(rubricProblems(ko(6))).toEqual(['excellence: knockoutBelow 6 can never or always trigger']);
    // One step above the lowest allowed mark (0 here) can trigger; the lowest itself
    // never can (the 'dead knockout' case below).
    expect(rubricProblems(ko(1))).toEqual([]);
    // passRaw == maxRaw is valid; 0 is not.
    expect(rubricProblems({ ...other, passRaw: 15 })).toEqual([]);
    expect(rubricProblems({ ...other, passRaw: 0 })).toEqual(['passRaw 0 outside (0, 15]']);
  });

  it('rubricProblems: no criteria, no allowed marks, a maximum that is not an allowed mark', () => {
    expect(rubricProblems({ ...other, criteria: [], maxRaw: 0, passRaw: null })).toEqual(['no criteria']);
    const noMarks = rubricProblems({ ...other, allowedMarks: [] });
    expect(noMarks[0]).toBe('no allowedMarks');
    expect(noMarks).toContain('impact: maxMark 5 not an allowed mark');
    expect(rubricProblems({ ...other, allowedMarks: [0, 1, 2, 3, 4] })).toEqual([
      'excellence: maxMark 5 not an allowed mark',
      'impact: maxMark 5 not an allowed mark',
      'implementation: maxMark 5 not an allowed mark',
    ]);
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
