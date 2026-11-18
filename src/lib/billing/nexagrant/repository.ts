/**
 * NexaGrant plan catalogue and subscription — database reads and writes (NG-57).
 *
 * The catalogue tables (`NgPlan`, `NgPlanFeature`, `NgPlanPrice`, `NgTrialPolicy`) are
 * platform data: every role reads them, `fabrika_app` writes none of them (RLS
 * `platform_read` + REVOKE). `NgSubscription` is tenant data under `tenant_isolation`;
 * every function touching it takes a `TenantTx`.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import { entitlementFor, type NgEntitlement, type NgPlanFeatureRow, type NgPlanPriceRow, type NgPlanRow } from './entitlement';
import { NG_TRIAL_PROVIDER } from './features';
import {
  trialEndsAt,
  trialExpiryOf,
  trialPolicyFor,
  trialSegmentFor,
  trialStateOf,
  type NgSubscriptionRow,
  type NgTrialPolicyRow,
  type NgTrialState,
} from './trial';

/** The catalogue has no plan the tenant can be put on (not seeded, or the row is gone). Code: NG_CATALOGUE_MISSING. */
export class NgCatalogueMissingError extends Error {
  readonly code = 'NG_CATALOGUE_MISSING';
  /** Kept by Next.js across the server-action boundary, like SESSION_REQUIRED. */
  readonly digest = 'NG_CATALOGUE_MISSING';
  constructor(what: string) {
    super(`NexaGrant catalogue is missing ${what}; run the seed (pnpm db:seed).`);
    this.name = 'NgCatalogueMissingError';
  }
}

const PLAN_SELECT = { id: true, tier: true, sortOrder: true, sellable: true, isFallback: true } as const;
const SUB_SELECT = {
  tenantId: true,
  planId: true,
  status: true,
  provider: true,
  trialSegment: true,
  trialStartedAt: true,
  trialEndsAt: true,
  trialEndPlanId: true,
  trialEndedAt: true,
} as const;

async function readSubscription(tx: Prisma.TransactionClient, tenantId: string): Promise<NgSubscriptionRow | null> {
  return tx.ngSubscription.findUnique({ where: { tenantId }, select: SUB_SELECT });
}

export interface NgCatalog {
  plans: NgPlanRow[];
  features: NgPlanFeatureRow[];
  prices: NgPlanPriceRow[];
  trialPolicies: NgTrialPolicyRow[];
}

/** The whole catalogue, plans in `sortOrder`. */
export async function readNgCatalog(client: PrismaClient | TenantTx): Promise<NgCatalog> {
  const [plans, features, prices, trialPolicies] = await Promise.all([
    client.ngPlan.findMany({ select: PLAN_SELECT, orderBy: { sortOrder: 'asc' } }),
    client.ngPlanFeature.findMany({
      select: { planId: true, featureKey: true, limitValue: true },
      orderBy: [{ planId: 'asc' }, { featureKey: 'asc' }],
    }),
    client.ngPlanPrice.findMany({
      select: { planId: true, currency: true, interval: true, amountMinor: true },
      orderBy: [{ planId: 'asc' }, { currency: 'asc' }, { interval: 'asc' }],
    }),
    client.ngTrialPolicy.findMany({
      select: { segment: true, days: true, planId: true, endPlanId: true },
      orderBy: { segment: 'asc' },
    }),
  ]);
  return { plans, features, prices, trialPolicies };
}

export type StartNgTrialResult =
  | { kind: 'started'; subscription: NgSubscriptionRow }
  | { kind: 'exists'; subscription: NgSubscriptionRow }
  | { kind: 'no-policy' };

export interface StartNgTrialInput {
  tenantId: string;
  /** `Tenant.orgType`; MUNICIPALITY gets the municipality policy. */
  orgType: string | null | undefined;
  now?: Date;
}

/**
 * Start the tenant's trial — once. A tenant that already has a NexaGrant subscription
 * row (trialling, dropped or paid) gets `exists` and nothing is written. A catalogue
 * without a policy for the segment gets `no-policy`: registration goes on, the tenant
 * is on the fallback plan.
 */
export async function startNgTrial(tx: TenantTx, input: StartNgTrialInput): Promise<StartNgTrialResult> {
  return startTrialOn(tx, input);
}

/**
 * The registration path: the tenant was created in this same transaction, so there is no
 * `withTenant` to mint a `TenantTx` — the transaction is bound with `bindTransactionToTenant`
 * instead (src/lib/legal/registration-consent.ts). This refuses a transaction bound to any
 * other tenant (or none), so it cannot become a way around the brand.
 */
