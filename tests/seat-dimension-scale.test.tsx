// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';

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
  seatBreakdownWriter,
  seatScoreDimensionScale,
} from '@/lib/scoring/seat-dimension-scale';
import { consortiumSeatScore, consortiumWeights, type ScoringBreakdown } from '@/lib/scoring/consortium';
import { MATCH_MAX_TOTAL, scoreCandidate, type CandidateSignals } from '@/modules/m8/server/matching';
import { dimensionValueText } from '@/modules/m8/components/dimension-value';
import { findCandidates } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions';
import ConsortiumManager from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager';

afterEach(cleanup);

const NONE: CandidateSignals = {
  participationCount: 0,
  coordinatorCount: 0,
  country: 'FR',
  takenCountries: new Set(['FR']),
  sharedProjects: 0,
  warmth: null,
  degree: 0,
  isRival: true,
};
const BEST: CandidateSignals = {
  ...NONE,
  participationCount: 10,
  coordinatorCount: 5,
  takenCountries: new Set(),
  sharedProjects: 10,
  warmth: 'hot',
  degree: 1_000,
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

  it.each([
    ['tr', tr, '3.0 / 35', '-10.0 (aralık -10…0)'],
    ['en', en, '3.0 / 35', '-10.0 (range -10…0)'],
  ] as const)('%s: "x / max", and a penalty with its range', (_locale, t, outOf, penalty) => {
    expect(dimensionValueText(t, seatScoreDimensionScale('match', 'topicExperience'), 3)).toBe(outOf);
    expect(dimensionValueText(t, seatScoreDimensionScale('match', 'rivalRisk'), -10)).toBe(penalty);
  });

  it('without a known range only the number is shown', () => {
    expect(dimensionValueText(tr, null, 3)).toBe('3.0');
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

  it.each(['tr', 'en'] as const)('%s: each dimension against its own maximum, labelled', async (locale) => {
    const messages = await showBreakdown(locale, scored);
    expect(screen.getByTestId('m8-builder-dimension-topicExperience').textContent).toBe('3.0 / 3');
    expect(screen.getByTestId('m8-builder-dimension-countryDiversity').textContent).toBe('1.5 / 1.5');
    expect(screen.getByTestId('m8-builder-dimension-liveDemandSignal').textContent).toBe('0.4 / 1');
    expect(screen.getByText(messages.Consortium.dimension.networkCentrality)).toBeTruthy();
    expect(screen.getByText(messages.Consortium.breakdownNote)).toBeTruthy();
    expect(screen.getByText('61.5 / 100')).toBeTruthy();
  });

  it('a breakdown no scorer wrote shows bare numbers and does not throw', async () => {
    await showBreakdown('tr', { topicExperience: 3, total: 3 });
    expect(screen.getByTestId('m8-builder-dimension-topicExperience').textContent).toBe('3.0');
    expect(screen.getByTestId('m8-builder-dimension-smeBonus').textContent).toBe('0.0');
  });
});
