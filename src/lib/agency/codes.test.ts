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
import {
  INVITE_CODE_DEFAULT_VALIDITY_DAYS,
  INVITE_CODE_MAX_USE_LIMIT,
  INVITE_CODE_MIN_USE_LIMIT,
} from './invite-policy';
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
  test('no use count in any form: not the number, not a masked cell, not what is left', () => {
    for (const usedCount of [0, 1, 4, 5, 7, 24, 25]) {
      const row = inviteCodeRow(record({ usedCount, useLimit: 513 }), NOW);
      expect(Object.keys(row).sort()).toEqual(
        ['createdAt', 'expiresAt', 'hint', 'id', 'label', 'limited', 'revokedAt', 'status'].sort()
      );
      // Neither the count nor the code's real (hidden, K-577268) limit is on the wire.
      expect(JSON.stringify(row)).not.toMatch(/used|left|maxUses|useLimit|513/i);
      expect(row.limited).toBe(true);
    }
  });

  test('status: revoked, then expired, then exhausted, else active (against the code\'s own limit)', () => {
    expect(inviteCodeRow(record({ usedCount: 3, useLimit: 507 }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: 506, useLimit: 507 }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: 507, useLimit: 507 }), NOW).status).toBe('exhausted');
    expect(inviteCodeRow(record({ usedCount: 507, useLimit: 507, expiresAt: new Date(NOW) }), NOW).status).toBe('expired');
    expect(inviteCodeRow(record({ usedCount: 507, useLimit: 507, revokedAt: new Date(NOW - 1) }), NOW).status).toBe('revoked');
  });

  test('a code from before FO-392 (useLimit NULL) is unlimited: never exhausted at any count', () => {
    for (const usedCount of [0, 1, 6, 25, 10_000, 1_000_000]) {
      const row = inviteCodeRow(record({ usedCount, useLimit: null }), NOW);
      expect(row.status).toBe('active');
      expect(row.limited).toBe(false);
    }
    expect(inviteCodeRow(record({ usedCount: undefined }), NOW).status).toBe('active');
    expect(inviteCodeRow(record({ usedCount: undefined, useLimit: 5 }), NOW).status).toBe('active');
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
  test('writes a real limit from invite-policy (500..524), no count, and neither the limit nor a count anywhere it could be read', async () => {
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
    const limit = writes[0]!.useLimit as number;
    expect(Number.isInteger(limit)).toBe(true);
    expect(limit).toBeGreaterThanOrEqual(INVITE_CODE_MIN_USE_LIMIT);
    expect(limit).toBeLessThanOrEqual(INVITE_CODE_MAX_USE_LIMIT);
    // The audit trail is read outside the database too: it says "limited", never the number.
    expect(writes[1]).toMatchObject({ data: { limited: true } });
    expect(JSON.stringify(writes[1])).not.toMatch(/useLimit/);
    expect(JSON.stringify(created)).not.toContain(String(limit));
    expect(JSON.stringify(writes)).not.toMatch(/maxUses|usedCount/);
  });

  test('the limit is drawn once per code: 200 codes spread over the whole window', async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      let limit = -1;
      const tx = {
        tenant: { findUnique: async () => ({ kind: 'AGENCY', deletedAt: null }) },
        agencyInviteCode: {
          create: async (args: { data: Record<string, unknown> }) => (
            (limit = args.data.useLimit as number),
            { id: 'new', codeHint: 'WXYZ', expiresAt: args.data.expiresAt }
          ),
        },
        auditEvent: { create: async () => ({}) },
      } as unknown as TenantTx;
      await createInviteCodeIn(tx, { tenantId: 'agency', createdBy: 'u1', expiresAt: new Date(Date.now() + 30 * DAY) });
      seen.add(limit);
    }
    // 200 uniform draws over 25 values miss a value with probability 25 * (24/25)^200 ~ 7e-35.
    expect(seen.size).toBe(INVITE_CODE_MAX_USE_LIMIT - INVITE_CODE_MIN_USE_LIMIT + 1);
  });

  test('the policy numbers are sane: a limit above 0, a default validity inside the cap', () => {
    expect(Number.isInteger(INVITE_CODE_MIN_USE_LIMIT) && INVITE_CODE_MIN_USE_LIMIT > 0).toBe(true);
    expect(INVITE_CODE_DEFAULT_VALIDITY_DAYS).toBeGreaterThan(0);
    expect(INVITE_CODE_DEFAULT_VALIDITY_DAYS).toBeLessThanOrEqual(MAX_VALIDITY_DAYS);
  });
});

describe('listInviteCodesIn', () => {
  test('selects usedCount only to decide "exhausted"; none of it reaches the list', async () => {
    const rows = [
      { ...record({ id: 'a', usedCount: 7, useLimit: 517 }), codeHint: 'AAAA' },
      { ...record({ id: 'b', usedCount: 3, useLimit: null }), codeHint: 'BBBB' },
      { ...record({ id: 'c', usedCount: 517, useLimit: 517 }), codeHint: 'CCCC' },
      { ...record({ id: 'd', usedCount: 25, useLimit: null }), codeHint: 'DDDD' },
    ].map(({ hint: _hint, ...r }) => r);
    const tx = {
      agencyInviteCode: { findMany: async () => rows },
    } as unknown as TenantTx;
    const list = await listInviteCodesIn(tx, 'agency', NOW);
    expect(list.map((c) => [c.hint, c.status, c.limited])).toEqual([
      ['AAAA', 'active', true],
      ['BBBB', 'active', false],
      ['CCCC', 'exhausted', true],
      ['DDDD', 'active', false],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/usedCount|"used|useLimit|517/);
    expect(JSON.stringify(list)).not.toMatch(/"(7|3|25)"|:7\b|:3\b|:25\b/);
  });
});
