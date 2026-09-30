import type { SystemTx } from '@/lib/system-scope';

/**
 * Whether a tenant found through a sessionless credential may still be served
 * (TASK-MUO4GO5ARDY2W, İNCELEME-86 Y-1).
 *
 * A soft-deleted tenant (`Tenant.deletedAt` set, in its hold before the purge)
 * is closed to its own members: the jwt callback drops it from the session
 * (src/lib/auth.ts). A token that names the tenant itself — a partner portal
 * link, an invitation — must not keep it open to people outside it. Any
 * `deletedAt` counts, a future one included: "set" means deleted. Clearing it
 * gives the same token its access back, since nothing here is revoked.
 *
 * Takes the discovery transaction the token was resolved in, so the check
 * reads the same snapshot. `Tenant` has no row policy, so it answers under
 * `fabrika_app` as well.
 */
export async function isTenantLive(tx: SystemTx, tenantId: string): Promise<boolean> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { deletedAt: true } });
  return tenant !== null && tenant.deletedAt === null;
}

/**
 * `rows` without those whose tenant is soft-deleted (or gone), for the cron
 * fan-outs that read many tenants' rows by a bare `tenantId` scalar and then
 * mail someone about them (TASK-MUO4GO5ARDY2W). The models they read declare
 * no `tenant` relation, so this is one extra `Tenant` read for the whole batch
 * rather than a filter on the fan-out query itself.
 */
export async function keepLiveTenantRows<T extends { tenantId: string }>(tx: SystemTx, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const live = await tx.tenant.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] }, deletedAt: null },
    select: { id: true },
  });
  const liveIds = new Set(live.map((t) => t.id));
  return rows.filter((r) => liveIds.has(r.tenantId));
}
