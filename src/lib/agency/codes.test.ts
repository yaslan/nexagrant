import { describe, expect, test } from 'vitest';
import { SMALL_CELL_THRESHOLD } from './funnel';
import {
  AgencyInviteError,
  inviteCodeRow,
  listInviteCodesIn,
  MIN_MAX_USES,
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
    maxUses: 25,
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
        ['createdAt', 'expiresAt', 'hint', 'id', 'label', 'maxUses', 'revokedAt', 'status'].sort()
      );
      expect(JSON.stringify(row)).not.toMatch(/used|left|exhausted/i);
    }
  });

  test('status: revoked, then expired, else active — a used-up code included', () => {
    expect(inviteCodeRow(record({ usedCount: 3 }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: 25 }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: 25, expiresAt: new Date(NOW) }), NOW).status).toBe('expired');
    expect(inviteCodeRow(record({ usedCount: 25, revokedAt: new Date(NOW - 1) }), NOW).status).toBe('revoked');
  });

  test('no "exhausted" at any limit: it was the exact use count (TASK-MUM2RMN3YIBGC)', () => {
    for (const maxUses of [3, MIN_MAX_USES, 25]) {
      for (const usedCount of [0, maxUses - 1, maxUses]) {
        expect(inviteCodeRow(record({ maxUses, usedCount }), NOW).status).toBe('active');
      }
    }
    expect(inviteCodeRow(record({ usedCount: undefined }), NOW).status).toBe('active');
  });
});

describe('validateInviteCodeInput: maxUses ≥ MIN_MAX_USES', () => {
  const expiresAt = new Date(NOW + 30 * DAY);
  test('"active" (used ≤ maxUses − 1) is not "under 5" either', () => {
    expect(MIN_MAX_USES - 1).toBeGreaterThanOrEqual(SMALL_CELL_THRESHOLD);
  });
  test('below the minimum is refused, the minimum is accepted', () => {
    for (const maxUses of [1, 4, 5, MIN_MAX_USES - 1]) {
      expect(() => validateInviteCodeInput({ maxUses, expiresAt }, new Date(NOW))).toThrow(AgencyInviteError);
    }
    expect(() => validateInviteCodeInput({ maxUses: MIN_MAX_USES, expiresAt }, new Date(NOW))).not.toThrow();
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
