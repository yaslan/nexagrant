/**
 * The codes the tenant console's actions may answer with. The client turns
 * `code` into `adminTenants.errors.<code>`; anything not listed is `UNKNOWN`
 * and its text stays in the server log — the same contract as
 * admin/billing/plans/failure-codes.ts.
 */
import { errorCode } from '@/lib/errors';

export const TENANT_FAILURE_CODES = [
  // src/lib/billing/plan-repository.ts, thrown by internal-plan.ts
  'LIVE_PROVIDER_SUBSCRIPTION',
  // src/lib/billing/internal-plan.ts
  'NOTE_REQUIRED',
  // src/lib/billing/subscription-owner.ts internalPlanBlocker, thrown by internal-plan.ts
  'TRIAL_PROTECTED',
  // src/lib/tenant-pic-removal.ts
  'PIC_CHANGED',
  // src/lib/tenant.ts requirePlatformAdmin()
  'PLATFORM_ADMIN_REQUIRED',
  // actions.ts: arguments that fail the zod schema
  'INVALID_INPUT',
  'UNKNOWN',
] as const;

export type TenantFailureCode = (typeof TENANT_FAILURE_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(TENANT_FAILURE_CODES);

/** The listed code a caught value carries, or `UNKNOWN`. */
export function tenantFailureCode(error: unknown): TenantFailureCode {
  const code = errorCode(error);
  return code !== undefined && KNOWN.has(code) ? (code as TenantFailureCode) : 'UNKNOWN';
}
