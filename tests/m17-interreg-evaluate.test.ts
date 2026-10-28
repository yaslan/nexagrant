/**
 * FO-188 (TASK-MVRIVTHH6IEGK) — M17 F2: rubric zod, score view, knockout flags,
 * the model answer's schema, the context fit, the report and the credit price.
 * Everything here is pure; the run itself is covered against a real database by
 * the end-to-end run in the task's result file.
 */
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import enMessages from '../messages/en.json';
import trMessages from '../messages/tr.json';
import { INTERREG_RUBRICS } from '../prisma/seed-data/interreg-rubrics';
import { resolveCredits, UnpricedAiActionError } from '../src/lib/llm';
import { knockoutFlags, scoreMarks, to100, type RubricDef } from '../src/modules/m17/rubric';
import { marksSchema, rubricProfileSchema } from '../src/modules/m17/rubric-schema';
import { CONTEXT_CHAR_BUDGET, fitContext, serializeRubric } from '../src/modules/m17/server/context';
import { parseEvaluation, type EvaluationGrid } from '../src/modules/m17/server/evaluation-output';
import { buildReportMarkdown, redFlagsOf, type ReportInput } from '../src/modules/m17/server/report';

const regular = INTERREG_RUBRICS.find((r) => r.id === 'interreg-next-bsb.call2.regular')!;
const ssp = INTERREG_RUBRICS.find((r) => r.id === 'interreg-next-bsb.call2.ssp')!;
const defOf = (r: typeof regular): RubricDef => ({
  id: r.id,
  allowedMarks: [...r.allowedMarks],
  maxRaw: r.maxRaw,
  passRaw: r.passRaw,
  criteria: r.criteria.map(({ criterionKey, maxMark, knockoutBelow }) => ({ criterionKey, maxMark, knockoutBelow })),
});
const def = defOf(regular);
const keys = def.criteria.map((c) => c.criterionKey);
const all = (mark: number) => Object.fromEntries(keys.map((k) => [k, mark]));
const grid: EvaluationGrid = { def, programCheckKeys: regular.programChecks.map((p) => p.key) };

describe('rubric profile zod', () => {
  it('accepts every seeded profile (call2.regular default, call2.ssp)', () => {
    expect(INTERREG_RUBRICS.map((r) => r.id)).toEqual(expect.arrayContaining([regular.id, ssp.id]));
    for (const r of INTERREG_RUBRICS) expect(rubricProfileSchema.safeParse(r).success, r.id).toBe(true);
    expect(ssp.isDefault).toBe(false);
    expect(ssp.criteria).toHaveLength(12);
    expect(ssp.maxRaw).toBe(48);
    expect(ssp.passRaw).toBe(32);
  });

  it('refuses a scale with 0 and a maxMark of 4.5 that does not add up', () => {
    expect(rubricProfileSchema.safeParse({ ...regular, allowedMarks: [0, ...regular.allowedMarks] }).success).toBe(false);
    const c = [{ ...regular.criteria[0]!, maxMark: 4.5 }, ...regular.criteria.slice(1)];
    expect(rubricProfileSchema.safeParse({ ...regular, criteria: c }).success).toBe(false);
  });

  it('refuses an unknown field and a tie-break naming nothing', () => {
    expect(rubricProfileSchema.safeParse({ ...regular, weight: 2 }).success).toBe(false);
    expect(rubricProfileSchema.safeParse({ ...regular, tieBreak: ['criterion:nope'] }).success).toBe(false);
  });
});

describe('marks zod — the full set of marks, on the scale', () => {
  const schema = marksSchema(def);
  it('accepts one allowed mark per criterion', () => {
    expect(schema.safeParse(all(3)).success).toBe(true);
  });
  it('refuses 0 and 4.5', () => {
    expect(schema.safeParse({ ...all(3), [keys[0]!]: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...all(3), [keys[0]!]: 4.5 }).success).toBe(false);
  });
  it('refuses a missing and an extra criterionKey', () => {
    const missing = all(3);
    delete missing[keys[5]!];
    expect(schema.safeParse(missing).success).toBe(false);
    expect(schema.safeParse({ ...all(3), extra_key: 3 }).success).toBe(false);
  });
});

