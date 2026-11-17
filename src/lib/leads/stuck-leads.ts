import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn, type SystemTx } from '@/lib/system-scope';
import { LEAD_INTAKE_SOURCE_REF_PREFIX } from '@/core/contracts/lead-intake';
import {
  STUCK_LEAD_ALERT_SOURCE,
  type StuckRoutedLeadPage,
  type StuckRoutedLeadRow,
} from '@/core/contracts/lead-routing';
import { recordAlert, resolveAlertsById, type AlertDbClient } from '@/lib/observability/system-alert';
import { publicLeadStuckAfterMinutes } from '@/lib/env';

/**
 * NG-182 — visibility for a lead that is `routed` but has no copy in its tenant.
 *
 * NG-181 keeps a claimed lead with its tenant when the M18 port throws (a moved map must never copy
 * it to a second tenant). If the port keeps failing, or the map moves afterwards, the lead is
 * `routeStatus = 'routed'` + `routedTenantId = A` while A holds neither a `LeadContact` nor a `Deal`
 * with `sourceRef = public-lead:<id>`: it is on no screen and in no tenant. This file only FINDS such
 * leads (admin list + a SystemAlert per lead). It does not re-route, copy, release or delete anything,
 * and it does not call `forwardPublicLead`.
 *
 * NG-212: the alert job also finds a lead whose transfer consent was recorded but that was NEVER routed
 * (`routeStatus` NULL, no `routedTenantId`) past the same threshold: the form's bridge did not run, or
 * threw before its claim, so the lead is in no tenant and on no worklist (the unmatched list holds only
 * 'unmatched'). The admin "Stuck (no copy)" list stays routed-only: its rows name a routed tenant.
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
  /** Null only for a never-routed lead ({@link StuckScope} 'with-unrouted'). */
  routedTenantId: string | null;
  routedAt: Date | null;
  createdAt: Date;
  organisation: string;
  province: string | null;
  tenantName: string | null;
  tenantDeleted: boolean;
  neverRouted: boolean;
  total: bigint;
}

/** 'routed': routed, no copy (admin list). 'with-unrouted': also consented leads never routed (NG-212, the alert job). */
type StuckScope = 'routed' | 'with-unrouted';

/**
 * The NG-181 report query, oldest first. `(tenantId, sourceRef)` is unique on both tables, so each
 * NOT EXISTS is one index probe. A copy that the tenant later soft-deleted still counts as a copy:
 * the lead was delivered. A hard-deleted tenant cascades its copies away, so its leads show here
 * with `tenantDeleted`. `onlyIds` narrows the scan to the given leads (the job's "is this alerted
 * lead still stuck?" check); `total` then counts within those ids.
 */
async function queryStuck(
  tx: SystemTx,
  cutoff: Date,
  limit: number | null,
  onlyIds: readonly string[] | null = null,
  scope: StuckScope = 'routed'
): Promise<StuckSqlRow[]> {
  const prefix = LEAD_INTAKE_SOURCE_REF_PREFIX;
  const routedNoCopy = Prisma.sql`(pl."routeStatus" = 'routed'
       AND pl."routedTenantId" IS NOT NULL
       AND (pl."routedAt" IS NULL OR pl."routedAt" < ${cutoff})
       AND NOT EXISTS (SELECT 1 FROM "LeadContact" c WHERE c."tenantId" = pl."routedTenantId" AND c."sourceRef" = ${prefix} || pl.id)
       AND NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d."tenantId" = pl."routedTenantId" AND d."sourceRef" = ${prefix} || pl.id))`;
  // The forwardPublicLead consent gate (hasTransferConsent): literally true AND version AND time recorded.
  const neverRouted = Prisma.sql`(pl."routeStatus" IS NULL
       AND pl."routedTenantId" IS NULL
       AND pl."transferConsent" = true
       AND pl."transferConsentVersion" IS NOT NULL
       AND pl."transferConsentAt" IS NOT NULL
       AND pl."createdAt" < ${cutoff})`;
  return tx.$queryRaw<StuckSqlRow[]>`
    SELECT pl.id, pl."routedTenantId", pl."routedAt", pl."createdAt", pl.organisation, pl.province,
           t.name AS "tenantName",
           (t.id IS NULL OR t."deletedAt" IS NOT NULL) AS "tenantDeleted",
           (pl."routeStatus" IS NULL) AS "neverRouted",
           COUNT(*) OVER () AS total
      FROM "PublicLead" pl
      LEFT JOIN "Tenant" t ON t.id = pl."routedTenantId"
     WHERE ${scope === 'with-unrouted' ? Prisma.sql`(${routedNoCopy} OR ${neverRouted})` : routedNoCopy}
       ${onlyIds === null ? Prisma.empty : Prisma.sql`AND pl.id = ANY(${[...onlyIds]}::text[])`}
     ORDER BY (CASE WHEN pl."routeStatus" = 'routed' THEN pl."routedAt" ELSE pl."createdAt" END) ASC NULLS FIRST, pl.id ASC
     ${limit === null ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}`;
}