export async function startNgTrialAtRegistration(
  tx: Prisma.TransactionClient,
  input: StartNgTrialInput
): Promise<StartNgTrialResult> {
  const [bound] = await tx.$queryRaw<{ t: string | null }[]>`SELECT current_setting('app.tenant_id', true) AS t`;
  if (!input.tenantId || bound?.t !== input.tenantId) {
    throw new Error('startNgTrialAtRegistration: the transaction is not bound to this tenant');
  }
  return startTrialOn(tx, input);
}

async function startTrialOn(tx: Prisma.TransactionClient, input: StartNgTrialInput): Promise<StartNgTrialResult> {
  const now = input.now ?? new Date();
  const existing = await readSubscription(tx, input.tenantId);
  if (existing) return { kind: 'exists', subscription: existing };

  const segment = trialSegmentFor(input.orgType);
  const policies = await tx.ngTrialPolicy.findMany({
    where: { segment },
    select: { segment: true, days: true, planId: true, endPlanId: true },
  });
  const policy = trialPolicyFor(policies, segment);
  if (!policy) return { kind: 'no-policy' };

  // ON CONFLICT DO NOTHING: two concurrent registrations of the same tenant write one row.
  const { count } = await tx.ngSubscription.createMany({
    data: [
      {
        tenantId: input.tenantId,
        planId: policy.planId,
        status: 'TRIALING',
        provider: NG_TRIAL_PROVIDER,
        trialSegment: policy.segment,
        trialStartedAt: now,
        trialEndsAt: trialEndsAt(now, policy.days),
        trialEndPlanId: policy.endPlanId,
      },
    ],
    skipDuplicates: true,
  });
  const row = await readSubscription(tx, input.tenantId);
  if (!row) throw new Error('NexaGrant trial row is not readable after insert (tenant scope mismatch?)');
  return count === 1 ? { kind: 'started', subscription: row } : { kind: 'exists', subscription: row };
}

export interface NgBillingState {
  tenantId: string;
  plan: NgPlanRow;
  /** `subscription`: the tenant has a row; `fallback`: it has none, it is on the fallback plan. */
  source: 'subscription' | 'fallback';
  status: string;
  entitlement: NgEntitlement;
  trial: NgTrialState;
}

/**
 * The tenant's plan at `now`. Read-only: a trial past its end already counts as its end plan
 * here (the decision never waits for a write); `settleNgTrial` is what writes the drop down.
 */
export async function readNgBillingState(tx: TenantTx, tenantId: string, now?: Date): Promise<NgBillingState> {
  const at = now ?? new Date();
  const stored = await readSubscription(tx, tenantId);
  const expiry = trialExpiryOf(stored, at);
  const sub: NgSubscriptionRow | null =
    stored && expiry
      ? { ...stored, planId: expiry.planId, status: expiry.status, trialEndedAt: expiry.trialEndedAt }
      : stored;

  const plan = sub
    ? await tx.ngPlan.findUnique({ where: { id: sub.planId }, select: PLAN_SELECT })
    : await tx.ngPlan.findFirst({ where: { isFallback: true }, select: PLAN_SELECT });
  if (!plan) throw new NgCatalogueMissingError(sub ? `plan ${sub.planId}` : 'a fallback plan');

  const features = await tx.ngPlanFeature.findMany({
    where: { planId: plan.id },
    select: { planId: true, featureKey: true, limitValue: true },
  });
  return {
    tenantId,
    plan,
    source: sub ? 'subscription' : 'fallback',
    status: sub?.status ?? 'ACTIVE',
    entitlement: entitlementFor(plan.id, features),
    trial: trialStateOf(sub, at),
  };
}

/**
 * Write down the drop of a run-out trial: plan → the trial's end plan, status ACTIVE,
 * `trialEndedAt` = `now`. Returns whether a row changed. Idempotent and race-safe: the
 * update is guarded on the same facts `trialExpiryOf` checked, so a second or concurrent
 * call matches no row. Nothing reads its result for a decision — `readNgBillingState`
 * already treats the trial as ended — it keeps the stored row honest.
 */
export async function settleNgTrial(tx: TenantTx, tenantId: string, now?: Date): Promise<boolean> {
  const at = now ?? new Date();
  const expiry = trialExpiryOf(await readSubscription(tx, tenantId), at);
  if (!expiry) return false;
  const { count } = await tx.ngSubscription.updateMany({
    where: {
      tenantId,
      status: 'TRIALING',
      provider: NG_TRIAL_PROVIDER,
      trialEndedAt: null,
      trialEndsAt: { lte: at },
    },
    data: { planId: expiry.planId, status: expiry.status, trialEndedAt: expiry.trialEndedAt },
  });
  return count === 1;
}
