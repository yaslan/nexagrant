import type { Prisma } from '@prisma/client';
import { prisma, type TenantTx } from '@/lib/db';
import { withSystemScopeOn, type SystemTx } from '@/lib/system-scope';
import { parseProvince } from '@/lib/readiness/share';
import { isIntakeTarget } from '@/modules/m18/server/intake';
import {
  PROVINCE_ROUTE_AUDIT,
  type DeactivateProvinceLeadRouteInput,
  type IntakeTenantOption,
  type ListUnmatchedLeadsInput,
  type ProvinceLeadRouteRow,
  type ProvinceRouteResult,
  type SetProvinceLeadRouteInput,
  type UnmatchedLeadPage,
  type UnmatchedReason,
} from '@/core/contracts/lead-routing';

/**
 * NG-167 — province → consultancy tenant map and the unmatched worklist. Platform data: every
 * access runs inside `withSystemScopeOn` (the table's only RLS policy is `system_scope`).
 * Callers of the admin functions must already have passed `requirePlatformAdmin()`; the
 * actions file does. Audit rows carry the province and tenant ids only (no personal data).
 */

export const UNMATCHED_PAGE_DEFAULT = 50;
export const UNMATCHED_PAGE_MAX = 200;

/** The tenant columns `isIntakeTarget` reads, plus its M18 ModuleState row (none = OFF). */
const targetSelect = {
  orgType: true, kind: true, deletedAt: true,
  moduleStates: { where: { moduleId: 'M18' }, select: { status: true }, take: 1 },
} satisfies Prisma.TenantSelect;

const routeSelect = {
  id: true, province: true, targetTenantId: true, active: true, updatedBy: true, updatedAt: true,
  tenant: { select: { name: true, slug: true, ...targetSelect } },
} satisfies Prisma.ProvinceLeadRouteSelect;

type RouteRecord = Prisma.ProvinceLeadRouteGetPayload<{ select: typeof routeSelect }>;

type NameById = ReadonlyMap<string, string | null>;

/** Display names (never e-mails) of the admins who last changed the given rows. User is system-wide (no RLS). */
async function adminNames(tx: SystemTx, rows: readonly RouteRecord[]): Promise<NameById> {
  const ids = [...new Set(rows.map((r) => r.updatedBy).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name?.trim() || null]));
}

function toRow(r: RouteRecord, names: NameById): ProvinceLeadRouteRow {
  return {
    id: r.id, province: r.province, tenantId: r.targetTenantId, tenantName: r.tenant.name, tenantSlug: r.tenant.slug,
    active: r.active, updatedBy: r.updatedBy, updatedByName: r.updatedBy ? names.get(r.updatedBy) ?? null : null, updatedAt: r.updatedAt,
    targetEligible: isIntakeTarget(r.tenant, r.tenant.moduleStates[0]?.status),
  };
}

/** The 81 names only, spelled as stored. Anything else is null. */
export function normaliseRouteProvince(raw: unknown): string | null {
  return typeof raw === 'string' ? parseProvince(raw) : null;
}

export type RouteDecision =
  | { match: true; tenantId: string }
  | { match: false; reason: Extract<UnmatchedReason, 'province_missing' | 'province_unmapped'> };

/** The target tenant of a lead from `province`. No default tenant exists: no mapping = no match. */
export async function resolveLeadRoute(tx: SystemTx, province: string | null): Promise<RouteDecision> {
  const name = normaliseRouteProvince(province);
  if (!name) return { match: false, reason: 'province_missing' };
  const route = await tx.provinceLeadRoute.findFirst({ where: { province: name, active: true }, select: { targetTenantId: true } });
  return route ? { match: true, tenantId: route.targetTenantId } : { match: false, reason: 'province_unmapped' };
}

