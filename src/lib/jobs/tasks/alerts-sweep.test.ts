import { describe, it, expect, vi } from 'vitest';
import { sweepOrphanTenantAlerts, type AlertsSweepDb } from './alerts-sweep';
import { ALERT_DEDUPE_KEY_KEY, ALERT_RESOLVED_BY_KEY } from '@/lib/observability/system-alert';

const HOUR = 60 * 60 * 1000;

/** A row the sweep might act on. `createdAt` controls whether it clears the age threshold. */
function alertRow(id: string, meta: Record<string, unknown>, ageMs: number, now: Date): StoredAlert {
  return {
    id,
    level: 'warn',
    source: 'some-producer',
    message: `alert ${id}`,
    meta,
    createdAt: new Date(now.getTime() - ageMs),
    resolvedAt: null,
  };
}

interface StoredAlert {
  id: string;
  level: string;
  source: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

interface Where {
  level?: string;
  source?: string;
  message?: string;
  resolvedAt?: null;
  createdAt?: { lt: Date };
}

/**
 * An in-memory `SystemAlert` table rather than a per-call stub.
 *
 * TASK-MTVRC1UGA3B6Y writes its job-health alerts through the real
 * `recordAlert`/`resolveAlerts`, whose dedupe is the behaviour under test: a
 * stub that only records the calls would prove the sweep *asked* for an alert
 * and prove nothing about whether three failures fold into one row. This fake
 * answers the same queries those two functions issue (level/source/message
 * equality, `resolvedAt: null`, the `createdAt` cutoff, orderBy/take) so the
 * folding happens for real.
 */
function alertStore(
  seed: StoredAlert[] = [],
  opts: {
    liveTenantIds?: string[];
    failScan?: boolean;
    failTenants?: boolean;
    /** Reject `update` for this alert id — a permission failure on one row. */
    failUpdateOn?: string;
    /** Reject every `create`, i.e. the health alert cannot be stored either. */
    failCreate?: boolean;
    /**
     * Reject EVERY `findMany`, not just the sweep's own — a table- or
     * connection-level outage rather than one broken query. `recordAlert`
     * looks for an open duplicate before it writes, so this also takes the
     * health alert down with it; the sweep must still return rather than throw.
     */
    failEveryRead?: boolean;
  } = {}
) {
  const rows: StoredAlert[] = [...seed];
  const closedBySweep: string[] = [];
  let seq = 0;

  function matches(row: StoredAlert, where: Where | undefined): boolean {
    if (!where) return true;
    if (where.level !== undefined && row.level !== where.level) return false;
    if (where.source !== undefined && row.source !== where.source) return false;
    if (where.message !== undefined && row.message !== where.message) return false;
    if ('resolvedAt' in where && where.resolvedAt === null && row.resolvedAt !== null) return false;
    if (where.createdAt?.lt && !(row.createdAt < where.createdAt.lt)) return false;
    return true;
  }

  const db: AlertsSweepDb & { rows: StoredAlert[]; closedBySweep: string[] } = {
    rows,
    closedBySweep,
    systemAlert: {
      findMany: async (args: unknown) => {
        if (opts.failEveryRead) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        const a = args as { where?: Where; orderBy?: { createdAt: 'desc' }; take?: number };
        // `failScan` breaks only the sweep's own candidate query — the one
        // narrowed by the age cutoff. Blanket-failing `findMany` would also
        // break `recordAlert`'s duplicate lookup and prove nothing about the
        // health alert; a query the schema rejects (the shape of the bug this
        // job's sibling shipped, alerts-daily.ts) is one query, not the table.
        if (opts.failScan && a.where?.createdAt) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        }
        let found = rows.filter((r) => matches(r, a.where));
        if (a.orderBy?.createdAt === 'desc') {
          found = [...found].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
        }
        return (a.take ? found.slice(0, a.take) : found) as unknown as Array<{
          id: string;
          meta: unknown;
        }>;
      },
      update: async (args: unknown) => {
        const a = args as { where: { id: string }; data: Record<string, unknown> };
        if (opts.failUpdateOn === a.where.id) {
          throw new Error('permission denied for table "SystemAlert"');
        }
        const row = rows.find((r) => r.id === a.where.id);
        if (!row) throw new Error(`record not found: ${a.where.id}`);
        if ('meta' in a.data) row.meta = a.data.meta as Record<string, unknown>;
        if ('resolvedAt' in a.data) row.resolvedAt = a.data.resolvedAt as Date | null;
        if (metaOf(row.meta)[ALERT_RESOLVED_BY_KEY] === 'sweep:tenant_gone') {
          closedBySweep.push(row.id);
        }
        return row;
      },
      create: async (args: unknown) => {
        if (opts.failCreate) throw new Error('permission denied for table "SystemAlert"');
        const data = (args as { data: Omit<StoredAlert, 'id' | 'createdAt' | 'resolvedAt'> }).data;
        const row: StoredAlert = {
          id: `created-${++seq}`,
          level: data.level,
          source: data.source,
          message: data.message,
          meta: data.meta ?? null,
          createdAt: new Date(),
          resolvedAt: null,
        };
        rows.push(row);
        return { id: row.id };
      },
    },
    tenant: {
      findMany: async (args: unknown) => {
        if (opts.failTenants) throw new Error('relation "Tenant" does not exist');
        const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
        return (opts.liveTenantIds ?? []).filter((id) => ids.includes(id)).map((id) => ({ id }));
      },
    },
  };
  return db;
}

function metaOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The health rows this job writes about itself, newest first. */
function healthRows(db: { rows: StoredAlert[] }, dedupeKey: string): StoredAlert[] {
  return db.rows.filter((r) => metaOf(r.meta)[ALERT_DEDUPE_KEY_KEY] === dedupeKey);
}

function silenceConsole() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('sweepOrphanTenantAlerts (TASK-MTVFJTNW6OW11 sweeper)', () => {
  it('closes an old alert naming a tenant that no longer exists', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = alertStore([alertRow('a1', { tenantId: 'gone' }, 2 * HOUR, now)]);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 1, closed: 1 });
    expect(db.closedBySweep).toEqual(['a1']);
    expect(db.rows.find((r) => r.id === 'a1')).toMatchObject({
      resolvedAt: now,
      meta: { tenantId: 'gone', alertResolvedBy: 'sweep:tenant_gone' },
    });
  });

  it('leaves an alert alone when its tenant still exists', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = alertStore([alertRow('a1', { tenantId: 'alive' }, 2 * HOUR, now)], {
      liveTenantIds: ['alive'],
    });

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 1, closed: 0 });
    expect(db.closedBySweep).toEqual([]);
  });

  it('leaves an alert with no tenantId alone — it is not tenant-scoped by design', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = alertStore([alertRow('a1', { host: 'example.invalid' }, 2 * HOUR, now)]);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 1, closed: 0 });
    expect(db.closedBySweep).toEqual([]);
  });

  it('does not touch a row younger than the age threshold, even if its tenant is gone', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = alertStore([alertRow('a1', { tenantId: 'gone' }, 5 * 60 * 1000, now)]);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 0, closed: 0 });
    expect(db.closedBySweep).toEqual([]);
  });

  it('reports failure rather than throwing when the database call fails', async () => {
    const spy = silenceConsole();
    const db = alertStore([], { failScan: true });

    await expect(sweepOrphanTenantAlerts(db)).resolves.toEqual({
      success: false,
      scanned: 0,
      closed: 0,
    });
    spy.mockRestore();
  });
});

