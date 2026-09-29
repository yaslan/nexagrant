/**
 * The free public-sector pilot (TASK-MUMABL78X5JLX, owner decision 29.09.2026).
 *
 * İlkadım is signed up on a free trial only: 90 days of the Ekip package
 * (`public-team`, 6 seats), no payment, no invoice — e-Fatura is not open yet
 * (TASK-MTRJSOWFH6B45), so nothing may be sold. The pilot is an ordinary
 * `Subscription` row and no new column:
 *
 *   status TRIALING · planId public-team · planVersionId (published) ·
 *   provider 'pilot' · providerSubId null · trialEndsAt = end of day 90
 *
 * `getEntitlements` already treats TRIALING as live, so the modules and the
 * seat limit follow from the row. What this file adds is what a trial had no
 * code for:
 *
 *   - granting it (platform admin only, idempotent, audited) — `grantPilot`;
 *   - reading whether it has run out — `pilotStateOf` / `getPilotState`;
 *   - read-only after the end — `assertTenantWritable`, called by
 *     `requireTenantAction` (every server action) and by the write route
 *     handlers. Data is kept and stays readable; writes are refused.
 *
 * `provider: 'pilot'` is what tells a pilot from a Stripe trial: a Stripe
 * TRIALING row never carries `trialEndsAt` (subscription-sync.ts does not write
 * it) and Stripe moves its status itself. The Stripe sync leaves a pilot row
 * alone (`isPilotSubscription` in subscription-sync.ts).
 */

import { withTenant, type TenantTx } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { clearedPriceLock } from '@/lib/billing/price-lock';
import {
  CONTRACT_PROVIDER,
  LiveProviderSubscriptionError,
  NoPublishedVersionError,
  publishedVersionIdFor,
} from '@/lib/billing/plan-repository';

/** `Subscription.provider` of a free pilot. Not a payment provider. */
export const PILOT_PROVIDER = 'pilot';

/** The package the pilot runs on: Belediye Ekip (6 seats, pro modules). */
export const PILOT_PLAN_ID = 'public-team';

/** Length of one pilot term, in Istanbul calendar days. */
export const PILOT_DAYS = 90;

/** The pilot's calendar is the municipality's. Turkey has no DST since 2016, but the offset is read, not assumed. */
export const PILOT_TIME_ZONE = 'Europe/Istanbul';

const SUB_LIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/** Calendar date of `at` in Istanbul, as UTC-midnight components. */
function istanbulDate(at: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PILOT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Istanbul's UTC offset at `at`, in minutes (+180 today). */
function istanbulOffsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: PILOT_TIME_ZONE, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+03:00';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/**
 * When a pilot that starts at `start` ends: 00:00 Istanbul after `days` full
 * calendar days, the start day counted as day 1. A pilot granted at 23:59 on
 * 1 October and one granted at 00:01 get the same 90 days — the municipality
 * reads a date, not an hour.
 */
export function pilotEndsAt(start: Date, days: number = PILOT_DAYS): Date {
  const { y, m, d } = istanbulDate(start);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d + days);
  const offset = istanbulOffsetMinutes(new Date(localMidnightAsUtc));
  return new Date(localMidnightAsUtc - offset * 60_000);
}

/** The subscription columns this file reads. */
export interface PilotSubscriptionRow {
  status: string;
  provider: string;
  trialEndsAt: Date | null;
}

export type PilotState =
  | { kind: 'none' }
  | { kind: 'active'; endsAt: Date }
  | { kind: 'expired'; endsAt: Date };

/** Is this row a pilot at all (running or run out)? */
export function isPilotSubscription(sub: PilotSubscriptionRow | null | undefined): boolean {
  return Boolean(sub && sub.provider === PILOT_PROVIDER && sub.status === 'TRIALING' && sub.trialEndsAt);
}

/** Pure: the pilot state of a subscription row at `now`. The end instant itself is already expired. */
export function pilotStateOf(sub: PilotSubscriptionRow | null | undefined, now: Date = new Date()): PilotState {
  if (!sub || !isPilotSubscription(sub)) return { kind: 'none' };
  const endsAt = new Date(sub.trialEndsAt as Date);
  return now.getTime() < endsAt.getTime() ? { kind: 'active', endsAt } : { kind: 'expired', endsAt };
}

/** Reads the tenant's pilot state inside `tx`, or in its own tenant transaction. */
export async function getPilotState(tenantId: string, tx?: TenantTx, now: Date = new Date()): Promise<PilotState> {
  const read = (client: TenantTx) =>
    client.subscription.findUnique({
      where: { tenantId },
      select: { status: true, provider: true, trialEndsAt: true },
    }) as Promise<PilotSubscriptionRow | null>;
  const sub = tx ? await read(tx) : await withTenant(tenantId, read);
  return pilotStateOf(sub, now);
}

/** A write refused because the tenant's free pilot has ended. */
export class PilotExpiredError extends Error {
  readonly code = 'PILOT_EXPIRED';
  constructor(readonly tenantId: string, readonly endsAt: Date) {
    super(`The free pilot of tenant ${tenantId} ended at ${endsAt.toISOString()}; the workspace is read-only.`);
    this.name = 'PilotExpiredError';
  }
}

/**
 * Throws {@link PilotExpiredError} when the tenant's pilot has run out.
 * Every other tenant — paying, contract, free, a pilot still running — passes.
 */
export async function assertTenantWritable(tenantId: string, tx?: TenantTx, now: Date = new Date()): Promise<void> {
  const state = await getPilotState(tenantId, tx, now);
  if (state.kind === 'expired') throw new PilotExpiredError(tenantId, state.endsAt);
}

