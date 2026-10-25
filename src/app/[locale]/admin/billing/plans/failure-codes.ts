/**
 * The codes a plan-editor action may answer with (TASK-MUNZKR3PEV8EI,
 * İNCELEME-75 follow-up).
 *
 * The client turns `code` into `adminPlans.errors.<code>`, so a code is a
 * translation key. It used to be whatever `code` the thrown value carried —
 * Prisma's `P2002`, pg's `23505` — which named no key, and the fallback
 * sentence printed the error text itself. Now only a code listed here leaves
 * the server; anything else is `UNKNOWN`, and its text stays in the log.
 *
 * Not in `actions.ts`: a `'use server'` module may only export async
 * functions, and the client and the tests read this list too.
 */
import { errorCode } from '@/lib/errors';

export const PLAN_FAILURE_CODES = [
  // src/lib/billing/plan-repository.ts
  'PUBLISHED_VERSION_IMMUTABLE',
  'IMPACT_NOT_ACKNOWLEDGED',
  'MODULE_NOT_GRANTED',
  'PLAN_IN_USE',
  'LIVE_PROVIDER_SUBSCRIPTION',
  'NO_PUBLISHED_VERSION',
  // src/lib/billing/pilot.ts
  'PILOT_OVER_CONTRACT',
  // src/lib/billing/subscription-owner.ts pilotGrantBlocker, thrown by pilot.ts
  'INTERNAL_PLAN_PROTECTED',
  'TRIAL_PROTECTED',
  // src/lib/tenant.ts requirePlatformAdmin()
  'PLATFORM_ADMIN_REQUIRED',
  // actions.ts setVisibilityAction: a value outside PlanVisibility (İNCELEME-94 G-1)
  'INVALID_VISIBILITY',
  'UNKNOWN',
] as const;

export type PlanFailureCode = (typeof PLAN_FAILURE_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(PLAN_FAILURE_CODES);

/** The listed code a caught value carries, or `UNKNOWN`. */
export function planFailureCode(error: unknown): PlanFailureCode {
  const code = errorCode(error);
  return code !== undefined && KNOWN.has(code) ? (code as PlanFailureCode) : 'UNKNOWN';
}
