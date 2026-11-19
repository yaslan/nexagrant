/**
 * NG-57 — trial rules (pure): segment, the 14 / 30 day boundary in Istanbul calendar
 * days, the running → ended edge and the drop to the end plan.
 */
import { describe, expect, it } from 'vitest';
import { NG_TRIAL_POLICIES } from '../../../../prisma/seed-data/nexagrant-catalog';
import { NG_TRIAL_PROVIDER } from './features';
import {
  trialEndsAt,
  trialExpiryOf,
  trialPolicyFor,
  trialSegmentFor,
  trialStateOf,
  type NgSubscriptionRow,
} from './trial';

const DAY = 86_400_000;

describe('NG-57 trial segment', () => {
  it('a municipality gets the municipality segment', () => {
    expect(trialSegmentFor('MUNICIPALITY')).toBe('municipality');
  });

  it.each(['SME', 'LARGE', 'UNIVERSITY', 'RESEARCH', 'PUBLIC', 'NGO', 'CONSULTANCY', 'CLUSTER', '', null, undefined])(
    '%s gets the default segment',
    (orgType) => {
      expect(trialSegmentFor(orgType)).toBe('default');
    }
  );

  it('the policy of each segment comes from the catalogue rows; none → null', () => {
    expect(trialPolicyFor(NG_TRIAL_POLICIES, 'default')?.days).toBe(14);
    expect(trialPolicyFor(NG_TRIAL_POLICIES, 'municipality')?.days).toBe(30);
    expect(trialPolicyFor([], 'default')).toBeNull();
  });
});

describe('NG-57 trial length (Istanbul calendar days, start day = day 1)', () => {
  // 18.11.2026 13:00 Istanbul (UTC+3).
  const start = new Date('2026-11-18T10:00:00Z');

  it('14 days → ends 02.12.2026 00:00 Istanbul', () => {
    expect(trialEndsAt(start, 14).toISOString()).toBe('2026-12-01T21:00:00.000Z');
  });

  it('30 days → ends 18.12.2026 00:00 Istanbul', () => {
    expect(trialEndsAt(start, 30).toISOString()).toBe('2026-12-17T21:00:00.000Z');
  });

  it('a start at 23:59 and one at 00:01 the same Istanbul day end at the same instant', () => {
    const late = new Date('2026-11-18T20:59:00Z'); // 23:59 Istanbul
    const early = new Date('2026-11-17T21:01:00Z'); // 00:01 Istanbul
    expect(trialEndsAt(late, 14).getTime()).toBe(trialEndsAt(early, 14).getTime());
  });

  it('refuses a non-positive or fractional length', () => {
    expect(() => trialEndsAt(start, 0)).toThrow();
    expect(() => trialEndsAt(start, -1)).toThrow();
    expect(() => trialEndsAt(start, 1.5)).toThrow();
  });
});

describe('NG-57 trial state and expiry', () => {
  const startedAt = new Date('2026-11-18T10:00:00Z');
  const endsAt = new Date('2026-12-01T21:00:00Z'); // = trialEndsAt(startedAt, 14), asserted above
  const trial: NgSubscriptionRow = {
    tenantId: 't1',
    planId: 'ng-pro',
    status: 'TRIALING',
    provider: NG_TRIAL_PROVIDER,
    trialSegment: 'default',
    trialStartedAt: startedAt,
    trialEndsAt: endsAt,
    trialEndPlanId: 'ng-free',
    trialEndedAt: null,
  };

  it('no row → no trial', () => {
    expect(trialStateOf(null, startedAt)).toEqual({ kind: 'none' });
    expect(trialExpiryOf(null, startedAt)).toBeNull();
  });

  it('on the first day: running, 14 days left', () => {
    const s = trialStateOf(trial, startedAt);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') {
      expect(s.daysLeft).toBe(14);
      expect(s.endPlanId).toBe('ng-free');
    }
  });

  it('one millisecond before the end: still running, 1 day left, nothing to drop', () => {
    const at = new Date(endsAt.getTime() - 1);
    const s = trialStateOf(trial, at);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') expect(s.daysLeft).toBe(1);
    expect(trialExpiryOf(trial, at)).toBeNull();
  });

  it('at the end instant: ended, and the drop to Ücretsiz Kontrol is due', () => {
    expect(trialStateOf(trial, endsAt).kind).toBe('ended');
    expect(trialExpiryOf(trial, endsAt)).toEqual({ planId: 'ng-free', status: 'ACTIVE', trialEndedAt: endsAt });
  });

  it('long after the end: the drop records the instant it was applied', () => {
    const later = new Date(endsAt.getTime() + 3 * DAY);
    expect(trialExpiryOf(trial, later)).toEqual({ planId: 'ng-free', status: 'ACTIVE', trialEndedAt: later });
  });

  it('a dropped row stays ended and is not dropped again', () => {
    const dropped: NgSubscriptionRow = { ...trial, planId: 'ng-free', status: 'ACTIVE', trialEndedAt: endsAt };
    const later = new Date(endsAt.getTime() + DAY);
    expect(trialStateOf(dropped, later)).toEqual({
      kind: 'ended',
      segment: 'default',
      startedAt,
      endsAt,
      endedAt: endsAt,
    });
    expect(trialExpiryOf(dropped, later)).toBeNull();
  });

  it('a paid row that once trialled is not dropped', () => {
    const paid: NgSubscriptionRow = { ...trial, status: 'ACTIVE', provider: 'stripe' };
    expect(trialExpiryOf(paid, new Date(endsAt.getTime() + DAY))).toBeNull();
  });

  it('a trial row without an end plan is never dropped to a guess', () => {
    expect(trialExpiryOf({ ...trial, trialEndPlanId: null }, endsAt)).toBeNull();
  });
});
