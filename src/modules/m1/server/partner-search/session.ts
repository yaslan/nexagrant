/**
 * The session side of the Partner Search routes (FO-61). Kept out of ./http.ts
 * because it imports `auth()`, which the API-key routes under /api/v1 must not
 * load (see src/lib/modules/tenant-access.ts).
 */
import type { NextResponse } from 'next/server';

import { requireTenantApi } from '@/lib/tenant';

import type { PartnerSearchCaller } from './http';

/** The signed-in member as a Partner Search caller, or the 401 of `requireTenantApi`. */
export async function sessionCaller(): Promise<{ ok: true; caller: PartnerSearchCaller } | { ok: false; response: NextResponse }> {
  const result = await requireTenantApi();
  if (!result.ok) return result;
  const { tenantId, role, isPlatformAdmin } = result.scope;
  return {
    ok: true,
    caller: { tenantId, actor: { kind: 'member', role }, viewer: { role, isPlatformAdmin } },
  };
}
