import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn, type SystemTx } from '@/lib/system-scope';
import { parseProvince } from '@/lib/readiness/share';
import { isIntakeTenant } from '@/modules/m18/server/intake';
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

const routeSelect = {
  id: true, province: true, targetTenantId: true, active: true, updatedBy: true, updatedAt: true,
  tenant: { select: { name: true, slug: true } },
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
 * Tenants a route may point at. The rule is `isIntakeTenant` itself, applied to every non-deleted tenant
 * (no second copy of it as a WHERE clause), so `eligibleTenant` and this list cannot drift apart.
 */
export async function listIntakeTenantOptions(db: typeof prisma = prisma): Promise<IntakeTenantOption[]> {
  const tenants = await withSystemScopeOn(db, 'platform-admin', 'province-route.tenant-options', (tx) =>
    tx.tenant.findMany({ where: { deletedAt: null }, select: { id: true, name: true, orgType: true, kind: true, deletedAt: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
  );
  return tenants.filter(isIntakeTenant).map((t) => ({ id: t.id, name: t.name }));
}

async function eligibleTenant(tx: SystemTx, tenantId: string): Promise<'ok' | 'tenant_not_found' | 'tenant_ineligible'> {
  const t = await tx.tenant.findFirst({ where: { id: tenantId }, select: { orgType: true, kind: true, deletedAt: true } });
  if (!t) return 'tenant_not_found';
  return isIntakeTenant(t) ? 'ok' : 'tenant_ineligible';
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
    const verdict = await eligibleTenant(tx, input.tenantId);
    if (verdict !== 'ok') return { ok: false, error: verdict };

    const active = await tx.provinceLeadRoute.findFirst({ where: { province, active: true }, select: { id: true, targetTenantId: true } });
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
