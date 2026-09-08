/**
 * TASK-MTS80DUAF39Z8 — alert deduplication.
 *
 * The contract tests for `sanitizeMeta` / `buildAlertRow` / the failure path
 * live in tests/feedback-alerts.test.ts and stay there. This file covers only
 * the behaviour added by the dedupe change, against a fake client that behaves
 * like the table: an in-memory list `findMany` filters and `update` mutates.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  recordAlert,
  alertIdentity,
  repeatCountOf,
  lastSeenAtOf,
  stableStringify,
  type AlertDbClient,
  type RecordAlertInput,
} from '@/lib/observability/system-alert';

interface StoredRow {
  id: string;
  level: string;
  source: string;
  message: string;
  meta: unknown;
  resolvedAt: Date | null;
}

/** A stand-in for `SystemAlert` that supports the three calls recordAlert makes. */
function fakeDb() {
  const rows: StoredRow[] = [];
  let seq = 0;

  const client: AlertDbClient = {
    systemAlert: {
      create: async (args: unknown) => {
        const data = (args as { data: Omit<StoredRow, 'id' | 'resolvedAt'> }).data;
        const row: StoredRow = {
          id: `alert_${++seq}`,
          level: data.level,
          source: data.source,
          message: data.message,
          meta: data.meta ?? null,
          resolvedAt: null,
        };
        rows.push(row);
        return { id: row.id };
      },
      findMany: async (args: unknown) => {
        const where = (args as { where: Record<string, unknown> }).where;
        return rows
          .filter(
            (r) =>
              r.level === where.level &&
              r.source === where.source &&
              r.message === where.message &&
              r.resolvedAt === where.resolvedAt
          )
          .reverse()
          .map((r) => ({ id: r.id, meta: r.meta }));
      },
      update: async (args: unknown) => {
        const { where, data } = args as { where: { id: string }; data: { meta: unknown } };
        const row = rows.find((r) => r.id === where.id);
        if (row) row.meta = data.meta;
        return {};
      },
    },
  };

  return { client, rows };
}

const K1_ALERT: RecordAlertInput = {
  level: 'warn',
  source: 'k1_daily_calls',
  message: 'K1 sources returned 2 identifier(s) more than once in a single run.',
  meta: { duplicateIdentifiers: ['ERASMUS-EDU-2022-ECHE-CERT-FP'] },
};

describe('recordAlert deduplication', () => {
  it('writes one row for three identical occurrences and counts them', async () => {
    const { client, rows } = fakeDb();

    const first = await recordAlert(K1_ALERT, { client });
    const second = await recordAlert(K1_ALERT, { client });
    const third = await recordAlert(K1_ALERT, { client });

    expect(rows).toHaveLength(1);
    expect(first).toEqual({ status: 'recorded', id: 'alert_1' });
    expect(second).toEqual({ status: 'recorded', id: 'alert_1', deduped: true, repeatCount: 2 });
    expect(third).toEqual({ status: 'recorded', id: 'alert_1', deduped: true, repeatCount: 3 });
    expect(repeatCountOf(rows[0]!.meta)).toBe(3);
    expect(lastSeenAtOf(rows[0]!.meta)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps the caller meta intact next to the bookkeeping keys', async () => {
    const { client, rows } = fakeDb();

    await recordAlert(K1_ALERT, { client });
    await recordAlert(K1_ALERT, { client });

    expect(rows[0]!.meta).toMatchObject({
      duplicateIdentifiers: ['ERASMUS-EDU-2022-ECHE-CERT-FP'],
      alertRepeatCount: 2,
    });
  });

  it('opens a new row once the operator has resolved the old one', async () => {
    const { client, rows } = fakeDb();

    await recordAlert(K1_ALERT, { client });
    rows[0]!.resolvedAt = new Date();

    const reopened = await recordAlert(K1_ALERT, { client });

    expect(rows).toHaveLength(2);
    expect(reopened).toEqual({ status: 'recorded', id: 'alert_2' });
  });

  it.each([
    ['a different message', { message: 'K1 sources returned 7 identifier(s) more than once.' }],
    ['a different level', { level: 'error' as const }],
    ['a different source', { source: 'k2_monthly_cordis' }],
    ['different meta', { meta: { duplicateIdentifiers: ['SOMETHING-ELSE'] } }],
  ])('does not fold %s into the open alert', async (_name, override) => {
    const { client, rows } = fakeDb();

    await recordAlert(K1_ALERT, { client });
    await recordAlert({ ...K1_ALERT, ...override }, { client });

    expect(rows).toHaveLength(2);
  });

  it('ignores meta key order when deciding two alerts are the same', async () => {
    const { client, rows } = fakeDb();

    await recordAlert({ ...K1_ALERT, meta: { a: 1, b: 2 } }, { client });
    await recordAlert({ ...K1_ALERT, meta: { b: 2, a: 1 } }, { client });

    expect(rows).toHaveLength(1);
    expect(repeatCountOf(rows[0]!.meta)).toBe(2);
  });

  it('will not let a caller forge the counter through meta', async () => {
    const { client, rows } = fakeDb();

    await recordAlert(K1_ALERT, { client });
    await recordAlert(
      { ...K1_ALERT, meta: { ...K1_ALERT.meta, alertRepeatCount: 9000 } },
      { client }
    );

    expect(rows).toHaveLength(1);
    expect(repeatCountOf(rows[0]!.meta)).toBe(2);
  });

  it('still creates a row when the client cannot look anything up', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'alert_x' });
    const client: AlertDbClient = { systemAlert: { create } };

    await expect(recordAlert(K1_ALERT, { client })).resolves.toEqual({
      status: 'recorded',
      id: 'alert_x',
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reports the write failure rather than throwing when the lookup dies', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client: AlertDbClient = {
      systemAlert: {
        create: vi.fn(),
        findMany: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
      },
    };

    await expect(recordAlert(K1_ALERT, { client })).resolves.toEqual({
      status: 'failed',
      reason: 'write_failed',
    });
    spy.mockRestore();
  });
});

describe('alert identity', () => {
  it('treats the bookkeeping keys as invisible', () => {
    const plain = { level: 'warn', source: 's', message: 'm', meta: { a: 1 } };
    const counted = {
      ...plain,
      meta: { a: 1, alertRepeatCount: 4, alertLastSeenAt: '2026-09-08T00:00:00.000Z' },
    };
    expect(alertIdentity(counted)).toBe(alertIdentity(plain));
  });

  it('keeps array order significant — it is a fact about the run', () => {
    expect(stableStringify(['a', 'b'])).not.toBe(stableStringify(['b', 'a']));
  });
});
