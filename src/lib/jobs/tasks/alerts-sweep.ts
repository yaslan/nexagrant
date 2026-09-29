import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/db';
import { alertsSweepFailureThreshold } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { AlertsSweepOutputSchema, type AlertsSweepOutput } from '../events';
import {
  ALERT_DEDUPE_KEY_KEY,
  ALERT_RESOLVED_BY_KEY,
  recordAlert,
  resolveAlerts,
  type AlertDbClient,
} from '@/lib/observability/system-alert';

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

/**
 * Job health, TASK-MTVRC1UGA3B6Y.
 *
 * Measured before this was written: every failure inside the sweep returned
 * `{ success: false, scanned: 0, closed: 0 }` and left exactly one trace — a
 * `console.error` line in the invocation's stdout. `step.run` does not treat a
 * returned `success: false` as a failure, so Inngest marked the run SUCCEEDED;
 * the table this job maintains held 0 rows with `source = 'alerts-sweep'` (38
 * open alerts, none of them from here); there is no `JobRun` model, so nothing
 * else records that the job ran at all. A daily cron could therefore have been
 * dead since the day it shipped and the only surface that would ever say so is
 * a log line nobody reads.
 *
 * The failure is now written where an operator already looks — `/admin/alerts`
 * — with two rules that keep it from becoming noise of its own:
 *
 *   1. **Stable identity.** `dedupeKey` is a constant, so a job that fails the
 *      same way for a week folds into one row with a repeat counter rather
 *      than seven rows. Nothing that varies run to run (the error text, the
 *      failing stage, the scan counts) is part of it — those ride along in
 *      `meta` as display detail. A sweep that cannot complete is one problem
 *      whatever query raised it, and "the daily sweep is not running" is the
 *      sentence the operator acts on.
 *   2. **A threshold before anyone is paged.** A single transient failure
 *      writes only the `info`-level breadcrumb; the `error` row appears once
 *      the breadcrumb's repeat counter reaches
 *      `ALERTS_SWEEP_FAILURE_THRESHOLD` consecutive runs. A success resolves
 *      both, so a blip that clears on the next run self-heals and the counter
 *      starts again from zero.
 *
 * Why the counter lives in an alert row and not in memory: this job runs as a
 * cron invocation, so a module-level variable is a fresh zero on every run and
 * would make the threshold unreachable by construction. `SystemAlert` is the
 * only durable store available without a migration, and `recordAlert` already
 * returns the folded `repeatCount` — the streak is that number.
 */
const FAILURE_ALERT_SOURCE = 'alerts-sweep';
/** The breadcrumb. Its repeat counter IS the consecutive-failure streak. */
const FAILURE_STREAK_KEY = 'alerts-sweep:run-failed';
/** Raised only once the streak reaches the threshold. */
const FAILURE_ESCALATION_KEY = 'alerts-sweep:failing-repeatedly';

/**
 * Which query was in flight when the sweep gave up. Reported in `meta` for
 * diagnosis and deliberately kept OUT of the dedupe key: a sweep that fails at
 * the tenant lookup on Monday and at the close write on Tuesday has not failed
 * twice for two reasons, it has failed twice, and splitting the key would
 * reset the streak each time the symptom moved.
 */
type SweepStage = 'scan' | 'tenant-lookup' | 'close';

/**
 * A description of the error safe to store on a table with no tenant isolation.
 *
 * The raw message is NOT used: `recordAlert`'s own catch block says why — a
 * database error can carry the connection string, and `SystemAlert` has no RLS
 * policy. The error's class plus a driver error code (`42501`, `P2021`) names
 * the fault without quoting anything the driver decided to interpolate. The
 * full message still goes to the job log, which is where it was before.
 */
function safeErrorLabel(error: unknown): string {
  if (!(error instanceof Error)) return 'non-error';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? `${error.name}:${code}` : error.name;
}

function metaOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * The subset of a Prisma client this sweep touches — narrowed so a test can
 * fake it. `create` is here for the alert writes: routing them through the
 * injected client rather than the `prisma` singleton keeps a unit test off the
 * real database, and lets a run under a different database role write its
 * health alert over the same connection it just failed on.
 */
