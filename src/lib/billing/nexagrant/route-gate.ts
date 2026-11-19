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
import { withTenant } from '@/lib/db';
import { asRole, type Action } from '@/lib/rbac';
import type { NgFeatureKey } from './features';
import { ngFeatureGate } from './gate';

export interface NgGateCaller {
  tenantId: string;
  /** The member's role as the session carries it; an unknown role is refused. */
  role: string | null | undefined;
}

export async function ngGateResponse(caller: NgGateCaller, action: Action, feature: NgFeatureKey): Promise<NextResponse | null> {
  const role = asRole(caller.role);
  const decision = await withTenant(caller.tenantId, (tx) => ngFeatureGate(tx, { tenantId: caller.tenantId, role }, action, feature));
  if (decision.allowed) return null;
  return NextResponse.json({ error: 'Forbidden', code: decision.code, feature: decision.feature }, { status: 403 });
}
