/**
 * NexaGrant plan catalogue and subscription — database reads and writes (NG-57).
 *
 * The catalogue tables (`NgPlan`, `NgPlanFeature`, `NgPlanPrice`, `NgTrialPolicy`) are
 * platform data: every role reads them, `fabrika_app` writes none of them (RLS
 * `platform_read` + REVOKE). `NgSubscription` is tenant data under `tenant_isolation`;
 * every function touching it takes a `TenantTx`.
 */
import type { PrismaClient } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import type { NgEntitlement, NgPlanFeatureRow, NgPlanPriceRow, NgPlanRow } from './entitlement';
import type { NgSubscriptionRow, NgTrialPolicyRow, NgTrialState } from './trial';

export interface NgCatalog {
  plans: NgPlanRow[];
  features: NgPlanFeatureRow[];
  prices: NgPlanPriceRow[];
  trialPolicies: NgTrialPolicyRow[];
}

/** The whole catalogue, plans in `sortOrder`. */
export async function readNgCatalog(client: PrismaClient | TenantTx): Promise<NgCatalog> {
  void client;
  throw new Error('NG-57: readNgCatalog not implemented');
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
  void tx;
  void input;
  throw new Error('NG-57: startNgTrial not implemented');
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
 * The tenant's plan at `now`. A trial past its end is dropped to its end plan here,
 * and the drop is written (once: a concurrent reader's write matches no row).
 */
export async function readNgBillingState(tx: TenantTx, tenantId: string, now?: Date): Promise<NgBillingState> {
  void tx;
  void tenantId;
  void now;
  throw new Error('NG-57: readNgBillingState not implemented');
}
