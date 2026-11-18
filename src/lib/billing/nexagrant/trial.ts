/**
 * NexaGrant trial — pure rules (NG-57; NG-244 §4; K-584180 = A).
 *
 * A trial starts at registration, runs the trial plan for `days` Istanbul calendar
 * days (the length comes from `NgTrialPolicy`, per segment: municipality or default)
 * and, when it ends without a paid plan, the subscription drops to the end plan
 * (Ücretsiz Kontrol). No card is asked. Nothing is deleted on the drop: the tenant
 * simply has the end plan's features from then on.
 *
 * The end instant is computed exactly like the public-sector pilot's
 * (`pilotEndsAt`, 00:00 Istanbul after `days` full days, the start day counted as
 * day 1), so a tenant reads a date, not an hour.
 */
import type { NgTrialSegment } from './features';

/** One `NgTrialPolicy` row. */
export interface NgTrialPolicyRow {
  segment: string;
  days: number;
  planId: string;
  endPlanId: string;
}

/** The `NgSubscription` columns these rules read. */
export interface NgSubscriptionRow {
  tenantId: string;
  planId: string;
  status: string;
  provider: string;
  trialSegment: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialEndPlanId: string | null;
  trialEndedAt: Date | null;
}

/** The trial segment of an organisation type (`Tenant.orgType`). */
export function trialSegmentFor(orgType: string | null | undefined): NgTrialSegment {
  void orgType;
  throw new Error('NG-57: trialSegmentFor not implemented');
}

/** The policy row of a segment, or null when the catalogue has none (then no trial is started). */
export function trialPolicyFor(
  policies: readonly NgTrialPolicyRow[],
  segment: NgTrialSegment
): NgTrialPolicyRow | null {
  void policies;
  void segment;
  throw new Error('NG-57: trialPolicyFor not implemented');
}

/** When a trial that starts at `start` and lasts `days` Istanbul calendar days ends. */
export function trialEndsAt(start: Date, days: number): Date {
  void start;
  void days;
  throw new Error('NG-57: trialEndsAt not implemented');
}

export type NgTrialState =
  | { kind: 'none' }
  | {
      kind: 'running';
      segment: string | null;
      startedAt: Date;
      endsAt: Date;
      /** Whole days left, rounded up: 1 on the last day, never 0 while running. */
      daysLeft: number;
      endPlanId: string | null;
    }
  | { kind: 'ended'; segment: string | null; startedAt: Date; endsAt: Date; endedAt: Date | null };

/** The trial state of a subscription row at `now`. The end instant itself is already ended. */
export function trialStateOf(sub: NgSubscriptionRow | null | undefined, now: Date): NgTrialState {
  void sub;
  void now;
  throw new Error('NG-57: trialStateOf not implemented');
}

/** The write that drops a run-out trial to its end plan, or null when nothing is due. */
export interface NgTrialExpiry {
  planId: string;
  status: 'ACTIVE';
  trialEndedAt: Date;
}

export function trialExpiryOf(sub: NgSubscriptionRow | null | undefined, now: Date): NgTrialExpiry | null {
  void sub;
  void now;
  throw new Error('NG-57: trialExpiryOf not implemented');
}