export interface AlertsSweepDb {
  systemAlert: {
    findMany: (args: unknown) => Promise<Array<{ id: string; meta: unknown }>>;
    update: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  tenant: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
}

/**
 * Raise the health alerts for a failed run. Never throws — `recordAlert`
 * swallows its own write failures, and a job that is already failing must not
 * fail harder because the alert could not be stored.
 *
 * Returns the streak so the caller can log it.
 *
 * Known limit, stated rather than papered over: this writes job health into
 * the same database the job just failed against. If `SystemAlert` itself is
 * unreadable or unwritable — a connection outage, a revoked grant on that
 * table — then `recordAlert` cannot even run its duplicate lookup, returns
 * `failed`, and nothing is stored; the only trace is the log line above, which
 * is where we started. Making `recordAlert` write blind when its lookup fails
 * would trade that for the row flood TASK-MTS80DUAF39Z8 removed, so it does
 * not. What this DOES catch is the far more common shape: one query the schema
 * rejects (exactly how this job's sibling `alerts-daily` was dead for months),
 * a grant the `fabrika_app` role lacks on the tables the sweep reads, a single
 * row that will not update. A total outage is visible from the outside anyway;
 * a job quietly returning `success: false` for months was not.
 */
async function raiseFailureAlerts(
  db: AlertsSweepDb,
  detail: { stage: SweepStage; label: string; scanned: number; closed: number; threshold: number }
): Promise<number> {
  const client = db as unknown as AlertDbClient;

  const streakAlert = await recordAlert(
    {
      level: 'info',
      source: FAILURE_ALERT_SOURCE,
      message: 'Orphan-alert sweep did not complete — see meta for the stage and the job log for the full error',
      dedupeKey: FAILURE_STREAK_KEY,
      meta: {
        stage: detail.stage,
        error: detail.label,
        scannedBeforeFailure: detail.scanned,
        closedBeforeFailure: detail.closed,
        threshold: detail.threshold,
      },
    },
    { client }
  );

  const consecutiveFailures = streakAlert.repeatCount ?? 1;

  if (consecutiveFailures >= detail.threshold) {
    await recordAlert(
      {
        level: 'error',
        source: FAILURE_ALERT_SOURCE,
        message: `Orphan-alert sweep has failed ${detail.threshold} or more consecutive runs — stale alerts are no longer being closed`,
        dedupeKey: FAILURE_ESCALATION_KEY,
        meta: { consecutiveFailures, stage: detail.stage, error: detail.label },
      },
      { client }
    );
  }

  return consecutiveFailures;
}

/**
 * Close the health alerts after a clean run — the producer-side resolve
 * `resolveAlerts` exists for. Without this the breadcrumb from a single bad
 * night would sit open forever and the streak would never restart, so the
 * threshold would eventually be reached by unrelated failures months apart.
 *
 * Matched on the dedupe key rather than on `source` alone: `source` is a
 * namespace, and a later alert from this job that is not about run health must
 * not be closed by a successful sweep.
 */
async function clearFailureAlerts(db: AlertsSweepDb): Promise<void> {
  const client = db as unknown as AlertDbClient;
  for (const key of [FAILURE_STREAK_KEY, FAILURE_ESCALATION_KEY]) {
    await resolveAlerts(
      { source: FAILURE_ALERT_SOURCE, meta: { [ALERT_DEDUPE_KEY_KEY]: key } },
      { client }
    );
  }
}

/**
 * Close every open alert naming a tenant that no longer exists and is old
 * enough to sweep. Never throws — same contract as `recordAlert`/`resolveAlerts`:
 * a maintenance job failing must not become an incident of its own. What it no
 * longer does is fail *quietly*: see the job-health comment above.
 *
 * `threshold` is injectable so a test can reach the escalation without setting
 * an environment variable; production reads the setting.
 */
export async function sweepOrphanTenantAlerts(
  db: AlertsSweepDb,
  now: Date = new Date(),
  options: { threshold?: number } = {}
): Promise<AlertsSweepOutput> {
  const threshold = options.threshold ?? alertsSweepFailureThreshold;

  // Counted as the run goes rather than derived at the end, so a failure can
  // report what it really did. The old code returned `closed: 0` from the catch
  // block unconditionally: with three orphans and the second update raising,
  // one row HAD been closed and the job reported zero — measured, case D of
  // TASK-MTVRC1UGA3B6Y §1. An operator re-running after a partial failure has
  // to know the sweep is mid-way, not untouched.
  let scanned = 0;
  let closed = 0;
  let stage: SweepStage = 'scan';

  try {
    const cutoff = new Date(now.getTime() - MIN_AGE_MS);

    const candidates = await db.systemAlert.findMany({
      where: { resolvedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, meta: true },
    });
    scanned = candidates.length;

    const named = candidates.filter((r) => typeof metaOf(r.meta).tenantId === 'string');
    const tenantIds = [...new Set(named.map((r) => String(metaOf(r.meta).tenantId)))];

    stage = 'tenant-lookup';
    const alive =
      tenantIds.length === 0
        ? []
        : await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true } });
    const aliveSet = new Set(alive.map((t) => t.id));
    const orphans = named.filter((r) => !aliveSet.has(String(metaOf(r.meta).tenantId)));

    stage = 'close';
    for (const row of orphans) {
      await db.systemAlert.update({
        where: { id: row.id },
        data: {
          resolvedAt: now,
          meta: { ...metaOf(row.meta), [ALERT_RESOLVED_BY_KEY]: 'sweep:tenant_gone' },
        },
      });
      closed++;
    }

    // Last, and only on a clean run: the sweep is healthy, so anything it said
    // about its own health is no longer true.
    await clearFailureAlerts(db);

    return AlertsSweepOutputSchema.parse({ success: true, scanned, closed });
  } catch (error) {
    // The log line keeps the full message — it is the one place the detail is
    // allowed, and it is where an operator following the alert will look next.
    console.error(`[alerts-sweep] failed during ${stage}: ${errorMessage(error)}`);

    const consecutiveFailures = await raiseFailureAlerts(db, {
      stage,
      label: safeErrorLabel(error),
      scanned,
      closed,
      threshold,
    });
    console.error(
      `[alerts-sweep] consecutive failed runs: ${consecutiveFailures} (alert threshold ${threshold})`
    );

    return AlertsSweepOutputSchema.parse({ success: false, scanned, closed });
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
