// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createFormatter, createTranslator, NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * FO-155 — each `SeatCandidate.breakdown` dimension is shown against its own
 * range, not as a bare number next to the "/ 100" total. The ranges come from
 * src/lib/scoring/seat-dimension-scale.ts and are pinned here to what the two
 * scorers actually produce.
 */

// Keep the real env module (db.ts reads `env.DATABASE_URL` at import time); only pin the weight.
vi.mock('@/lib/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/env')>()),
  consortiumLiveDemandWeight: undefined,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions', () => ({
  addSeat: vi.fn(),
  findCandidates: vi.fn(),
  assignSeat: vi.fn(),
  getConflicts: vi.fn(async () => []),
}));

import {
  CONSORTIUM_DIMENSION_MAX,
  MATCH_DIMENSION_SCALE,
  MATCH_LEGACY_DIMENSION_SCALE,
  seatBreakdownWriter,
  seatScoreDimensionScale,
} from '@/lib/scoring/seat-dimension-scale';
import { consortiumSeatScore, consortiumWeights, type ScoringBreakdown } from '@/lib/scoring/consortium';
import { MATCH_LEGACY_MAX_TOTAL, MATCH_MAX_TOTAL, scoreCandidate, type CandidateSignals } from '@/modules/m8/server/matching';
import { dimensionValueText, scoreNumberText } from '@/modules/m8/components/dimension-value';
import { findCandidates } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
import ConsortiumManager from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager';

afterEach(cleanup);

const NONE: CandidateSignals = {
  participationCount: 0,
  coordinatorCount: 0,
  country: 'FR',
  takenCountries: new Set(['FR']),
  sharedProjects: 0,
  isRival: true,
};
const BEST: CandidateSignals = {
  ...NONE,
  participationCount: 10,
  coordinatorCount: 5,
  takenCountries: new Set(),
  sharedProjects: 10,
  isRival: false,
};

const CONSORTIUM_KEYS = [
  'topicExperience',
  'networkCentrality',
  'countryDiversity',
  'smeBonus',
  'warmthBonus',
  'liveDemandSignal',
] as const satisfies readonly (keyof ScoringBreakdown)[];

describe('seatScoreDimensionScale', () => {
  it('the matcher: every key it writes has a range, and the range is what scoreCandidate gives', () => {
    const best = scoreCandidate(BEST);
    const worst = scoreCandidate(NONE);
    for (const key of Object.keys(best) as (keyof typeof best)[]) {
      expect(seatScoreDimensionScale('match', key), key).toEqual({ min: worst[key], max: best[key] });
    }
    expect(Object.keys(MATCH_DIMENSION_SCALE).sort()).toEqual(Object.keys(best).sort());
    // The positive caps add up to the total the 0–100 score divides by.
    const positive = Object.values(MATCH_DIMENSION_SCALE).reduce((sum, s) => sum + s.max, 0);
    expect(positive).toBe(MATCH_MAX_TOTAL);
  });

  it('a row from the old matcher keeps its old ranges, and they add up to the old 90', () => {
    expect(MATCH_LEGACY_DIMENSION_SCALE).toEqual({
      topicExperience: { min: 0, max: 35 },
      geographicBalance: { min: 0, max: 15 },
      collabHistory: { min: 0, max: 15 },
      relationshipWarmth: { min: 0, max: 15 },
      centrality: { min: 0, max: 10 },
      rivalRisk: { min: -10, max: 0 },
    });
    const positive = Object.values(MATCH_LEGACY_DIMENSION_SCALE).reduce((sum, s) => sum + s.max, 0);
    expect(positive).toBe(MATCH_LEGACY_MAX_TOTAL);
    expect(seatScoreDimensionScale('match-legacy', 'topicExperience')).toEqual({ min: 0, max: 35 });
    expect(seatScoreDimensionScale('match', 'relationshipWarmth')).toBeNull();
  });

  it('the matcher: rival risk is a penalty range, −10…0', () => {
    expect(seatScoreDimensionScale('match', 'rivalRisk')).toEqual({ min: -10, max: 0 });
  });

  it('the consortium builder: every dimension has a range, and full marks on all of them is 100', () => {
    for (const key of CONSORTIUM_KEYS) expect(seatScoreDimensionScale('consortium', key), key).not.toBeNull();
    // Pinned: these are also the scorer's maxima (consortium.ts), so a change here is a score change.
    expect(CONSORTIUM_DIMENSION_MAX).toEqual({
      topicExperience: 3,
      networkCentrality: 3,
      countryDiversity: 1.5,
      smeBonus: 1,
      warmthBonus: 1.5,
    });
    expect(seatScoreDimensionScale('consortium', 'topicExperience')).toEqual({ min: 0, max: 3 });
    expect(seatScoreDimensionScale('consortium', 'liveDemandSignal')).toEqual({ min: 0, max: 1 });
    // The maxima are the scorer's own: a candidate at every max with signal 1 scores 100.
    expect(consortiumSeatScore(CONSORTIUM_DIMENSION_MAX, 1, consortiumWeights())).toBe(100);
  });

  it('a key the writer does not score has no range, prototype keys included', () => {
    expect(seatScoreDimensionScale('match', 'networkCentrality')).toBeNull();
    expect(seatScoreDimensionScale('consortium', 'rivalRisk')).toBeNull();
    expect(seatScoreDimensionScale('consortium', 'total')).toBeNull();
    expect(seatScoreDimensionScale('match', 'toString')).toBeNull();
  });
});

