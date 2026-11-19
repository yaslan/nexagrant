'use server';

/**
 * NG-57 — NexaGrant billing server actions: the server contract NG-11 (pricing page, plan
 * screen) calls. Read-only; no payment here (out of NG-57 scope). The public catalogue is
 * not an action: a server component reads it with `getNgCatalogView()` (catalog-view.ts).
 *
 * Errors cross the action boundary as `digest`:
 *   SESSION_REQUIRED      — no session / no tenant
 *   NG_CATALOGUE_MISSING  — the catalogue is not seeded, or the tenant's plan row is gone
 */
import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { readNgBillingState } from './repository';
import { billingStateView, type NgBillingStateView } from './view';

/**
 * The caller's tenant: current plan, its features, and the trial. Read-only, every role, also
 * on a read-only tenant. A trial past its end is already shown as Ücretsiz Kontrol.
 */
export async function getNgBillingStateAction(): Promise<NgBillingStateView> {
  const scope = await requireTenantAction({ readOnly: true });
  const state = await withTenant(scope.tenantId, (tx) => readNgBillingState(tx, scope.tenantId));
  return billingStateView(state);
}
