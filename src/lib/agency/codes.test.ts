import { describe, expect, test } from 'vitest';
import {
  AgencyInviteError,
  createInviteCodeIn,
  expiryFromDay,
  inviteCodeRow,
  lastExpiryDay,
  listInviteCodesIn,
  MAX_VALIDITY_DAYS,
  validateInviteCodeInput,
  type InviteCodeRecord,
} from './codes';
import type { TenantTx } from '@/lib/db';

/**
 * B-1 (TASK-MUM17YBJVAHRR, leed-fb 29.09): a code leaves the server with its
 * status only. The attacker that joins this with the funnel is in
 * funnel.attack.test.ts.
 */
const NOW = Date.UTC(2026, 8, 29, 12);
const DAY = 86_400_000;

function record(over: Partial<InviteCodeRecord>): InviteCodeRecord {
  return {
    id: 'c1',
    hint: 'ABCD',
    label: null,
    usedCount: 0,
    expiresAt: new Date(NOW + 30 * DAY),
    revokedAt: null,
    createdAt: new Date(NOW - DAY),
    ...over,
  };
}

describe('inviteCodeRow', () => {
  test('no use count in any form: not the number, not "<5", not what is left', () => {
    for (const usedCount of [0, 1, 4, 5, 7, 24, 25]) {
      const row = inviteCodeRow(record({ usedCount }), NOW);
      expect(Object.keys(row).sort()).toEqual(
        ['createdAt', 'expiresAt', 'hint', 'id', 'label', 'revokedAt', 'status'].sort()
      );
      expect(JSON.stringify(row)).not.toMatch(/used|left|exhausted|maxUses|limit/i);
    }
  });

  test('status: revoked, then expired, else active — a used-up code included', () => {
    expect(inviteCodeRow(record({ usedCount: 3 }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: 25 }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: 25, expiresAt: new Date(NOW) }), NOW).status).toBe('expired');
    expect(inviteCodeRow(record({ usedCount: 25, revokedAt: new Date(NOW - 1) }), NOW).status).toBe('revoked');
  });

  test('no "exhausted" at any use count: there is no limit to reach (TASK-MUM4WVYLSH9IT)', () => {
    for (const usedCount of [0, 1, 6, 25, 10_000, 1_000_000]) {
      expect(inviteCodeRow(record({ usedCount }), NOW).status).toBe('active');
    }
    expect(inviteCodeRow(record({ usedCount: undefined }), NOW).status).toBe('active');
  });
});

describe('validateInviteCodeInput: end date only (TASK-MUM4WVYLSH9IT)', () => {
  test('tomorrow .. MAX_VALIDITY_DAYS is accepted; past, now, beyond and invalid are refused', () => {
    const at = (ms: number) => () => validateInviteCodeInput({ expiresAt: new Date(ms) }, new Date(NOW));
    expect(at(NOW + DAY)).not.toThrow();
    expect(at(NOW + 30 * DAY)).not.toThrow();
    expect(at(NOW + MAX_VALIDITY_DAYS * DAY)).not.toThrow();
    for (const ms of [NOW - DAY, NOW, NOW + MAX_VALIDITY_DAYS * DAY + 1, NaN]) {
      expect(at(ms)).toThrow(AgencyInviteError);
    }
  });
  test('a year is the ceiling: MAX_VALIDITY_DAYS covers a leap year, no more', () => {
    expect(MAX_VALIDITY_DAYS).toBe(366);
  });
});

describe('lastExpiryDay: the date field max comes from MAX_VALIDITY_DAYS (K-7, İNCELEME-12)', () => {
  const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  test('the offered last day is accepted and the day after it is refused, at any time of day', () => {
    const midnight = Date.UTC(2026, 8, 29);
    for (const offset of [0, 1, 60_000, 12 * 3_600_000, DAY - 1_001, DAY - 1_000, DAY - 1]) {
      const now = midnight + offset;
      const last = lastExpiryDay(now);
      expect(() => validateInviteCodeInput({ expiresAt: expiryFromDay(last) }, new Date(now))).not.toThrow();
      expect(() => validateInviteCodeInput({ expiresAt: expiryFromDay(dayAfter(last)) }, new Date(now))).toThrow(
        AgencyInviteError
      );
    }
  });
  test('usually today + 365: the code runs to the end of the chosen day', () => {
    expect(lastExpiryDay(NOW)).toBe('2027-09-29');
  });
  test('expiryFromDay: the last second of that UTC day; anything else is invalid', () => {
    expect(expiryFromDay('2026-10-29').toISOString()).toBe('2026-10-29T23:59:59.000Z');
    for (const bad of ['', '2026-10-2', '29.10.2026', '2026-10-29T00:00']) {
      expect(Number.isNaN(expiryFromDay(bad).getTime())).toBe(true);
    }
  });
});

describe('createInviteCodeIn', () => {
  test('writes no use limit and records none in the audit event', async () => {
    const writes: Record<string, unknown>[] = [];
    const tx = {
      tenant: { findUnique: async () => ({ kind: 'AGENCY', deletedAt: null }) },
      agencyInviteCode: {
        create: async (args: { data: Record<string, unknown> }) => (
          writes.push(args.data),
          { id: 'new', codeHint: 'WXYZ', expiresAt: args.data.expiresAt }
        ),
      },
      auditEvent: { create: async (args: { data: Record<string, unknown> }) => (writes.push(args.data), {}) },
    } as unknown as TenantTx;
    const created = await createInviteCodeIn(tx, {
      tenantId: 'agency',
      createdBy: 'u1',
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    expect(Object.keys(created).sort()).toEqual(['code', 'expiresAt', 'hint', 'id']);
    expect(writes).toHaveLength(2);
    expect(JSON.stringify(writes)).not.toMatch(/maxUses|usedCount/);
  });
});

describe('listInviteCodesIn', () => {
  test('does not select usedCount, returns none of it', async () => {
    const rows = [
      { ...record({ id: 'a', usedCount: 7 }), codeHint: 'AAAA' },
      { ...record({ id: 'b', usedCount: 3 }), codeHint: 'BBBB' },
      { ...record({ id: 'c', usedCount: 25 }), codeHint: 'CCCC' },
    ].map(({ hint: _hint, ...r }) => r);
    let select: Record<string, unknown> = {};
    const tx = {
      agencyInviteCode: {
        findMany: async (args: { select: Record<string, unknown> }) => ((select = args.select), rows),
      },
    } as unknown as TenantTx;
    const list = await listInviteCodesIn(tx, 'agency', NOW);
    expect(list.map((c) => [c.hint, c.status])).toEqual([
      ['AAAA', 'active'],
      ['BBBB', 'active'],
      ['CCCC', 'active'],
    ]);
    expect(select).not.toHaveProperty('usedCount');
    expect(JSON.stringify(list)).not.toMatch(/usedCount|"used/);
  });
});
