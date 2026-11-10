/**
 * The two gates the NG-34 record routes pass: a tenant session (a write also refuses an ended
 * pilot) and the role. A refusal is a response the route returns as is, `{ error: code }`.
 */
import { NextResponse } from 'next/server';

import { asRole, can, type Action } from '@/lib/rbac';
import { requireTenantApi, type TenantScope } from '@/lib/tenant';

export type RecordsApiError = 'unauthorized' | 'pilot_expired' | 'forbidden_role' | 'not_found' | 'invalid_body';

// A union of literals, not a bare number: tests/api/api-error-body-guard.test.ts proves a
// response is not a server error from a status it can read.
export function refuse(error: RecordsApiError, status: 400 | 401 | 403 | 404) {
  return NextResponse.json({ error }, { status });
}

export type RecordsGate = { ok: true; scope: TenantScope } | { ok: false; response: NextResponse };

export async function gateRecords(action: Action, mode: 'read' | 'write'): Promise<RecordsGate> {
  const tenant = await requireTenantApi({ write: mode === 'write' });
  if (!tenant.ok) {
    const pilot = tenant.response.status === 403;
    return { ok: false, response: refuse(pilot ? 'pilot_expired' : 'unauthorized', pilot ? 403 : 401) };
  }
  if (!can(asRole(tenant.scope.role), action)) return { ok: false, response: refuse('forbidden_role', 403) };
  return { ok: true, scope: tenant.scope };
}

/** A body that is not JSON reads as `undefined`, which every input schema refuses. */
export function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => undefined);
}
