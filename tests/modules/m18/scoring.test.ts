import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCORE_WEIGHTS,
  INTENT_POINTS,
  NEED_POINTS,
  TIMING_BANDS,
  TIMING_FAR_POINTS,
  fitSubScore,
  intentSubScore,
  needSubScore,
  resolveScoreWeights,
  scoreLead,
  timingSubScore,
  type LeadScoreInput,
} from '@/modules/m18/server/scoring';

const noNeed = { projectIdeaStated: false, readinessTestCompleted: false, budgetNeedStated: false };
const allNeed = { projectIdeaStated: true, readinessTestCompleted: true, budgetNeedStated: true };

describe('M18 lead score — weights', () => {
  it('keeps HibeLead score_weights verbatim (0.35 / 0.25 / 0.25 / 0.15)', () => {
    expect(DEFAULT_SCORE_WEIGHTS).toEqual({ fit: 0.35, need: 0.25, intent: 0.25, timing: 0.15 });
    expect(Object.isFrozen(DEFAULT_SCORE_WEIGHTS)).toBe(true);
  });

  it('falls back to the defaults when settings have no weights', () => {
    expect(resolveScoreWeights(undefined)).toEqual({ weights: DEFAULT_SCORE_WEIGHTS, source: 'default' });
    expect(resolveScoreWeights(null)).toEqual({ weights: DEFAULT_SCORE_WEIGHTS, source: 'default' });
  });

  it('uses valid tenant weights', () => {
    const w = { fit: 0.4, need: 0.2, intent: 0.2, timing: 0.2 };
    expect(resolveScoreWeights(w)).toEqual({ weights: w, source: 'settings' });
  });

  it.each([
    ['sum ≠ 1', { fit: 0.5, need: 0.5, intent: 0.5, timing: 0.5 }],
    ['negative', { fit: -0.1, need: 0.4, intent: 0.4, timing: 0.3 }],
    ['missing key', { fit: 0.5, need: 0.5, intent: 0 }],
    ['extra key', { fit: 0.35, need: 0.25, intent: 0.25, timing: 0.15, x: 0 }],
    ['not an object', 'fit=1'],
  ])('rejects invalid weights (%s) and says so via source=default', (_label, raw) => {
    expect(resolveScoreWeights(raw)).toEqual({ weights: DEFAULT_SCORE_WEIGHTS, source: 'default' });
  });
});

describe('M18 lead score — sub-scores', () => {
  it('fit is the best match, rounded and clamped; no matches is 0', () => {
    expect(fitSubScore([])).toBe(0);
    expect(fitSubScore([Number.NaN, Number.POSITIVE_INFINITY])).toBe(0);
    expect(fitSubScore([40, 72.5, 10])).toBe(73);
    expect(fitSubScore([140])).toBe(100);
    expect(fitSubScore([-5])).toBe(0);
  });

  it('need adds the stated signals and the table adds up to 100', () => {
    expect(NEED_POINTS.projectIdeaStated + NEED_POINTS.readinessTestCompleted + NEED_POINTS.budgetNeedStated).toBe(100);
    expect(needSubScore(noNeed)).toBe(0);
    expect(needSubScore(allNeed)).toBe(100);
    expect(needSubScore({ ...noNeed, projectIdeaStated: true })).toBe(50);
    expect(needSubScore({ ...noNeed, readinessTestCompleted: true })).toBe(30);
    expect(needSubScore({ ...noNeed, budgetNeedStated: true })).toBe(20);
  });

  it('intent counts each kind once, case-insensitive, ignores unknown kinds', () => {
    expect(intentSubScore([])).toBe(0);
    expect(intentSubScore(['form', 'FORM', ' Form '])).toBe(INTENT_POINTS.FORM);
    expect(intentSubScore(['note', 'stage_change'])).toBe(0);
    expect(intentSubScore(['form', 'meeting', 'email_in', 'email_click'])).toBe(100);
  });

  it('intent is capped at 100 even if the table grows', () => {
    const table = INTENT_POINTS as Record<string, number>;
    table.WHATSAPP_TEMPLATE_OPENED = 50;
    try {
      expect(intentSubScore(['form', 'meeting', 'email_in', 'email_click', 'whatsapp_template_opened'])).toBe(100);
    } finally {
      delete table.WHATSAPP_TEMPLATE_OPENED;
    }
  });

  it('timing follows the band table; past or unknown deadline is 0', () => {
    expect(TIMING_BANDS.map((b) => b.maxDays)).toEqual([13, 30, 120]);
    expect(timingSubScore(null)).toBe(0);
    expect(timingSubScore(-1)).toBe(0);
    expect(timingSubScore(Number.NaN)).toBe(0);
    expect(timingSubScore(0)).toBe(40);
    expect(timingSubScore(13)).toBe(40);
    expect(timingSubScore(14)).toBe(70);
    expect(timingSubScore(30)).toBe(70);
    expect(timingSubScore(31)).toBe(100);
    expect(timingSubScore(120)).toBe(100);
    expect(timingSubScore(121)).toBe(TIMING_FAR_POINTS);
    expect(timingSubScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('M18 lead score — total', () => {
  const input: LeadScoreInput = {
    matchFitScores: [80],
    need: { ...noNeed, projectIdeaStated: true, readinessTestCompleted: true },
    activityKinds: ['form', 'meeting'],
    daysToDeadline: 45,
  };

  it('weights the four sub-scores and rounds: 80·.35 + 80·.25 + 70·.25 + 100·.15 = 80.5 → 81', () => {
    expect(scoreLead(input)).toEqual({
      fit: 80,
      need: 80,
      intent: 70,
      timing: 100,
      weights: DEFAULT_SCORE_WEIGHTS,
      total: 81,
    });
  });

  it('a lead with nothing known scores 0; everything maxed scores 100', () => {
    expect(scoreLead({ matchFitScores: [], need: noNeed, activityKinds: [], daysToDeadline: null }).total).toBe(0);
    expect(
      scoreLead({
        matchFitScores: [100],
        need: allNeed,
        activityKinds: ['form', 'meeting', 'email_in', 'email_click'],
        daysToDeadline: 60,
      }).total
    ).toBe(100);
  });

  it('honours tenant weights and copies them into the breakdown', () => {
    const weights = { fit: 1, need: 0, intent: 0, timing: 0 };
    const result = scoreLead(input, weights);
    expect(result.total).toBe(80);
    expect(result.weights).toEqual(weights);
    expect(result.weights).not.toBe(weights);
  });

  it('clamps a total that out-of-contract weights would push over 100', () => {
    const result = scoreLead(
      { matchFitScores: [100], need: allNeed, activityKinds: ['form', 'meeting', 'email_in', 'email_click'], daysToDeadline: 60 },
      { fit: 1, need: 1, intent: 0, timing: 0 }
    );
    expect(result.total).toBe(100);
  });
});
