import { describe, expect, test } from 'vitest';
import {
  AgencyInviteError,
  createInviteCodeIn,
  inviteCodeRow,
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
