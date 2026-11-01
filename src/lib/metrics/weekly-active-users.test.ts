import { describe, expect, test, vi } from 'vitest';

import type { TenantTx } from '@/lib/db';
import {
  getWeeklyActiveUsersIn,
  InvalidWeeksError,
  MAX_WEEKS,
  weekWindow,
} from './weekly-active-users';

/** A transaction whose only capability is answering the one raw query. */
function fakeTx(rows: Array<{ week: string; n: number }>) {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  return { tx: { $queryRaw: queryRaw } as unknown as TenantTx, queryRaw };
}

describe('weekWindow', () => {
  test('a Monday 00:30 in Turkey is still Sunday in UTC, and belongs to the new week', () => {
    // 2026-09-27T21:30Z = Monday 2026-09-28 00:30 Europe/Istanbul.
    const w = weekWindow(new Date('2026-09-27T21:30:00Z'), 1);
    expect(w.labels).toEqual(['2026-09-28']);
    expect(w.fromUtc.toISOString()).toBe('2026-09-27T21:00:00.000Z');
    expect(w.toUtc.toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });

  test('a Sunday 23:59 in Turkey belongs to the week that began the Monday before', () => {
    const w = weekWindow(new Date('2026-10-04T20:59:00Z'), 1);
    expect(w.labels).toEqual(['2026-09-28']);
  });

  test('lists the weeks oldest first, ending with the current one', () => {
    const w = weekWindow(new Date('2026-09-29T09:00:00Z'), 3);
    expect(w.labels).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
    expect(w.fromUtc.toISOString()).toBe('2026-09-13T21:00:00.000Z');
  });
});

describe('getWeeklyActiveUsersIn', () => {
  const now = new Date('2026-09-29T09:00:00Z');

  test('fills weeks with no activity with 0, in window order', async () => {
    const { tx } = fakeTx([{ week: '2026-09-28', n: 2 }]);
    await expect(getWeeklyActiveUsersIn(tx, 'tenant-a', 3, now)).resolves.toEqual([
      { weekStart: '2026-09-14', activeUsers: 0 },
      { weekStart: '2026-09-21', activeUsers: 0 },
      { weekStart: '2026-09-28', activeUsers: 2 },
    ]);
  });

  test('ignores a bucket outside the window rather than growing the array', async () => {
    const { tx } = fakeTx([{ week: '2020-01-06', n: 9 }]);
    const out = await getWeeklyActiveUsersIn(tx, 'tenant-a', 1, now);
    expect(out).toEqual([{ weekStart: '2026-09-28', activeUsers: 0 }]);
  });

  test('binds the tenant and the window as parameters, never as SQL text', async () => {
    const { tx, queryRaw } = fakeTx([]);
    await getWeeklyActiveUsersIn(tx, "t'; DROP TABLE x; --", 2, now);
    const sql = queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join('')).not.toContain('DROP TABLE');
    expect(sql.values).toContain("t'; DROP TABLE x; --");
    expect(sql.values).toContain('2026-09-20 21:00:00.000');
    expect(sql.values).toContain('2026-10-04 21:00:00.000');
  });

  test('joins Membership, so an actor who is not a member of the tenant is not counted', async () => {
    const { tx, queryRaw } = fakeTx([]);
    await getWeeklyActiveUsersIn(tx, 'tenant-a', 1, now);
    const text = (queryRaw.mock.calls[0]?.[0] as { strings: string[] }).strings.join('?');
    expect(text).toMatch(/JOIN "Membership" m ON m\."tenantId" = \? AND m\."userId" = a\.uid/);
  });

  test('refuses a missing tenant before touching the database', async () => {
    const { tx, queryRaw } = fakeTx([]);
    await expect(getWeeklyActiveUsersIn(tx, '  ', 4, now)).rejects.toThrow(/without a tenant/);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  test.each([0, -1, 1.5, MAX_WEEKS + 1, Number.NaN])('refuses weeks = %s', async (weeks) => {
    const { tx, queryRaw } = fakeTx([]);
    await expect(getWeeklyActiveUsersIn(tx, 'tenant-a', weeks, now)).rejects.toBeInstanceOf(InvalidWeeksError);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
