import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { AlertsSweepOutputSchema, type AlertsSweepOutput } from '../events';
import { ALERT_RESOLVED_BY_KEY } from '@/lib/observability/system-alert';

/**
 * The sweeper half of TASK-MTVFJTNW6OW11 — the producer half lives in
 * `createInvoiceForPayment` (src/lib/billing/invoice-writer.ts).
 *
 * A producer can only close what its own run touches. Nothing closes the
 * other kind of stale alert: one whose `meta.tenantId` names a tenant that no
 * longer exists, which `pnpm alerts:check` (scripts/check-orphan-alerts.ts)
 * already treats as invalid by definition — `SystemAlert` has no FK to
 * `Tenant` and no cascade, so a deleted tenant leaves its alerts behind
 * forever, growing the console with rows no operator can ever act on
 * (measured at 220 of 256 open rows on 2026-09-10,
 * docs/agent-results/TASK-MTTUUGKNDGBXK-customer-support.md §1-§2). This job
 * closes exactly that: it does not delete rows (the resolve is an audit
 * trail, not a purge) and it does not touch a row naming a tenant that still
 * exists — a live tenant with an unresolved alert is still that operator's
 * problem to fix, not this job's to hide.
 *
 * See scripts/check-orphan-alerts.ts for the identical orphan-detection query
 * this mirrors on the write side.
 */

/**
 * How old an alert must be before this job may close it.
 *
 * The threshold exists so the sweeper cannot quietly disarm the gate that
 * reports leaks. `pnpm alerts:check` runs LAST in `pnpm gate`, precisely so it
 * sees what the run it is judging left behind: a fixture that creates a
 * tenant, raises an alert and then deletes the tenant has produced an orphan
 * that the gate is supposed to fail on. With no age floor that orphan becomes
 * sweepable the instant the fixture drops the tenant, so a sweep racing the
 * same CI run would close the leak and hand the gate a green — hiding the one
 * defect it exists to catch.
 *
 * An hour is comfortably wider than a full gate run and far narrower than the
 * daily cron's period, so fresh leaks stay visible to the gate while the
 * historical pile still clears on the next 04:15 pass. Measured on the real
 * database (docs/agent-results/TASK-MTVFJTNW6OW11-blok-zincir-dev.md): a
 * 3-hour-old orphan was closed, a 5-minute-old one with the same ghost tenant
 * was left open and kept the gate red.
 */
const MIN_AGE_MS = 60 * 60 * 1000;

function metaOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The subset of a Prisma client this sweep touches — narrowed so a test can fake it. */
export interface AlertsSweepDb {
  systemAlert: {
    findMany: (args: unknown) => Promise<Array<{ id: string; meta: unknown }>>;
    update: (args: unknown) => Promise<unknown>;
  };
  tenant: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
}

/**
 * Close every open alert naming a tenant that no longer exists and is old
 * enough to sweep. Never throws — same contract as `recordAlert`/`resolveAlerts`:
 * a maintenance job failing must not become an incident of its own.
 */
export async function sweepOrphanTenantAlerts(
  db: AlertsSweepDb,
  now: Date = new Date()
): Promise<AlertsSweepOutput> {
  try {
    const cutoff = new Date(now.getTime() - MIN_AGE_MS);

    const candidates = await db.systemAlert.findMany({
      where: { resolvedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, meta: true },
    });

    const named = candidates.filter((r) => typeof metaOf(r.meta).tenantId === 'string');
    const tenantIds = [...new Set(named.map((r) => String(metaOf(r.meta).tenantId)))];

    const alive =
      tenantIds.length === 0
        ? []
        : await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true } });
    const aliveSet = new Set(alive.map((t) => t.id));
    const orphans = named.filter((r) => !aliveSet.has(String(metaOf(r.meta).tenantId)));

    for (const row of orphans) {
      await db.systemAlert.update({
        where: { id: row.id },
        data: {
          resolvedAt: now,
          meta: { ...metaOf(row.meta), [ALERT_RESOLVED_BY_KEY]: 'sweep:tenant_gone' },
        },
      });
    }

    return AlertsSweepOutputSchema.parse({
      success: true,
      scanned: candidates.length,
      closed: orphans.length,
    });
  } catch (error) {
    console.error(
      `[alerts-sweep] failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return AlertsSweepOutputSchema.parse({ success: false, scanned: 0, closed: 0 });
  }
}

/**
 * Alerts Sweep — daily, 04:15 UTC (between K2's 04:00 trigger and
 * alerts-daily's 08:00, so it never races either).
 */
export const alertsSweep = inngest.createFunction(
  { id: 'alerts-sweep', triggers: [{ cron: '15 4 * * *' }] },
  async ({ step }): Promise<AlertsSweepOutput> =>
    step.run('sweep-orphan-tenant-alerts', async () =>
      sweepOrphanTenantAlerts(prisma as unknown as AlertsSweepDb)
    )
);
