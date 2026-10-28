/**
 * The three gates every M17 route passes, in order (FO-186):
 *   1. a tenant session (`requireTenantApi`; a write also refuses an ended pilot),
 *   2. the module (`checkModuleAccess('M17')` — plan entitlement and ModuleState),
 *   3. the role (`can(role, 'view_proposal' | 'edit_proposal')`).
 * A refusal is a response the route returns as is; the body is `{ error: code }`.
 */
import { NextResponse } from 'next/server';

import { checkModuleAccess } from '@/lib/modules/access';
import { asRole, can } from '@/lib/rbac';
import { requireTenantApi, type TenantScope } from '@/lib/tenant';

import type { InterregApiError } from '../limits';

export type GateResult = { ok: true; scope: TenantScope } | { ok: false; response: NextResponse };

// The status is a union of literals, not a bare number: the 5xx scan in
// tests/api/api-error-body-guard.test.ts can only prove a response is not a server error
// from a status it can read, and every refusal here is a 4xx.
export function refuse(
  error: InterregApiError,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422,
  extra: Record<string, string | number> = {},
) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function gateInterreg(mode: 'read' | 'write'): Promise<GateResult> {
  const tenant = await requireTenantApi({ write: mode === 'write' });
  if (!tenant.ok) {
    // Same status codes as every tenant route (requireTenantApi answers only 401 or 403);
    // the body carries this module's codes.
    const pilot = tenant.response.status === 403;
    return { ok: false, response: refuse(pilot ? 'pilot_expired' : 'unauthorized', pilot ? 403 : 401) };
  }

  const access = await checkModuleAccess('M17');
  if (!access.allowed) {
    return { ok: false, response: refuse('module_unavailable', 403, { reason: access.reason ?? 'MODULE_OFF' }) };
  }
  if (mode === 'write' && access.limits?.readOnly) {
    return { ok: false, response: refuse('module_unavailable', 403, { reason: 'READ_ONLY_PLAN' }) };
  }

  if (!can(asRole(tenant.scope.role), mode === 'write' ? 'edit_proposal' : 'view_proposal')) {
    return { ok: false, response: refuse('forbidden_role', 403) };
  }
  return { ok: true, scope: tenant.scope };
}