describe('seatBreakdownWriter', () => {
  it('tells the two writers apart by their keys, matcher first', () => {
    expect(seatBreakdownWriter(scoreCandidate(BEST))).toBe('match');
    expect(
      seatBreakdownWriter({ ...CONSORTIUM_DIMENSION_MAX, liveDemandSignal: 0.4, liveDemandReason: null, total: 80 })
    ).toBe('consortium');
    expect(seatBreakdownWriter({ ...scoreCandidate(BEST), relationshipWarmth: 15, centrality: 10 })).toBe('match-legacy');
    // Both key sets present: the matcher wins, as in the rescore (seat-rescore.ts).
    expect(seatBreakdownWriter({ ...CONSORTIUM_DIMENSION_MAX, ...scoreCandidate(BEST) })).toBe('match');
    // Pre-FO-63 consortium rows have no liveDemandSignal.
    expect(seatBreakdownWriter({ ...CONSORTIUM_DIMENSION_MAX })).toBe('consortium');
  });

  it('a breakdown neither scorer wrote has no writer, and does not throw', () => {
    for (const odd of [null, undefined, 3, 'x', [], {}, { total: 3 }, { topicExperience: 3 }]) {
      expect(seatBreakdownWriter(odd)).toBeNull();
    }
  });
});

describe('dimensionValueText', () => {
  const tr = createTranslator({ locale: 'tr', messages: trMessages, namespace: 'Consortium' });
  const en = createTranslator({ locale: 'en', messages: enMessages, namespace: 'Consortium' });
  // What `getFormatter()` / `useFormatter()` hand the pages (FO-162).
  const trNumber = createFormatter({ locale: 'tr' }).number;
  const enNumber = createFormatter({ locale: 'en' }).number;

  it.each([
    ['tr', tr, trNumber, '3,0 / 34', '-10,0 (aralık -10…0)', '1,5 / 1,5'],
    ['en', en, enNumber, '3.0 / 34', '-10.0 (range -10…0)', '1.5 / 1.5'],
  ] as const)('%s: "x / max", and a penalty with its range, in the locale', (_locale, t, num, outOf, penalty, fractionalMax) => {
    expect(dimensionValueText(t, num, seatScoreDimensionScale('match', 'topicExperience'), 3)).toBe(outOf);
    expect(dimensionValueText(t, num, seatScoreDimensionScale('match', 'rivalRisk'), -10)).toBe(penalty);
    expect(dimensionValueText(t, num, seatScoreDimensionScale('consortium', 'countryDiversity'), 1.5)).toBe(fractionalMax);
  });

  it('without a known range only the number is shown, in the locale', () => {
    expect(dimensionValueText(tr, trNumber, null, 3)).toBe('3,0');
    expect(dimensionValueText(en, enNumber, null, 3)).toBe('3.0');
  });

  it('a score keeps exactly one decimal', () => {
    expect(scoreNumberText(trNumber, 61.54)).toBe('61,5');
    expect(scoreNumberText(enNumber, 50)).toBe('50.0');
  });
});

describe('consortium builder breakdown', () => {
  const seat = {
    id: 's-1',
    tenantId: 't-1',
    opportunityId: 'o-1',
    role: null,
    roleKey: 'research',
    required: true,
    organizationId: null,
    status: 'OPEN',
    notes: null,
    invitedAt: null,
    confirmedAt: null,
  };
  const scored: ScoringBreakdown = {
    topicExperience: 3,
    networkCentrality: 1.2,
    countryDiversity: 1.5,
    smeBonus: 0,
    warmthBonus: 0,
    liveDemandSignal: 0.4,
    liveDemandReason: null,
    total: 61.5,
  };

  async function showBreakdown(locale: 'tr' | 'en', score: unknown) {
    const messages = locale === 'tr' ? trMessages : enMessages;
    vi.mocked(findCandidates).mockResolvedValueOnce([
      { organizationId: 'org-1', rank: 1, score },
    ] as unknown as Awaited<ReturnType<typeof findCandidates>>);
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ConsortiumManager opportunityId="o-1" seats={[seat]} candidates={[]} orgMap={{}} />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(messages.Consortium.findCandidates) }));
    fireEvent.click(await screen.findByText(messages.Consortium.breakdown));
    return messages;
  }

  it.each([
    ['tr', '3,0 / 3', '1,5 / 1,5', '0,4 / 1', '61,5 / 100'],
    ['en', '3.0 / 3', '1.5 / 1.5', '0.4 / 1', '61.5 / 100'],
  ] as const)('%s: each dimension against its own maximum, labelled, in the locale', async (locale, topic, country, demand, total) => {
    const messages = await showBreakdown(locale, scored);
    expect(screen.getByTestId('m8-builder-dimension-topicExperience').textContent).toBe(topic);
    expect(screen.getByTestId('m8-builder-dimension-countryDiversity').textContent).toBe(country);
    expect(screen.getByTestId('m8-builder-dimension-liveDemandSignal').textContent).toBe(demand);
    expect(screen.getByText(messages.Consortium.dimension.networkCentrality)).toBeTruthy();
    expect(screen.getByText(messages.Consortium.breakdownNote)).toBeTruthy();
    expect(screen.getByText(total)).toBeTruthy();
  });

  it('a breakdown no scorer wrote shows bare numbers and does not throw', async () => {
    await showBreakdown('tr', { topicExperience: 3, total: 3 });
    expect(screen.getByTestId('m8-builder-dimension-topicExperience').textContent).toBe('3,0');
    expect(screen.getByTestId('m8-builder-dimension-smeBonus').textContent).toBe('0,0');
  });
});
