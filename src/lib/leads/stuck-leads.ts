import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn, type SystemTx } from '@/lib/system-scope';
import { LEAD_INTAKE_SOURCE_REF_PREFIX } from '@/core/contracts/lead-intake';
import {
  STUCK_LEAD_ALERT_SOURCE,
  type StuckRoutedLeadPage,
  type StuckRoutedLeadRow,
} from '@/core/contracts/lead-routing';
import { recordAlert, resolveAlerts, type AlertDbClient } from '@/lib/observability/system-alert';
import { publicLeadStuckAfterMinutes } from '@/lib/env';

/**
 * NG-182 — visibility for a lead that is `routed` but has no copy in its tenant.
 *
 * NG-181 keeps a claimed lead with its tenant when the M18 port throws (a moved map must never copy
 * it to a second tenant). If the port keeps failing, or the map moves afterwards, the lead is
 * `routeStatus = 'routed'` + `routedTenantId = A` while A holds neither a `LeadContact` nor a `Deal`
 * with `sourceRef = public-lead:<id>`: it is on no screen and in no tenant. This file only FINDS such
 * leads (admin list + a SystemAlert per lead). It does not re-route, copy, release or delete anything,
 * and it is not wired to `forwardPublicLead`.
 *
 * Reads run in `withSystemScopeOn`: PublicLead is system_scope only (NG-175) and LeadContact / Deal
 * are tenant tables whose NOT EXISTS probe spans every tenant, so no single tenant exists to hand
 * `withTenant`. The admin screen reads as 'platform-admin' (behind requirePlatformAdmin), the job as
 * 'cross-tenant-job'. A tenant session (no seal) sees 0 PublicLead rows, so it reads an empty list.
 */

export const STUCK_PAGE_MAX = 200;

export type StuckReadPurpose = 'platform-admin' | 'cross-tenant-job';

export interface ListStuckRoutedLeadsOptions {
  /**
   * A routed lead younger than this is still in flight (the port may be writing the copy).
   * Default: PUBLIC_LEAD_STUCK_AFTER_MINUTES — the admin screen and the job read the same threshold.
   */
  olderThanMinutes?: number;
  /** Who reads: the admin screen or the scheduled job. Default 'platform-admin'. */
  purpose?: StuckReadPurpose;
  /** Reference moment (the job passes its cron tick). Default: now. */
  now?: Date;
  /** Rows returned, 1..STUCK_PAGE_MAX; omitted = every stuck lead (the job). `total` always counts all. */
  limit?: number;
}

interface StuckSqlRow {
  id: string;
  routedTenantId: string;
  routedAt: Date | null;
  createdAt: Date;
  organisation: string;
  province: string | null;
  tenantName: string | null;
  tenantDeleted: boolean;
  total: bigint;
}

/**
 * The NG-181 report query, oldest first. `(tenantId, sourceRef)` is unique on both tables, so each
 * NOT EXISTS is one index probe. A copy that the tenant later soft-deleted still counts as a copy:
 * the lead was delivered. A hard-deleted tenant cascades its copies away, so its leads show here
 * with `tenantDeleted`.
 */
async function queryStuck(tx: SystemTx, cutoff: Date, limit: number | null): Promise<StuckSqlRow[]> {
  const prefix = LEAD_INTAKE_SOURCE_REF_PREFIX;
  return tx.$queryRaw<StuckSqlRow[]>`
    SELECT pl.id, pl."routedTenantId", pl."routedAt", pl."createdAt", pl.organisation, pl.province,
           t.name AS "tenantName",
           (t.id IS NULL OR t."deletedAt" IS NOT NULL) AS "tenantDeleted",
           COUNT(*) OVER () AS total
      FROM "PublicLead" pl
      LEFT JOIN "Tenant" t ON t.id = pl."routedTenantId"
     WHERE pl."routeStatus" = 'routed'
       AND pl."routedTenantId" IS NOT NULL
       AND (pl."routedAt" IS NULL OR pl."routedAt" < ${cutoff})
       AND NOT EXISTS (SELECT 1 FROM "LeadContact" c WHERE c."tenantId" = pl."routedTenantId" AND c."sourceRef" = ${prefix} || pl.id)
       AND NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d."tenantId" = pl."routedTenantId" AND d."sourceRef" = ${prefix} || pl.id)
     ORDER BY pl."routedAt" ASC NULLS FIRST, pl.id ASC
     ${limit === null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}`;
}

