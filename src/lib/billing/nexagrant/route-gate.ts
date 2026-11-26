/**
 * The NexaGrant plan gate at a route handler (NG-250): `null` lets the request on, otherwise
 * the 403 to return. Server-side, before the route reads or fetches anything.
 *
 *   403 { error: 'Forbidden', code: NG_FEATURE_NOT_IN_PLAN | NG_ROLE_FORBIDDEN | NG_MODULE_CLOSED, feature }
 *
 * The body carries a fixed code and the feature key, never a sentence: the page translates the
 * code (`ngGate.<code>` in messages/*.json). Which route calls it with which feature is listed
 * in bindings.ts and checked by bindings.test.ts.
 */
import { NextResponse } from 'next/server';
import { withTenant, type TenantTx } from '@/lib/db';
import { asRole, type Action } from '@/lib/rbac';
import type { NgFeatureKey } from './features';
import { ngFeatureGate, type NgGateDecision } from './gate';

export interface NgGateCaller {
  tenantId: string;
  /** The member's role as the session carries it; an unknown role is refused. */
  role: string | null | undefined;
}

/** The gate decision for a signed-in member, in the member's tenant scope. Shared with page-gate.tsx. */
export function ngCallerDecision(caller: NgGateCaller, action: Action, feature: NgFeatureKey): Promise<NgGateDecision> {
  const role = asRole(caller.role);
  return withTenant(caller.tenantId, (tx) => ngFeatureGate(tx, { tenantId: caller.tenantId, role }, action, feature));
}

function refusal(decision: NgGateDecision): NextResponse | null {
  if (decision.allowed) return null;
  return NextResponse.json({ error: 'Forbidden', code: decision.code, feature: decision.feature }, { status: 403 });
}

export async function ngGateResponse(caller: NgGateCaller, action: Action, feature: NgFeatureKey): Promise<NextResponse | null> {
  return refusal(await ngCallerDecision(caller, action, feature));
}

/**
 * The same gate inside a transaction the route already holds (NG-250 r7): for a handler whose
 * own role and module doors run in that transaction (Partner Search, http.ts), so the gate runs
 * after them and before the first read, in one tenant scope.
 */
export async function ngGateResponseInTx(
  tx: TenantTx,
  caller: NgGateCaller,
  action: Action,
  feature: NgFeatureKey
): Promise<NextResponse | null> {
  return refusal(await ngFeatureGate(tx, { tenantId: caller.tenantId, role: asRole(caller.role) }, action, feature));
}
