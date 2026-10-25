import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_DEMAND_WEIGHT,
  freshnessOf,
  liveDemandReason,
  liveDemandSignalFor,
  normalizedWeights,
} from '@/lib/scoring/live-demand';
import type { LiveDemandInput } from '@/core/contracts/live-demand';

const NOW = new Date('2026-10-25T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const topic = (requests: LiveDemandInput['requests']): LiveDemandInput => ({
  topicIdentifier: 'HORIZON-CL4-2026-RESILIENCE-01-12',
  requests,
});

describe('freshnessOf', () => {
  it('is full up to 14 days and zero from 90 days', () => {
    expect(freshnessOf(0)).toBe(1);
    expect(freshnessOf(14)).toBe(1);
    expect(freshnessOf(90)).toBe(0);
    expect(freshnessOf(400)).toBe(0);
  });

  it('falls linearly in between', () => {
    expect(freshnessOf(52)).toBeCloseTo(0.5, 10);
  });
});

describe('liveDemandSignalFor', () => {
  it('is zero with no requests on the topic', () => {
    const r = liveDemandSignalFor(topic([]), 'PIC-A', NOW);
    expect(r).toEqual({ signal: 0, ownRequestAgeDays: null });
  });

  it('saturates the topic-demand term at five active requests', () => {
    const requests = Array.from({ length: 8 }, (_, i) => ({
      organizationPic: `PIC-${i}`,
      publishedAt: daysAgo(200),
    }));
    // No own request, stale: only the topic-demand term (0.4) contributes.
    expect(liveDemandSignalFor(topic(requests), 'PIC-OTHER', NOW).signal).toBeCloseTo(0.4, 10);
  });

  it('gives a fresh own request the full signal when the topic is saturated', () => {
    const requests = [
      { organizationPic: 'PIC-A', publishedAt: daysAgo(3) },
      ...Array.from({ length: 4 }, (_, i) => ({ organizationPic: `PIC-${i + 1}`, publishedAt: daysAgo(3) })),
    ];
    const r = liveDemandSignalFor(topic(requests), 'PIC-A', NOW);
    expect(r.signal).toBeCloseTo(1, 10);
    expect(r.ownRequestAgeDays).toBe(3);
  });

  it('uses the freshest own request when an organisation has several', () => {
    const requests = [
      { organizationPic: 'PIC-A', publishedAt: daysAgo(60) },
      { organizationPic: 'PIC-A', publishedAt: daysAgo(5) },
    ];
    expect(liveDemandSignalFor(topic(requests), 'PIC-A', NOW).ownRequestAgeDays).toBe(5);
  });

  it('does not count another organisation or an unmatched row as own', () => {
    const requests = [
      { organizationPic: 'PIC-B', publishedAt: daysAgo(1) },
      { organizationPic: null, publishedAt: daysAgo(1) },
    ];
    const r = liveDemandSignalFor(topic(requests), 'PIC-A', NOW);
    expect(r.ownRequestAgeDays).toBeNull();
    expect(r.signal).toBeCloseTo((0.4 * 2) / 5, 10);
  });

  it('treats an own request without a publication date as having no age', () => {
    const r = liveDemandSignalFor(topic([{ organizationPic: 'PIC-A', publishedAt: null }]), 'PIC-A', NOW);
    expect(r.ownRequestAgeDays).toBeNull();
    expect(r.signal).toBeCloseTo(0.4 * (1 / 5) + 0.4, 10);
  });
});

describe('normalizedWeights', () => {
  it('defaults the live-demand weight to 15 % and sums to 1', () => {
    expect(DEFAULT_LIVE_DEMAND_WEIGHT).toBe(0.15);
    const w = normalizedWeights(DEFAULT_LIVE_DEMAND_WEIGHT);
    expect(w.liveDemand).toBeCloseTo(0.15, 10);
    const sum = Object.values(w).reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('keeps the relative proportions of the other five dimensions', () => {
    const w = normalizedWeights(0.15);
    expect(w.topicExperience / w.smeBonus).toBeCloseTo(3, 10);
    expect(w.warmthBonus / w.smeBonus).toBeCloseTo(1.5, 10);
  });

  it('falls back to the default for a non-finite config value and clamps the range', () => {
    expect(normalizedWeights(Number.NaN).liveDemand).toBe(DEFAULT_LIVE_DEMAND_WEIGHT);
    expect(normalizedWeights(2).liveDemand).toBe(1);
    expect(normalizedWeights(-1).liveDemand).toBe(0);
  });
});

describe('liveDemandReason', () => {
  it('returns the day count when M8 is on and an own request exists', () => {
    expect(liveDemandReason(5, true)).toEqual({ days: 5 });
  });

  it('hides the reason line when M8 is off, even with an own request', () => {
    expect(liveDemandReason(5, false)).toBeNull();
  });

  it('has nothing to say without an own request', () => {
    expect(liveDemandReason(null, true)).toBeNull();
  });
});