/** A pilot cannot be put over a subscription the tenant already has on a contract. */
export class ContractSubscriptionError extends Error {
  readonly code = 'PILOT_OVER_CONTRACT';
  constructor(readonly tenantId: string) {
    super(`Tenant ${tenantId} is already on a contract package; a free pilot would replace a sale.`);
    this.name = 'ContractSubscriptionError';
  }
}

export interface GrantPilotResult {
  /** `unchanged`: a pilot was already running and no extension was asked for. */
  outcome: 'granted' | 'extended' | 'unchanged';
  endsAt: Date;
}

/**
 * Put a tenant on the free pilot, or extend the one it has.
 *
 * Idempotent: granting again while a pilot is running changes nothing and
 * returns its end — a second click must not quietly add 90 days. Adding days
 * takes `extend: true`, which moves the end 90 days past the later of now and
 * the current end, and is audited as `billing.pilot.extended`.
 *
 * Refused over a live Stripe/iyzico subscription (the tenant is paying) and
 * over a live contract package (the tenant has bought one) — the pilot is for
 * a tenant that has neither. The caller is the platform-admin action; this
 * enforces the data rules only, like the rest of plan-repository.ts.
 */
export async function grantPilot(
  tenantId: string,
  actorId: string | null,
  opts: { extend?: boolean; now?: Date } = {}
): Promise<GrantPilotResult> {
  const now = opts.now ?? new Date();
  const planVersionId = await publishedVersionIdFor(PILOT_PLAN_ID);
  if (!planVersionId) throw new NoPublishedVersionError(PILOT_PLAN_ID);

  return withTenant(tenantId, async (tx) => {
    const existing = (await tx.subscription.findUnique({
      where: { tenantId },
      select: { planId: true, status: true, provider: true, providerSubId: true, trialEndsAt: true },
    })) as (PilotSubscriptionRow & { planId: string; providerSubId: string | null }) | null;

    const live = Boolean(existing && SUB_LIVE_STATUSES.includes(existing.status));
    if (live && existing!.provider !== PILOT_PROVIDER && existing!.provider !== CONTRACT_PROVIDER && existing!.providerSubId) {
      throw new LiveProviderSubscriptionError(tenantId, existing!.provider);
    }
    if (live && existing!.provider === CONTRACT_PROVIDER) {
      throw new ContractSubscriptionError(tenantId);
    }

    const state = pilotStateOf(existing, now);
    if (state.kind === 'active' && !opts.extend) {
      return { outcome: 'unchanged' as const, endsAt: state.endsAt };
    }

    const extending = state.kind !== 'none' && opts.extend === true;
    const from = extending && state.endsAt.getTime() > now.getTime() ? state.endsAt : now;
    // An end is 00:00 Istanbul, i.e. the first day after the term, so counting
    // 90 days from it adds exactly 90 more calendar days.
    const endsAt = pilotEndsAt(from, PILOT_DAYS);

    const terms = {
      planId: PILOT_PLAN_ID,
      planVersionId,
      status: 'TRIALING' as const,
      billingInterval: 'year',
      provider: PILOT_PROVIDER,
      providerCustomerId: null,
      providerSubId: null,
      currentPeriodEnd: endsAt,
      trialEndsAt: endsAt,
      seatsExtra: 0,
      workspacesExtra: 0,
      ...clearedPriceLock(),
    };
    await tx.subscription.upsert({ where: { tenantId }, create: { tenantId, ...terms }, update: terms });

    const outcome = extending ? ('extended' as const) : ('granted' as const);
    await tx.auditEvent.create({
      data: {
        type: extending ? 'billing.pilot.extended' : 'billing.pilot.granted',
        actorId,
        tenantId,
        target: PILOT_PLAN_ID,
        data: {
          tenantId,
          planId: PILOT_PLAN_ID,
          planVersionId,
          endsAt: endsAt.toISOString(),
          previousEndsAt: state.kind === 'none' ? null : state.endsAt.toISOString(),
          previousPlanId: existing?.planId ?? null,
          previousProvider: existing?.provider ?? null,
        },
      },
    });
    return { outcome, endsAt };
  });
}

export interface PilotRow {
  tenantId: string;
  tenantName: string;
  endsAt: Date;
  expired: boolean;
}

/** Every tenant on a pilot, soonest end first — the admin list. Cross-tenant, platform admin page only. */
export async function listPilots(now: Date = new Date()): Promise<PilotRow[]> {
  const rows = (await withSystemScope('platform-admin', 'pilot.listPilots', (tx) =>
    tx.subscription.findMany({
      where: { provider: PILOT_PROVIDER, status: 'TRIALING', trialEndsAt: { not: null } },
      orderBy: { trialEndsAt: 'asc' },
      select: { tenantId: true, trialEndsAt: true, tenant: { select: { name: true } } },
    })
  )) as Array<{ tenantId: string; trialEndsAt: Date; tenant: { name: string } | null }>;
  return rows.map((r) => ({
    tenantId: r.tenantId,
    tenantName: r.tenant?.name ?? r.tenantId,
    endsAt: r.trialEndsAt,
    expired: now.getTime() >= r.trialEndsAt.getTime(),
  }));
}

/**
 * The last day of the pilot as the municipality reads it: the Istanbul date of
 * the instant before the end (the end is 00:00 of the first day after it).
 */
export function pilotLastDayLabel(endsAt: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: PILOT_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(endsAt.getTime() - 1));
}
