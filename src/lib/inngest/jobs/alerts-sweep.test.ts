import { describe, it, expect, vi } from 'vitest';
import { sweepOrphanTenantAlerts, type AlertsSweepDb } from './alerts-sweep';

const HOUR = 60 * 60 * 1000;

/** A row the sweep might act on. `createdAt` controls whether it clears the age threshold. */
function alertRow(id: string, meta: Record<string, unknown>, ageMs: number, now: Date) {
  return { id, meta, createdAt: new Date(now.getTime() - ageMs) };
}

function fakeDb(rows: ReturnType<typeof alertRow>[], liveTenantIds: string[]): AlertsSweepDb & { updates: Array<{ id: string; data: unknown }> } {
  const updates: Array<{ id: string; data: unknown }> = [];
  return {
    updates,
    systemAlert: {
      findMany: async (args: unknown) => {
        const where = (args as { where: { createdAt: { lt: Date } } }).where;
        return rows.filter((r) => r.createdAt < where.createdAt.lt);
      },
      update: async (args: unknown) => {
        const a = args as { where: { id: string }; data: unknown };
        updates.push({ id: a.where.id, data: a.data });
        return {};
      },
    },
    tenant: {
      findMany: async (args: unknown) => {
        const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
        return liveTenantIds.filter((id) => ids.includes(id)).map((id) => ({ id }));
      },
    },
  };
}

describe('sweepOrphanTenantAlerts (TASK-MTVFJTNW6OW11 sweeper)', () => {
  it('closes an old alert naming a tenant that no longer exists', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = fakeDb([alertRow('a1', { tenantId: 'gone' }, 2 * HOUR, now)], []);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 1, closed: 1 });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.data).toMatchObject({
      resolvedAt: now,
      meta: { tenantId: 'gone', alertResolvedBy: 'sweep:tenant_gone' },
    });
  });

  it('leaves an alert alone when its tenant still exists', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = fakeDb([alertRow('a1', { tenantId: 'alive' }, 2 * HOUR, now)], ['alive']);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 1, closed: 0 });
    expect(db.updates).toHaveLength(0);
  });

  it('leaves an alert with no tenantId alone — it is not tenant-scoped by design', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const db = fakeDb([alertRow('a1', { host: 'example.invalid' }, 2 * HOUR, now)], []);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 1, closed: 0 });
    expect(db.updates).toHaveLength(0);
  });

  it('does not touch a row younger than the age threshold, even if its tenant is gone', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    // The `where` clause itself excludes it (createdAt filter), mirroring what
    // a real `findMany` would do — this fake only returns rows past the cutoff.
    const db = fakeDb([alertRow('a1', { tenantId: 'gone' }, 5 * 60 * 1000, now)], []);

    const result = await sweepOrphanTenantAlerts(db, now);

    expect(result).toEqual({ success: true, scanned: 0, closed: 0 });
  });

  it('reports failure rather than throwing when the database call fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db: AlertsSweepDb = {
      systemAlert: {
        findMany: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
        update: vi.fn(),
      },
      tenant: { findMany: vi.fn() },
    };

    await expect(sweepOrphanTenantAlerts(db)).resolves.toEqual({
      success: false,
      scanned: 0,
      closed: 0,
    });
    spy.mockRestore();
  });
});