/**
 * The one system-scope opening of this file per purpose. Two literal purposes, not a variable one:
 * rls:bypass-check records each call site by its purpose.
 */
function inStuckScope<T>(db: PrismaClient, purpose: StuckReadPurpose, fn: (tx: SystemTx) => Promise<T>): Promise<T> {
  return purpose === 'cross-tenant-job'
    ? withSystemScopeOn(db, 'cross-tenant-job', 'stuck-leads.alert-scan', fn)
    : withSystemScopeOn(db, 'platform-admin', 'stuck-leads.list', fn);
}

function stuckCutoff(olderThanMinutes: number | undefined, now: Date | undefined): { minutes: number; cutoff: Date } {
  const minutes = Math.trunc(olderThanMinutes ?? publicLeadStuckAfterMinutes());
  if (!Number.isFinite(minutes) || minutes < 1) throw new RangeError('olderThanMinutes must be a positive integer');
  return { minutes, cutoff: new Date((now ?? new Date()).getTime() - minutes * 60_000) };
}

/** Routed leads with no copy in their tenant, older than the threshold. Read-only. */
export async function listStuckRoutedLeads(
  db: PrismaClient = prisma,
  options: ListStuckRoutedLeadsOptions = {}
): Promise<StuckRoutedLeadPage> {
  const { minutes, cutoff } = stuckCutoff(options.olderThanMinutes, options.now);
  const limit =
    options.limit === undefined ? null : Math.min(Math.max(Math.trunc(options.limit) || 1, 1), STUCK_PAGE_MAX);
  const rows = await inStuckScope(db, options.purpose ?? 'platform-admin', (tx) => queryStuck(tx, cutoff, limit));
  return {
    total: rows.length === 0 ? 0 : Number(rows[0]!.total),
    olderThanMinutes: minutes,
    // 'routed' scope: the WHERE requires a routed tenant; the filter only narrows the type.
    rows: rows.flatMap((r): StuckRoutedLeadRow[] =>
      r.routedTenantId === null ? [] : [{
        publicLeadId: r.id,
        routedTenantId: r.routedTenantId,
        routedTenantName: r.tenantName,
        tenantDeleted: r.tenantDeleted,
        routedAt: r.routedAt,
        createdAt: r.createdAt,
        organisation: r.organisation,
        province: r.province,
      }]
    ),
  };
}

/**
 * At most this many per-lead alerts stay open at once. A port that fails for days can leave
 * hundreds of leads stuck; one row each would bury the alert console under a single problem. The
 * leads beyond the cap share ONE summary alert (count + the oldest few lead ids); the full list is
 * on /admin/lead-routes. Since open alerts count against the cap, a run never opens more than this.
 */
export const STUCK_LEAD_ALERTS_MAX = 50;

/** How many of the oldest uncovered lead ids the summary alert names. */
export const STUCK_SUMMARY_SAMPLE = 5;

/** `meta.stuckSummary = true` marks the summary alert; a per-lead alert carries `meta.publicLeadId`. */
const SUMMARY_META_KEY = 'stuckSummary';