describe('score view (to100) and knockout flags', () => {
  it('37/56 → 66.1, 14/56 → 25, 56/56 → 100', () => {
    expect(to100(def, 37)).toBe(66.1);
    expect(to100(def, 14)).toBe(25);
    expect(to100(def, 56)).toBe(100);
    expect(scoreMarks(def, all(1)).score100).toBe(25);
    expect(scoreMarks(def, all(4)).score100).toBe(100);
  });

  it('flags 1.1 at 2.5 even with a passing total', () => {
    const flags = knockoutFlags(def, { ...all(3.5), relevance_so_fit: 2.5 });
    expect(flags).toEqual([{ kind: 'criterion', criterionKey: 'relevance_so_fit', mark: 2.5, floor: 3 }]);
  });

  it('flags a total of 36.5 (below 37) with no knockout criterion low', () => {
    // 13 × 2.5 + 4 = 36.5; the three knockout criteria at 3 or above.
    const marks: Record<string, number> = { ...all(2.5), relevance_so_fit: 3, relevance_transnational_value: 3, workplan_coherent: 3 };
    marks[keys[13]!] = 36.5 - Object.entries(marks).filter(([k]) => k !== keys[13]).reduce((s, [, v]) => s + v, 0);
    expect(scoreMarks(def, marks).raw).toBe(36.5);
    expect(knockoutFlags(def, marks)).toEqual([{ kind: 'total', raw: 36.5, passRaw: 37 }]);
  });
});

function answer(over: Record<string, unknown> = {}, marks: Record<string, number> = all(3)) {
  return {
    rubricId: regular.id,
    callGridNote: null,
    criterionMarks: keys.map((k) => ({
      criterionKey: k,
      mark: marks[k],
      strengths: [`${k} strength`],
      weaknesses: [`${k} weakness`],
      evidence: [{ quote: `quote for ${k}`, location: 'C.4' }],
    })),
    programChecks: grid.programCheckKeys.map((key) => ({ key, status: 'met', note: `${key} ok` })),
    redFlags: [{ finding: 'No RCR indicator chosen', why: 'Result indicators are compulsory', fix: 'Add RCR79' }],
    improvements: [{ criterionKey: 'coherence_indicators', suggestion: 'Quantify RCO87' }],
    rewrite: { originalExcerpt: 'We will do things.', location: 'C.2.1', revisedEn: 'The partnership will jointly develop…' },
    ...over,
  };
}

describe('model answer schema (parseEvaluation)', () => {
  it('accepts a complete answer, inside a Markdown fence too, and returns marks in grid order', () => {
    const a = answer();
    a.criterionMarks.reverse();
    const r = parseEvaluation('```json\n' + JSON.stringify(a) + '\n```', grid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.output.criterionMarks.map((m) => m.criterionKey)).toEqual(keys);
  });

  it('refuses a missing criterion, a duplicate, an off-scale mark, a wrong rubric', () => {
    const a = answer();
    expect(parseEvaluation(JSON.stringify({ ...a, criterionMarks: a.criterionMarks.slice(1) }), grid).ok).toBe(false);
    expect(parseEvaluation(JSON.stringify({ ...a, criterionMarks: [...a.criterionMarks, a.criterionMarks[0]] }), grid).ok).toBe(false);
    expect(parseEvaluation(JSON.stringify(answer({}, { ...all(3), [keys[0]!]: 0 })), grid).ok).toBe(false);
    expect(parseEvaluation(JSON.stringify(answer({}, { ...all(3), [keys[0]!]: 4.5 })), grid).ok).toBe(false);
    expect(parseEvaluation(JSON.stringify({ ...a, rubricId: ssp.id }), grid).ok).toBe(false);
  });

  it('refuses a missing or unknown programme check, a mark without evidence, a non-JSON answer', () => {
    const a = answer();
    expect(parseEvaluation(JSON.stringify({ ...a, programChecks: a.programChecks.slice(1) }), grid).ok).toBe(false);
    expect(parseEvaluation(JSON.stringify({ ...a, programChecks: [...a.programChecks, { key: 'x', status: 'met', note: 'n' }] }), grid).ok).toBe(false);
    const noEvidence = { ...a, criterionMarks: a.criterionMarks.map((m, i) => (i ? m : { ...m, evidence: [] })) };
    expect(parseEvaluation(JSON.stringify(noEvidence), grid).ok).toBe(false);
    const bad = parseEvaluation('I cannot assess this.', grid);
    expect(bad).toEqual({ ok: false, problems: ['no JSON object in the answer'] });
  });

  it('does not take a score from the model: an extra "estimatedScore" is ignored, not used', () => {
    const r = parseEvaluation(JSON.stringify({ ...answer(), estimatedScore: 99 }), grid);
    expect(r.ok).toBe(true);
    if (r.ok) expect('estimatedScore' in r.output).toBe(false);
  });
});

