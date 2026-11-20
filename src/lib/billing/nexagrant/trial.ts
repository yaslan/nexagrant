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
import type { SubStatus } from '@prisma/client';
import { pilotEndsAt } from '@/lib/billing/pilot';
import { NG_TRIAL_PROVIDER, type NgTrialSegment } from './features';

const DAY_MS = 86_400_000;

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
  status: SubStatus;
  provider: string;
  trialSegment: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialEndPlanId: string | null;
  trialEndedAt: Date | null;
}

/** The trial segment of an organisation type (`Tenant.orgType`). */
export function trialSegmentFor(orgType: string | null | undefined): NgTrialSegment {
  return orgType === 'MUNICIPALITY' ? 'municipality' : 'default';
}

/** The policy row of a segment, or null when the catalogue has none (then no trial is started). */
export function trialPolicyFor(
  policies: readonly NgTrialPolicyRow[],
  segment: NgTrialSegment
): NgTrialPolicyRow | null {
  return policies.find((p) => p.segment === segment) ?? null;
}

/** When a trial that starts at `start` and lasts `days` Istanbul calendar days ends. */
export function trialEndsAt(start: Date, days: number): Date {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError(`trial length must be a positive whole number of days, got ${days}`);
  }
  return pilotEndsAt(start, days);
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
  if (!sub || !sub.trialStartedAt || !sub.trialEndsAt) return { kind: 'none' };
  const base = { segment: sub.trialSegment, startedAt: sub.trialStartedAt, endsAt: sub.trialEndsAt };
  const running = sub.trialEndedAt === null && sub.status === 'TRIALING' && now.getTime() < sub.trialEndsAt.getTime();
  if (running) {
    return {
      kind: 'running',
      ...base,
      daysLeft: Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS),
      endPlanId: sub.trialEndPlanId,
    };
  }
  return { kind: 'ended', ...base, endedAt: sub.trialEndedAt };
}

/** The write that drops a run-out trial to its end plan, or null when nothing is due. */
export interface NgTrialExpiry {
  planId: string;
  status: 'ACTIVE';
  trialEndedAt: Date;
}

export function trialExpiryOf(sub: NgSubscriptionRow | null | undefined, now: Date): NgTrialExpiry | null {
  if (!sub || sub.provider !== NG_TRIAL_PROVIDER || sub.status !== 'TRIALING') return null;
  if (sub.trialEndedAt !== null || !sub.trialEndsAt || !sub.trialEndPlanId) return null;
  if (now.getTime() < sub.trialEndsAt.getTime()) return null;
  return { planId: sub.trialEndPlanId, status: 'ACTIVE', trialEndedAt: now };
}