describe('sweepOrphanTenantAlerts job health (TASK-MTVRC1UGA3B6Y)', () => {
  it('reports the rows it actually closed when the run dies mid-loop', async () => {
    const spy = silenceConsole();
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = alertStore(
      ['a1', 'a2', 'a3'].map((id) => alertRow(id, { tenantId: 'gone' }, 2 * HOUR, now)),
      { failUpdateOn: 'a2' }
    );

    const result = await sweepOrphanTenantAlerts(db, now);

    // Before this card the catch block returned a flat {scanned: 0, closed: 0}
    // while `a1` had already been closed — the job under-reported its own work.
    expect(result).toEqual({ success: false, scanned: 3, closed: 1 });
    expect(db.closedBySweep).toEqual(['a1']);
    spy.mockRestore();
  });

  it('writes an operator-visible breadcrumb on failure, but no error alert below the threshold', async () => {
    const spy = silenceConsole();
    const db = alertStore([], { failScan: true });

    await sweepOrphanTenantAlerts(db, new Date(), { threshold: 3 });

    const streak = healthRows(db, 'alerts-sweep:run-failed');
    expect(streak).toHaveLength(1);
    expect(streak[0]).toMatchObject({ level: 'info', source: 'alerts-sweep' });
    expect(metaOf(streak[0]!.meta)).toMatchObject({ stage: 'scan', error: 'Error' });
    expect(healthRows(db, 'alerts-sweep:failing-repeatedly')).toHaveLength(0);
    spy.mockRestore();
  });

  it('folds repeated failures into ONE row and escalates at the threshold', async () => {
    const spy = silenceConsole();
    const db = alertStore([], { failScan: true });

    for (let i = 0; i < 3; i++) {
      await sweepOrphanTenantAlerts(db, new Date(), { threshold: 3 });
    }

    const streak = healthRows(db, 'alerts-sweep:run-failed');
    expect(streak).toHaveLength(1);
    expect(metaOf(streak[0]!.meta).alertRepeatCount).toBe(3);

    const escalation = healthRows(db, 'alerts-sweep:failing-repeatedly');
    expect(escalation).toHaveLength(1);
    expect(escalation[0]).toMatchObject({ level: 'error' });
    expect(metaOf(escalation[0]!.meta).consecutiveFailures).toBe(3);
    spy.mockRestore();
  });

  it('does not escalate while the streak is short of the threshold', async () => {
    const spy = silenceConsole();
    const db = alertStore([], { failScan: true });

    await sweepOrphanTenantAlerts(db, new Date(), { threshold: 3 });
    await sweepOrphanTenantAlerts(db, new Date(), { threshold: 3 });

    expect(metaOf(healthRows(db, 'alerts-sweep:run-failed')[0]!.meta).alertRepeatCount).toBe(2);
    expect(healthRows(db, 'alerts-sweep:failing-repeatedly')).toHaveLength(0);
    spy.mockRestore();
  });

  it('resolves both health alerts after a clean run, so the streak restarts', async () => {
    const spy = silenceConsole();
    const failing = alertStore([], { failScan: true });
    for (let i = 0; i < 3; i++) {
      await sweepOrphanTenantAlerts(failing, new Date(), { threshold: 3 });
    }
    expect(healthRows(failing, 'alerts-sweep:failing-repeatedly')).toHaveLength(1);

    // Same store, now healthy: rebuild the db over the rows it already holds.
    const healthy = alertStore(failing.rows, {});
    const result = await sweepOrphanTenantAlerts(healthy, new Date(), { threshold: 3 });

    expect(result.success).toBe(true);
    for (const key of ['alerts-sweep:run-failed', 'alerts-sweep:failing-repeatedly']) {
      const rows = healthRows(healthy, key);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.resolvedAt).not.toBeNull();
      expect(metaOf(rows[0]!.meta)[ALERT_RESOLVED_BY_KEY]).toBe('producer');
    }

    // A failure after the resolve opens a FRESH row rather than reviving the
    // closed one — the streak is back to 1 and nobody is paged for it.
    const afterHeal = alertStore(healthy.rows, { failScan: true });
    await sweepOrphanTenantAlerts(afterHeal, new Date(), { threshold: 3 });
    const open = healthRows(afterHeal, 'alerts-sweep:run-failed').filter((r) => r.resolvedAt === null);
    expect(open).toHaveLength(1);
    expect(metaOf(open[0]!.meta).alertRepeatCount).toBeUndefined();
    spy.mockRestore();
  });

  it('never throws when the health alert cannot be written either', async () => {
    const spy = silenceConsole();
    const db = alertStore([], { failEveryRead: true, failCreate: true });

    await expect(sweepOrphanTenantAlerts(db, new Date(), { threshold: 3 })).resolves.toEqual({
      success: false,
      scanned: 0,
      closed: 0,
    });
    expect(db.rows).toHaveLength(0);
    spy.mockRestore();
  });

  it('keeps the error text out of the alert and only its class in meta', async () => {
    const spy = silenceConsole();
    const db = alertStore([], { failScan: true });

    await sweepOrphanTenantAlerts(db, new Date(), { threshold: 3 });

    const stored = JSON.stringify(healthRows(db, 'alerts-sweep:run-failed')[0]);
    // `SystemAlert` has no RLS policy and a driver error can carry the
    // connection string, so the raw message must not reach the row.
    expect(stored).not.toContain('ECONNREFUSED');
    expect(stored).not.toContain('127.0.0.1');
    spy.mockRestore();
  });
});
