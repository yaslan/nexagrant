import { describe, test, expect } from 'vitest';

import {
  ABOVE_THRESHOLD_OUTCOMES,
  PROPOSAL_OUTCOMES,
  isAboveThreshold,
  isFunded,
  normalizeProposalOutcome,
} from '../src/lib/proposal-outcome';
import { countOutcomes, generateCSV } from '../src/lib/dashboard/fetch-metrics';
import { ESR_OUTCOMES } from '../src/lib/beta/esr-samples';

/**
 * TASK-MTQTYXC0NUT0B — the dashboard's success rate read 0 % where the data said 20 %.
 *
 * `Proposal.outcome` is a free `String?`. Every writer stores snake_case; the dashboard read
 * it back with `['SUBMITTED','FUNDED','ABOVE_THRESHOLD'].includes(...)`. Nothing threw — the
 * filter simply matched nothing, and a KPI that means "none of your proposals cleared the
 * threshold" was printed from a row that had.
 *
 * These tests pin the shape of that failure, not just the one spelling: a reader must accept
 * the canonical value AND the legacy uppercase one, must refuse a word outside the vocabulary
 * rather than invent one, and must still tell an empty workspace apart from a measured zero.
 */

describe('Proposal.outcome — one vocabulary', () => {
  test('the ESR sample set and the dashboard read the same list', () => {
    // Two copies of this list are exactly how the case mismatch survived: fix one, miss the
    // other. Identity here is the guarantee that there is only one.
    expect(ESR_OUTCOMES).toBe(PROPOSAL_OUTCOMES);
  });

  test('every above-threshold value is part of the vocabulary', () => {
    for (const outcome of ABOVE_THRESHOLD_OUTCOMES) {
      expect(PROPOSAL_OUTCOMES).toContain(outcome);
    }
  });
});

describe('normalizeProposalOutcome', () => {
  test('passes canonical values through unchanged', () => {
    for (const outcome of PROPOSAL_OUTCOMES) {
      expect(normalizeProposalOutcome(outcome)).toBe(outcome);
    }
  });

  test('forgives the legacy SCREAMING_CASE spelling — the bug this module exists for', () => {
    expect(normalizeProposalOutcome('ABOVE_THRESHOLD')).toBe('above_threshold');
    expect(normalizeProposalOutcome('FUNDED')).toBe('funded');
  });

  test('forgives mixed case and hyphen/space separators', () => {
    expect(normalizeProposalOutcome('Above_Threshold')).toBe('above_threshold');
    expect(normalizeProposalOutcome('above-threshold')).toBe('above_threshold');
    expect(normalizeProposalOutcome('  Above Threshold  ')).toBe('above_threshold');
  });

  test('answers null for nothing recorded', () => {
    expect(normalizeProposalOutcome(null)).toBeNull();
    expect(normalizeProposalOutcome(undefined)).toBeNull();
    expect(normalizeProposalOutcome('')).toBeNull();
  });

  test('refuses a word outside the vocabulary instead of inventing one', () => {
    // A typo must surface as "no outcome", never join a numerator by accident.
    expect(normalizeProposalOutcome('above_treshold')).toBeNull();
    expect(normalizeProposalOutcome('SUBMITTED')).toBeNull();
  });
});

describe('isAboveThreshold / isFunded', () => {
  test('funded, reserve and above_threshold cleared the threshold', () => {
    expect(isAboveThreshold('funded')).toBe(true);
    expect(isAboveThreshold('reserve')).toBe(true);
    expect(isAboveThreshold('above_threshold')).toBe(true);
  });

  test('below and ineligible did not', () => {
    expect(isAboveThreshold('below')).toBe(false);
    expect(isAboveThreshold('ineligible')).toBe(false);
  });

  test('an unrecorded or unrecognised outcome is not a pass', () => {
    expect(isAboveThreshold(null)).toBe(false);
    expect(isAboveThreshold('maybe')).toBe(false);
  });

  test('isFunded is the strict read of the same column', () => {
    expect(isFunded('FUNDED')).toBe(true);
    expect(isFunded('above_threshold')).toBe(false);
  });
});

const row = (outcome: string | null) => ({ proposal: outcome === null ? null : { outcome } });

describe('dashboard KPI — mixed-case outcome rows', () => {
  test('counts a row whatever case it was stored in', () => {
    const rows = [
      row('above_threshold'), // seed spelling
      row('ABOVE_THRESHOLD'), // legacy spelling
      row('Funded'),
      row('below'),
      row(null), // drafted, no outcome yet
    ];
    expect(countOutcomes(rows)).toEqual({ aboveThreshold: 3, funded: 1 });
  });

  test('reproduces the demo tenant: 1 of 5 above threshold reads 20.0 %, not 0.0', () => {
    // The exact shape of prisma/seed-proposals.ts against 5 opportunities — the numbers the
    // bug report measured (docs/ROADMAP.md E5).
    const rows = [row(null), row(null), row('above_threshold'), { proposal: null }, { proposal: null }];
    const { aboveThreshold } = countOutcomes(rows);
    expect(aboveThreshold).toBe(1);

    const csv = generateCSV({
      totalOpps: rows.length,
      aboveThresholdOpps: aboveThreshold,
      avgIsabet: 84.4,
      totalEffortDays: '28.5',
      avgG2Days: 3,
      activeModules: 6,
      stageBreakdown: [],
    });
    expect(csv).toContain('Başarı Oranı,20.0,%');
  });

  test('a workspace with no opportunities gets an empty cell, not a 0 % verdict', () => {
    // The absence-vs-zero rule the KPI cards follow (src/modules/m5/server/metrics.ts) has to
    // survive the export too: a spreadsheet reads 0 as a measurement.
    const csv = generateCSV({
      totalOpps: 0,
      aboveThresholdOpps: 0,
      avgIsabet: 0,
      totalEffortDays: '0.0',
      avgG2Days: 0,
      activeModules: 6,
      stageBreakdown: [],
    });
    expect(csv).toContain('Başarı Oranı,,%');
    expect(csv).not.toContain('Başarı Oranı,0.0,%');
  });

  test('a measured zero is still zero', () => {
    // Five opportunities, none above threshold: the honest answer is 0.0 %, and the export
    // must say so rather than hide behind the empty cell.
    const csv = generateCSV({
      totalOpps: 5,
      aboveThresholdOpps: 0,
      avgIsabet: 60,
      totalEffortDays: '4.0',
      avgG2Days: 2,
      activeModules: 6,
      stageBreakdown: [],
    });
    expect(csv).toContain('Başarı Oranı,0.0,%');
  });
});