export interface StuckLeadAlertResult {
  /** Stuck leads found this run. */
  stuck: number;
  /** New per-lead SystemAlert rows opened this run (never more than the cap allows). */
  raised: number;
  /** Stuck leads that already had an open alert: left alone, no second row, no counter bump. */
  alreadyOpen: number;
  /** Open per-lead alerts closed (in one statement) because their lead is no longer stuck. */
  resolved: number;
  /** Stuck leads with no per-lead alert because the cap is full: the number the summary alert carries. */
  overflow: number;
  /** The summary alert this run: opened, updated in place (count changed), unchanged, resolved, or none. */
  summary: 'none' | 'opened' | 'updated' | 'unchanged' | 'resolved';
}

function metaObject(meta: unknown): Record<string, unknown> {
  return typeof meta === 'object' && meta !== null && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

function leadIdOf(meta: unknown): string | null {
  const id = metaObject(meta).publicLeadId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * One open `warn` SystemAlert per stuck lead, up to STUCK_LEAD_ALERTS_MAX, plus ONE summary alert
 * for the rest; idempotent across runs.
 *
 * The open alerts of this source are read once, first. A lead that already has one is skipped, so a
 * second run opens nothing and touches nothing (recordAlert's own fold only looks at the newest 5
 * open rows of a source, which is not enough for "once per lead"). An operator who resolves an alert
 * while the lead is still stuck gets a fresh one on the next run (within the cap): the problem did not
 * go away. Open per-lead alerts whose lead is no longer stuck are resolved together, by id, in one
 * statement. The summary alert is updated in place while leads stay uncovered and resolved once every
 * stuck lead fits under the cap.
 *
 * The lead scan is bounded too: the oldest `cap + open + sample` stuck rows (enough to fill the free
 * slots and name the summary's oldest leads; `total` still counts every stuck lead), plus a probe of
 * the leads that hold an open alert. Both run in the same system-scope transaction.
 *
 * SystemAlert has no tenant isolation, so alerts carry lead ids only: no tenant id or name, no
 * contact data. The admin screen joins the rest back under platform-admin.
 */
export async function alertStuckRoutedLeads(options: {
  olderThanMinutes: number;
  now?: Date;
  db?: PrismaClient;
  /** Per-lead alert cap; default STUCK_LEAD_ALERTS_MAX. Tests lower it to stay small. */
  maxLeadAlerts?: number;
}): Promise<StuckLeadAlertResult> {
  const db = options.db ?? prisma;
  const alertClient = db as unknown as AlertDbClient;
  const cap = Math.max(0, Math.trunc(options.maxLeadAlerts ?? STUCK_LEAD_ALERTS_MAX));
  const { minutes, cutoff } = stuckCutoff(options.olderThanMinutes, options.now);

  // 1. The one read of open alerts. Bounded by construction (≤ cap per-lead rows + one summary).
  const open = await db.systemAlert.findMany({
    where: { source: STUCK_LEAD_ALERT_SOURCE, resolvedAt: null },
    select: { id: true, meta: true, message: true },
    orderBy: { createdAt: 'asc' },
  });
  const alertIdsByLead = new Map<string, string[]>();
  const summaries: typeof open = [];
  for (const a of open) {
    const leadId = leadIdOf(a.meta);
    if (leadId !== null) alertIdsByLead.set(leadId, [...(alertIdsByLead.get(leadId) ?? []), a.id]);
    else if (metaObject(a.meta)[SUMMARY_META_KEY] === true) summaries.push(a);
  }
  const alertedLeadIds = [...alertIdsByLead.keys()];

  // 2. The bounded scan, in one system-scope transaction.
  const { page, stillStuck } = await inStuckScope(db, 'cross-tenant-job', async (tx) => ({
    page: await queryStuck(tx, cutoff, cap + alertedLeadIds.length + STUCK_SUMMARY_SAMPLE, null, 'with-unrouted'),
    stillStuck: alertedLeadIds.length === 0 ? [] : await queryStuck(tx, cutoff, null, alertedLeadIds, 'with-unrouted'),
  }));
  const total = page.length === 0 ? 0 : Number(page[0]!.total);
  const stillStuckIds = new Set(stillStuck.map((r) => r.id));
  const alreadyOpen = stillStuckIds.size;

  // 3. Per-lead alerts for the oldest uncovered leads, while the cap has room.
  const uncovered = page.filter((r) => !alertIdsByLead.has(r.id));
  const slots = Math.max(0, cap - alreadyOpen);
  let raised = 0;
  const stillUncovered: string[] = [];
  for (const row of uncovered) {
    if (raised >= slots) {
      stillUncovered.push(row.id);
      continue;
    }
    const written = await recordAlert(
      {
        level: 'warn',
        source: STUCK_LEAD_ALERT_SOURCE,
        message: row.neverRouted
          ? `Public lead ${row.id} has a recorded transfer consent but was never routed after ${minutes} min (the form's bridge did not run or failed before its claim). See the 'public lead forward' log lines for that id.`
          : `Routed public lead ${row.id} has no copy in its tenant after ${minutes} min. See Admin > Lead routes > Stuck (no copy).`,
        meta: {
          publicLeadId: row.id,
          olderThanMinutes: minutes,
          routedAt: row.routedAt?.toISOString() ?? null,
          tenantDeleted: row.neverRouted ? false : row.tenantDeleted,
          ...(row.neverRouted ? { neverRouted: true } : {}),
        },
        dedupeKey: `${LEAD_INTAKE_SOURCE_REF_PREFIX}${row.id}`,
      },
      { client: alertClient }
    );
    if (written.status === 'recorded' && !written.deduped) raised += 1;
    else stillUncovered.push(row.id);
  }

  // 4. Per-lead alerts whose lead recovered: one statement for all of them.
  const healedAlertIds = alertedLeadIds.filter((id) => !stillStuckIds.has(id)).flatMap((id) => alertIdsByLead.get(id) ?? []);
  const { resolved } = await resolveAlertsById(healedAlertIds, { client: db });

  // 5. The one summary alert for the leads the cap left without a row.
  const overflow = Math.max(0, total - alreadyOpen - raised);
  let summary: StuckLeadAlertResult['summary'] = 'none';
  const [kept, ...extraSummaries] = summaries;
  if (overflow > 0) {
    const oldestLeadIds = stillUncovered.slice(0, STUCK_SUMMARY_SAMPLE);
    const message = `${overflow} more public leads are stuck after ${minutes} min: routed with no copy in their tenant, or consented and never routed (${total} stuck; per-lead alerts are capped at ${cap}). See Admin > Lead routes > Stuck (no copy).`;
    const facts = { [SUMMARY_META_KEY]: true, count: overflow, stuckTotal: total, oldestLeadIds, olderThanMinutes: minutes, cap };
    if (kept) {
      const current = metaObject(kept.meta);
      const same = (Object.keys(facts) as (keyof typeof facts)[]).every(
        (k) => JSON.stringify(current[k]) === JSON.stringify(facts[k])
      );
      if (same && kept.message === message) summary = 'unchanged';
      else {
        await db.systemAlert.update({ where: { id: kept.id }, data: { message, meta: { ...current, ...facts } } });
        summary = 'updated';
      }
    } else {
      const written = await recordAlert(
        { level: 'warn', source: STUCK_LEAD_ALERT_SOURCE, message, meta: facts, dedupeKey: `${STUCK_LEAD_ALERT_SOURCE}:summary` },
        { client: alertClient }
      );
      if (written.status === 'recorded') summary = 'opened';
    }
    // A second open summary (a race, or an operator re-open) folds into the kept one.
    await resolveAlertsById(extraSummaries.map((a) => a.id), { client: db });
  } else if (summaries.length > 0) {
    const r = await resolveAlertsById(summaries.map((a) => a.id), { client: db });
    if (r.resolved > 0) summary = 'resolved';
  }

  return { stuck: total, raised, alreadyOpen, resolved, overflow, summary };
}
