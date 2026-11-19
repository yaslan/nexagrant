/**
 * NexaGrant usage counters (NG-250): what a NexaGrant tenant has used against the limits its
 * plan sets, and the refusals at those limits.
 *
 *   - seats              — members + pending (unexpired, unaccepted) invitations, the count the
 *                          platform seat limit already uses (src/lib/billing/seat-limit.ts).
 *                          Enforced only behind NG_SEAT_LIMIT_ENFORCED: the per-plan seat counts
 *                          wait on approval, so until then the number is shown, not applied.
 *   - ai_writing_monthly — `AiUsageLog` rows of the tenant since 00:00 Istanbul on the 1st of the
 *                          current Istanbul month. Every logged model call is one operation.
 *                          Enforced in `generateCompletion` (src/lib/llm.ts) under the tenant's
 *                          credit lock, before the provider is called.
 *   - eligibility_check  — the Ücretsiz Kontrol monthly allowance has no product route yet
 *                          (bindings.ts, NG_UNBOUND_FEATURES); `ngLimitAllows` is the decision it
 *                          will use, nothing counts it today.
 *
 * K-584603 = A: a tenant without an `NgSubscription` row is not a NexaGrant tenant; nothing here
 * counts or refuses it — the platform's own limits (credits, seats) stand.
 */
import type { TenantTx } from '@/lib/db';
import { env } from '@/lib/env';
import { lockTenantSeats } from '@/lib/billing/seat-limit';
import { NG_PLAN_LIMIT_REACHED } from './codes';
import { featureLimit, type NgFeatureLimit } from './entitlement';
import type { NgFeatureKey } from './features';
import { readNgBillingState, type NgBillingState } from './repository';

const ISTANBUL = 'Europe/Istanbul';

export { NG_PLAN_LIMIT_REACHED };

/** A counted limit of the plan is used up. Crosses the server-action boundary as `digest`. */
export class NgPlanLimitError extends Error {
  readonly code = NG_PLAN_LIMIT_REACHED;
  readonly digest = NG_PLAN_LIMIT_REACHED;
  constructor(
    readonly feature: NgFeatureKey,
    readonly used: number,
    readonly limit: number | null
  ) {
    super(`NexaGrant plan limit reached: ${feature} ${used}/${limit ?? 'unlimited'}`);
    this.name = 'NgPlanLimitError';
  }
}

/** One counter as the plan screen reads it. `limit` null = unlimited; 0 = not in the plan. */
export interface NgCounter {
  used: number;
  limit: number | null;
}

export interface NgUsage {
  seats: NgCounter;
  aiWritingMonthly: NgCounter & { periodStart: Date };
}

/** Pure: may one more be used, with `used` already used? Not granted or 0 → never. */
export function ngLimitAllows(limit: NgFeatureLimit, used: number): boolean {
  if (!limit.granted) return false;
  if (limit.limit === null) return true;
  return used < limit.limit;
}

/** True only when NG_SEAT_LIMIT_ENFORCED is the literal `true` (default off). */
export function ngSeatEnforcementOn(source: { NG_SEAT_LIMIT_ENFORCED?: string } = env): boolean {
  return source.NG_SEAT_LIMIT_ENFORCED === 'true';
}

function istanbulYearMonth(at: Date): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month') };
}

function istanbulOffsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: ISTANBUL, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+03:00';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** 00:00 Istanbul on the 1st of the Istanbul month `at` falls in, as a UTC instant. */
export function istanbulMonthStart(at: Date): Date {
  const { y, m } = istanbulYearMonth(at);
  const localMidnightAsUtc = Date.UTC(y, m - 1, 1);
  return new Date(localMidnightAsUtc - istanbulOffsetMinutes(new Date(localMidnightAsUtc)) * 60_000);
}

function counterLimit(l: NgFeatureLimit): number | null {
  return l.granted ? l.limit : 0;
}

async function countSeats(tx: TenantTx, tenantId: string, at: Date, exceptEmail?: string): Promise<number> {
  // Sequential: one connection holds this transaction.
  const members = await tx.membership.count({ where: { tenantId } });
  const pending = await tx.invitation.count({
    where: {
      tenantId,
      expires: { gt: at },
      acceptedAt: null,
      ...(exceptEmail ? { NOT: { email: exceptEmail } } : {}),
    },
  });
  return members + pending;
}

async function countAiThisMonth(tx: TenantTx, tenantId: string, at: Date): Promise<{ used: number; periodStart: Date }> {
  const periodStart = istanbulMonthStart(at);
  const used = await tx.aiUsageLog.count({ where: { tenantId, createdAt: { gte: periodStart } } });
  return { used, periodStart };
}

/** The counters of a NexaGrant tenant at `now`; null for a tenant without a NexaGrant row. */
export async function readNgUsage(
  tx: TenantTx,
  tenantId: string,
  now?: Date,
  state?: NgBillingState
): Promise<NgUsage | null> {
  const at = now ?? new Date();
  const s = state ?? (await readNgBillingState(tx, tenantId, at));
  if (s.source !== 'subscription') return null;
  const seats = await countSeats(tx, tenantId, at);
  const ai = await countAiThisMonth(tx, tenantId, at);
  return {
    seats: { used: seats, limit: counterLimit(featureLimit(s.entitlement, 'seats')) },
    aiWritingMonthly: {
      used: ai.used,
      limit: counterLimit(featureLimit(s.entitlement, 'ai_writing_monthly')),
      periodStart: ai.periodStart,
    },
  };
}

/**
 * Refuses one more model call past the plan's monthly AI allowance. Call with the tenant's
 * credit lock held (`lockTenantCredits`), so concurrent calls count one after another.
 */
export async function assertNgAiQuota(tx: TenantTx, tenantId: string, now?: Date): Promise<void> {
  const at = now ?? new Date();
  const state = await readNgBillingState(tx, tenantId, at);
  if (state.source !== 'subscription') return;
  const limit = featureLimit(state.entitlement, 'ai_writing_monthly');
  if (limit.granted && limit.limit === null) return;
  const { used } = await countAiThisMonth(tx, tenantId, at);
  if (!ngLimitAllows(limit, used)) throw new NgPlanLimitError('ai_writing_monthly', used, counterLimit(limit));
}

/**
 * Refuses an invitation past the plan's seat limit — only with NG_SEAT_LIMIT_ENFORCED on.
 * `email` is the address being invited: its own pending invitation is replaced, not added.
 * Takes the tenant's seat lock (re-entrant within the transaction).
 */
export async function assertNgSeatAvailable(
  tx: TenantTx,
  tenantId: string,
  email: string,
  now?: Date,
  flags: { NG_SEAT_LIMIT_ENFORCED?: string } = env
): Promise<void> {
  if (!ngSeatEnforcementOn(flags)) return;
  const at = now ?? new Date();
  const state = await readNgBillingState(tx, tenantId, at);
  if (state.source !== 'subscription') return;
  await lockTenantSeats(tx, tenantId);
  const limit = featureLimit(state.entitlement, 'seats');
  const used = await countSeats(tx, tenantId, at, email);
  if (!ngLimitAllows(limit, used)) throw new NgPlanLimitError('seats', used, counterLimit(limit));
}