describe('context: grid serialisation and the window fit', () => {
  it('serialises the grid from data and leaves the thresholds out', () => {
    const s = JSON.parse(
      serializeRubric({
        id: regular.id,
        label: regular.label,
        allowedMarks: [...regular.allowedMarks],
        programChecks: regular.programChecks,
        criteria: regular.criteria.map((c) => ({ ...c, subQuestions: [...c.subQuestions], afSections: [...c.afSections] })),
      }),
    );
    expect(s.criteria).toHaveLength(14);
    expect(s.criteria[0].subQuestions.length).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toMatch(/passRaw|knockoutBelow/);
  });

  it('sends both documents whole when they fit, cuts the call guide first otherwise', () => {
    expect(fitContext('c'.repeat(10), 'p'.repeat(10), 30)).toEqual({ callText: 'c'.repeat(10), projectText: 'p'.repeat(10), callCharsOmitted: 0, projectCharsOmitted: 0 });
    expect(fitContext('c'.repeat(30), 'p'.repeat(20), 30)).toMatchObject({ callCharsOmitted: 20, projectCharsOmitted: 0 });
    expect(fitContext('c'.repeat(5), 'p'.repeat(40), 30)).toMatchObject({ callText: '', callCharsOmitted: 5, projectCharsOmitted: 10 });
    expect(CONTEXT_CHAR_BUDGET).toBeGreaterThanOrEqual(400_000);
  });
});

function reportInput(locale: 'tr' | 'en', marks: Record<string, number>, over: Record<string, unknown> = {}): ReportInput {
  const parsed = parseEvaluation(JSON.stringify(answer(over, marks)), grid);
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  const t = createTranslator({ locale, messages: locale === 'tr' ? trMessages : enMessages, namespace: 'InterregReview' });
  return {
    t: (key, values) => t(key as never, values as never),
    locale,
    criteria: regular.criteria.map((c) => ({ criterionKey: c.criterionKey, officialRef: c.officialRef, maxMark: c.maxMark })),
    programCheckKeys: grid.programCheckKeys,
    score: scoreMarks(def, marks),
    flags: knockoutFlags(def, marks),
    output: parsed.output,
    callCharsOmitted: 0,
  };
}

describe('report Markdown', () => {
  it('has the four sections in order and the score line from the marks (TR)', () => {
    const md = buildReportMarkdown(reportInput('tr', all(3)));
    const at = (s: string) => md.indexOf(s);
    expect(at('## 📊')).toBeGreaterThan(-1);
    expect(at('## 📊')).toBeLessThan(at('## 🔴'));
    expect(at('## 🔴')).toBeLessThan(at('## 🟡'));
    expect(at('## 🟡')).toBeLessThan(at('## ✍️'));
    expect(md).toContain('**Tahmini: 75/100** (Annex 7 ölçeğinde ≈42/56) — iç ön değerlendirme, resmî puan değildir');
    expect(md).not.toMatch(/hakem raporu|resmî skor/i);
  });

  it('prints an elimination risk before the score, and adds the computed red flags first (EN)', () => {
    const input = reportInput('en', { ...all(3.5), relevance_so_fit: 2.5 }, {
      programChecks: grid.programCheckKeys.map((key, i) => ({ key, status: i === 0 ? 'missing' : 'met', note: 'n' })),
    });
    const md = buildReportMarkdown(input);
    expect(md.indexOf('Elimination risk')).toBeGreaterThan(-1);
    expect(md.indexOf('Elimination risk')).toBeLessThan(md.indexOf('**Estimated:'));
    expect(md).toContain('internal pre-assessment, not an official score');
    const flags = redFlagsOf(input);
    expect(flags.map((f) => f.source)).toEqual(['knockout', 'programme_check', 'model']);
    expect(flags[0]!.finding).toContain('1.1');
  });

  it('has a translation for every seeded criterion and programme check in both locales', () => {
    for (const messages of [trMessages, enMessages]) {
      const ir = messages.InterregReview as unknown as { criteria: Record<string, string>; programChecks: Record<string, string> };
      for (const r of INTERREG_RUBRICS) {
        for (const c of r.criteria) expect(ir.criteria[c.criterionKey], c.criterionKey).toBeTruthy();
        for (const p of r.programChecks) expect(ir.programChecks[p.key], p.key).toBeTruthy();
      }
    }
  });
});

describe('credit price', () => {
  it('M17:evaluate is priced (3, the M6 evaluation class) and the schema retry is free', () => {
    expect(() => resolveCredits('M17', 'evaluate')).not.toThrow(UnpricedAiActionError);
    expect(resolveCredits('M17', 'evaluate').credits).toBe(3);
    expect(resolveCredits('M17', 'evaluate-retry').credits).toBe(0);
  });
});
