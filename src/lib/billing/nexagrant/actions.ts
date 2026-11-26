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
import { NG_PLAN_VIEW_ACTION } from './access';
import { asRole } from '@/lib/rbac';
import { readNgBillingState } from './repository';
import { readNgUsage } from './usage';
import { billingStateView, type NgBillingStateView } from './view';

/**
 * The caller's tenant: current plan, its features, and the trial. Read-only, on a read-only
 * tenant too, but not for every role: a role without NG_PLAN_VIEW_ACTION is refused with
 * ForbiddenRoleError before any subscription is read (NG-11 B1). A trial past its end is
 * already shown as Ücretsiz Kontrol. NG-250: also who may buy (`canManageBilling`) and the
 * counters (`usage`, null for a tenant without a NexaGrant row).
 */
export async function getNgBillingStateAction(): Promise<NgBillingStateView> {
  const scope = await requireTenantAction({ readOnly: true, can: NG_PLAN_VIEW_ACTION });
  const now = new Date();
  const { state, usage } = await withTenant(scope.tenantId, async (tx) => {
    const state = await readNgBillingState(tx, scope.tenantId, now);
    return { state, usage: await readNgUsage(tx, scope.tenantId, now, state) };
  });
  // NG-250: `canManageBilling` and the counters (seats, this month's AI operations).
  return billingStateView(state, { role: asRole(scope.role), usage });
}