export async function listProvinceLeadRoutes(db: typeof prisma = prisma): Promise<ProvinceLeadRouteRow[]> {
  return withSystemScopeOn(db, 'platform-admin', 'province-route.list', async (tx) => {
    const rows = await tx.provinceLeadRoute.findMany({ select: routeSelect, orderBy: [{ province: 'asc' }, { active: 'desc' }, { updatedAt: 'desc' }] });
    const names = await adminNames(tx, rows);
    return rows.map((r) => toRow(r, names));
  });
}

/**
 * Tenants a route may point at. The rule is `isIntakeTarget` itself (tenant row + M18 open to the
 * tenant, NG-205), applied to every non-deleted tenant (no second copy of it as a WHERE clause), so
 * `eligibleTenant`, this list and the M18 intake cannot drift apart.
 */
export async function listIntakeTenantOptions(db: typeof prisma = prisma): Promise<IntakeTenantOption[]> {
  const tenants = await withSystemScopeOn(db, 'platform-admin', 'province-route.tenant-options', (tx) =>
    tx.tenant.findMany({ where: { deletedAt: null }, select: { id: true, name: true, ...targetSelect }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
  );
  return tenants.filter((t) => isIntakeTarget(t, t.moduleStates[0]?.status)).map((t) => ({ id: t.id, name: t.name }));
}

/**
 * NG-215 (SEC re-review, Bulgu 1): row locks on the given tenants, taken in id order. The route set
 * and the M18 close both take them FIRST in their transaction: without them, under READ COMMITTED,
 * a set could read M18 as PILOT while a close that had not committed yet wrote OFF, and the close
 * could list the routes before the set's new route committed — both commit, M18 closed + route
 * active. With them the later one waits and then reads the other's committed rows.
 *
 * The lock is on the Tenant row, not on ModuleState: the set reads M18 with a plain read (there may
 * be no ModuleState row at all = OFF), and the close's ModuleState write comes after the route
 * close. One `SELECT … FOR UPDATE` per id, parameterised, in sorted order, so two transactions that
 * lock overlapping sets cannot wait on each other in a cycle.
 */
export async function lockTenantRows(tx: SystemTx, tenantIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(tenantIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${id} FOR UPDATE`;
  }
}

async function eligibleTenant(tx: SystemTx, tenantId: string): Promise<'ok' | 'tenant_not_found' | 'tenant_ineligible'> {
  const t = await tx.tenant.findFirst({ where: { id: tenantId }, select: targetSelect });
  if (!t) return 'tenant_not_found';
  return isIntakeTarget(t, t.moduleStates[0]?.status) ? 'ok' : 'tenant_ineligible';
}

/** Upsert on the ACTIVE row of the province (see LeadRoutingActions). One transaction with its audit row. */
export async function setProvinceLeadRoute(
  input: SetProvinceLeadRouteInput,
  actorId: string,
  db: typeof prisma = prisma
): Promise<ProvinceRouteResult> {
  const province = normaliseRouteProvince(input.province);
  if (!province) return { ok: false, error: 'invalid_province' };
  if (typeof input.tenantId !== 'string' || input.tenantId.length === 0) return { ok: false, error: 'tenant_not_found' };

  return withSystemScopeOn(db, 'platform-admin', 'province-route.set', async (tx): Promise<ProvinceRouteResult> => {
    // Lock the new target and the province's current one before reading either (see lockTenantRows):
    // a concurrent M18 close of the new target then cannot miss this route, and one of the current
    // target cannot close the row this set is about to move. The first read only names the tenant
    // to lock; the row is read again under the locks.
    const activeRow = () => tx.provinceLeadRoute.findFirst({ where: { province, active: true }, select: { id: true, targetTenantId: true } });
    const seen = await activeRow();
    const locked = [input.tenantId, ...(seen ? [seen.targetTenantId] : [])];
    await lockTenantRows(tx, locked);

    const verdict = await eligibleTenant(tx, input.tenantId);
    if (verdict !== 'ok') return { ok: false, error: verdict };

    const active = await activeRow();
    // Another set moved the province in between: lock that target too. It is out of id order, so
    // in the worst case Postgres reports a deadlock and this transaction fails (nothing half-written).
    if (active && !locked.includes(active.targetTenantId)) await lockTenantRows(tx, [active.targetTenantId]);
    if (active && active.targetTenantId === input.tenantId) {
      const same = await tx.provinceLeadRoute.findUniqueOrThrow({ where: { id: active.id }, select: routeSelect });
      return { ok: true, route: toRow(same, await adminNames(tx, [same])) };
    }
    const saved = active
      ? await tx.provinceLeadRoute.update({ where: { id: active.id }, data: { targetTenantId: input.tenantId, updatedBy: actorId }, select: routeSelect })
      : await tx.provinceLeadRoute.create({ data: { province, targetTenantId: input.tenantId, active: true, updatedBy: actorId }, select: routeSelect });
    await tx.auditEvent.create({
      data: {
        tenantId: null,
        actorId,
        type: active ? PROVINCE_ROUTE_AUDIT.moved : PROVINCE_ROUTE_AUDIT.set,
        target: province,
        data: { province, fromTenantId: active?.targetTenantId ?? null, toTenantId: input.tenantId },
      },
    });
    return { ok: true, route: toRow(saved, await adminNames(tx, [saved])) };
  });
}

export async function deactivateProvinceLeadRoute(
  input: DeactivateProvinceLeadRouteInput,
  actorId: string,
  db: typeof prisma = prisma
): Promise<ProvinceRouteResult> {
  const province = normaliseRouteProvince(input.province);
  if (!province) return { ok: false, error: 'invalid_province' };
  return withSystemScopeOn(db, 'platform-admin', 'province-route.deactivate', async (tx): Promise<ProvinceRouteResult> => {
    const active = await tx.provinceLeadRoute.findFirst({ where: { province, active: true }, select: { id: true, targetTenantId: true } });
    if (!active) return { ok: false, error: 'route_not_found' };
    const saved = await tx.provinceLeadRoute.update({ where: { id: active.id }, data: { active: false, updatedBy: actorId }, select: routeSelect });
    await tx.auditEvent.create({
      data: {
        tenantId: null,
        actorId,
        type: PROVINCE_ROUTE_AUDIT.deactivated,
        target: province,
        data: { province, fromTenantId: active.targetTenantId, toTenantId: null },
      },
    });
    return { ok: true, route: toRow(saved, await adminNames(tx, [saved])) };
  });
}

/**
 * NG-215 (SEC NG-205 D-1): the province routes of a tenant that just stopped being an intake target
 * because its M18 left the statuses open to its own people. Without this the route stayed active:
 * the transfer box kept naming the tenant (`province_transfer_org_name`), the submit bound the consent
 * to it (`province_transfer_org`) and the forward was refused. The SQL functions cannot see M18
 * (ModuleState is FORCE RLS; ADR-0009), so the module write closes the route itself.
 *
 * Runs on the CALLER's transaction (the module-state write, under 'platform-admin' system scope), so
 * the status change and the route change commit or roll back together. Call it BEFORE the
 * ModuleState write: its tenant lock must be the transaction's first lock, as in the route set. One `lead-route.deactivated`
 * audit row per province, same shape as {@link deactivateProvinceLeadRoute} plus the cause.
 * Returns the provinces closed (empty when the tenant had no active route).
 */
export async function deactivateRoutesOfClosedTarget(
  tx: SystemTx,
  tenantId: string,
  cause: { moduleId: 'M18'; newStatus: string },
  actorId: string
): Promise<string[]> {
  // First statement of the caller's transaction (see lockTenantRows): a route set for this tenant
  // either committed before (its row is listed below) or waits and then reads M18 closed.
  await lockTenantRows(tx, [tenantId]);
  const active = await tx.provinceLeadRoute.findMany({ where: { targetTenantId: tenantId, active: true }, select: { id: true, province: true }, orderBy: { province: 'asc' } });
  for (const r of active) {
    await tx.provinceLeadRoute.update({ where: { id: r.id }, data: { active: false, updatedBy: actorId } });
    await tx.auditEvent.create({
      data: {
        tenantId: null,
        actorId,
        type: PROVINCE_ROUTE_AUDIT.deactivated,
        target: r.province,
        data: { province: r.province, fromTenantId: tenantId, toTenantId: null, reason: 'module_closed', moduleId: cause.moduleId, newStatus: cause.newStatus },
      },
    });
  }
  return active.map((r) => r.province);
}

/** Who closed M18 from inside the tenant's own scope: the tenant's user, or billing (no person). */
export type OwnRouteCloseActor = { kind: 'tenant_user'; userId: string } | { kind: 'billing' };

/**
 * NG-222 (NG-215 review Bulgu 2, K-583842 = A): the tenant-scoped counterpart of
 * {@link deactivateRoutesOfClosedTarget}, for the writes that turn M18 off from INSIDE the tenant's
 * own scope — its settings (`toggleModuleState`), an iyzico downgrade, a Stripe downgrade and a
 * Stripe cancellation. ProvinceLeadRoute is closed to a tenant scope (NG-175 D-1), so the route
 * close is the narrow SECURITY DEFINER function `public.close_own_province_routes`
 * (prisma/migrations/add-close-own-province-routes.sql): it takes no tenant id (it reads
 * `app.tenant_id`), closes only that tenant's routes and only while its M18 is closed, and writes
 * the `lead-route.deactivated` audit row. No scope escalation.
 *
 * `write` is the caller's ModuleState write, run on the same `tx`, so the module change and the
 * route change commit or roll back together. `modulesTurnedOff` is every module the write leaves
 * closed to the tenant's own people (`isOpenToTenantMembers` false): the whole OFF list, cascade
 * included, and — NG-228 — an unsold beta switched ON from settings (PILOT → ON). When it holds M18:
 *   1. the tenant row is locked first — the lock order of the route set and the platform-admin
 *      close (tenant row, then ModuleState), so the two closes cannot deadlock each other;
 *   2. `write` runs;
 *   3. the function reads the M18 status `write` left and closes the routes if it is closed.
 * Otherwise `write` runs alone. Returns what `write` returned.
 */
export async function withOwnRouteCloseOnM18Exit<T>(
  tx: TenantTx,
  modulesTurnedOff: readonly string[],
  actor: OwnRouteCloseActor,
  write: () => Promise<T>
): Promise<T> {
  if (!modulesTurnedOff.includes('M18')) return write();
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = current_setting('app.tenant_id', true) FOR UPDATE`;
  const result = await write();
  const actorId = actor.kind === 'tenant_user' ? actor.userId : null;
  await tx.$queryRaw`SELECT public.close_own_province_routes(${actor.kind}, ${actorId}::text) AS closed`;
  return result;
}

/** Consented leads that could not be forwarded, newest first. */
export async function listUnmatchedLeads(input: ListUnmatchedLeadsInput = {}, db: typeof prisma = prisma): Promise<UnmatchedLeadPage> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? UNMATCHED_PAGE_DEFAULT) || UNMATCHED_PAGE_DEFAULT, 1), UNMATCHED_PAGE_MAX);
  const offset = Math.max(Math.trunc(input.offset ?? 0) || 0, 0);
  const where = { routeStatus: 'unmatched' } as const;
  const [rows, total] = await withSystemScopeOn(db, 'platform-admin', 'province-route.unmatched', (tx) =>
    Promise.all([
      tx.publicLead.findMany({
        where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
        select: { id: true, name: true, email: true, organisation: true, province: true, district: true, readinessLevel: true, routeReason: true, routedAt: true, createdAt: true },
      }),
      tx.publicLead.count({ where }),
    ])
  );
  return {
    total,
    rows: rows.map((r) => ({
      publicLeadId: r.id, name: r.name, email: r.email, organisation: r.organisation, province: r.province, district: r.district, readinessLevel: r.readinessLevel,
      reason: (r.routeReason as UnmatchedReason | null) ?? 'province_unmapped', createdAt: r.createdAt, markedAt: r.routedAt,
    })),
  };
}