/** Routed leads with no copy in their tenant, older than the threshold. Read-only. */
export async function listStuckRoutedLeads(
  db: PrismaClient = prisma,
  options: ListStuckRoutedLeadsOptions = {}
): Promise<StuckRoutedLeadPage> {
  const minutes = Math.trunc(options.olderThanMinutes ?? publicLeadStuckAfterMinutes());
  if (!Number.isFinite(minutes) || minutes < 1) throw new RangeError('olderThanMinutes must be a positive integer');
  const cutoff = new Date((options.now ?? new Date()).getTime() - minutes * 60_000);
  const limit =
    options.limit === undefined ? null : Math.min(Math.max(Math.trunc(options.limit) || 1, 1), STUCK_PAGE_MAX);
  // Two literal purposes, not a variable one: rls:bypass-check records each call site by its purpose.
  const rows =
    options.purpose === 'cross-tenant-job'
      ? await withSystemScopeOn(db, 'cross-tenant-job', 'stuck-leads.alert-scan', (tx) => queryStuck(tx, cutoff, limit))
      : await withSystemScopeOn(db, 'platform-admin', 'stuck-leads.list', (tx) => queryStuck(tx, cutoff, limit));
  return {
    total: rows.length === 0 ? 0 : Number(rows[0]!.total),
    olderThanMinutes: minutes,
    rows: rows.map(
      (r): StuckRoutedLeadRow => ({
        publicLeadId: r.id,
        routedTenantId: r.routedTenantId,
        routedTenantName: r.tenantName,
        tenantDeleted: r.tenantDeleted,
        routedAt: r.routedAt,
        createdAt: r.createdAt,
        organisation: r.organisation,
        province: r.province,
      })
    ),
  };
}

export interface StuckLeadAlertResult {
  /** Stuck leads found this run. */
  stuck: number;
  /** New SystemAlert rows opened (one per stuck lead without an open alert). */
  raised: number;
  /** Stuck leads that already had an open alert: left alone, no second row, no counter bump. */
  alreadyOpen: number;
  /** Open alerts closed because their lead is no longer stuck (copy landed, lead purged). */
  resolved: number;
}

/** SystemAlert has no RLS; the job needs read + update on top of recordAlert's create. */
type StuckAlertClient = { systemAlert: Required<AlertDbClient['systemAlert']> };

function leadIdOf(meta: unknown): string | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null;
  const id = (meta as Record<string, unknown>).publicLeadId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * One open `warn` SystemAlert per stuck lead, idempotent across runs.
 *
 * The open alerts of this source are read first and a lead that already has one is skipped, so a
 * second run opens nothing and touches nothing (recordAlert's own fold only looks at the newest 5
 * open rows of a source, which is not enough for "once per lead"). An operator who resolves an alert
 * while the lead is still stuck gets a fresh one on the next run: the problem did not go away.
 * An open alert whose lead is no longer stuck is resolved by the producer.
 *
 * SystemAlert has no tenant isolation, so the alert carries the lead id only: no tenant id or name,
 * no contact data. The admin screen joins the rest back under platform-admin.
 */
export async function alertStuckRoutedLeads(options: {
  olderThanMinutes: number;
  now?: Date;
  db?: PrismaClient;
  alertClient?: StuckAlertClient;
}): Promise<StuckLeadAlertResult> {
  const db = options.db ?? prisma;
  const alerts = options.alertClient ?? (prisma as unknown as StuckAlertClient);
  const page = await listStuckRoutedLeads(db, {
    olderThanMinutes: options.olderThanMinutes,
    now: options.now,
    purpose: 'cross-tenant-job',
  });

  const open = await alerts.systemAlert.findMany({
    where: { source: STUCK_LEAD_ALERT_SOURCE, resolvedAt: null },
    select: { id: true, meta: true },
  });
  const openLeadIds = new Set(open.map((a) => leadIdOf(a.meta)).filter((id): id is string => id !== null));
  const stuckIds = new Set(page.rows.map((r) => r.publicLeadId));

  let raised = 0;
  let alreadyOpen = 0;
  for (const row of page.rows) {
    if (openLeadIds.has(row.publicLeadId)) {
      alreadyOpen += 1;
      continue;
    }
    const written = await recordAlert(
      {
        level: 'warn',
        source: STUCK_LEAD_ALERT_SOURCE,
        message: `Routed public lead ${row.publicLeadId} has no copy in its tenant after ${page.olderThanMinutes} min. See Admin > Lead routes > Stuck (no copy).`,
        meta: {
          publicLeadId: row.publicLeadId,
          olderThanMinutes: page.olderThanMinutes,
          routedAt: row.routedAt?.toISOString() ?? null,
          tenantDeleted: row.tenantDeleted,
        },
        dedupeKey: `${LEAD_INTAKE_SOURCE_REF_PREFIX}${row.publicLeadId}`,
      },
      { client: alerts }
    );
    if (written.status === 'recorded' && !written.deduped) raised += 1;
  }

  let resolved = 0;
  for (const leadId of openLeadIds) {
    if (stuckIds.has(leadId)) continue;
    const r = await resolveAlerts({ source: STUCK_LEAD_ALERT_SOURCE, meta: { publicLeadId: leadId } }, { client: alerts });
    resolved += r.resolved;
  }

  return { stuck: page.total, raised, alreadyOpen, resolved };
}
