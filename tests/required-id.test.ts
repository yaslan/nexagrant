import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MUN2KUHP1BP18 — src/lib/required-id.ts, and the library entry points
 * that take a client id but run outside a session-scoped action, so
 * tests/action-missing-id.live.test.ts does not reach them: the agency's
 * invite-code revoke (İNCELEME-27 Ö-3) and the plan admin writes. Each must
 * stop before its filterless `updateMany` / `deleteMany`. Any database access
 * below is a failure: the fakes throw if touched.
 */

const touched = vi.hoisted(() => vi.fn());
const untouchable = vi.hoisted(
  () =>
    new Proxy(
      {},
      {
        get: (_t, model) => {
          touched(String(model));
          throw new Error(`database touched: ${String(model)}`);
        },
      }
    )
);

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    prisma: untouchable,
    withTenant: async () => {
      touched('withTenant');
      throw new Error('database touched: withTenant');
    },
  };
});
vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async () => {
    touched('withSystemScope');
    throw new Error('database touched: withSystemScope');
  },
}));

import { isPresentId, requireActionId, MissingIdError } from '@/lib/required-id';
import { revokeInviteCodeIn } from '@/lib/agency/codes';
import { deletePlan, unassignPlanFromTenant, updateDraftVersion } from '@/lib/billing/plan-repository';
import type { TenantTx } from '@/lib/db';

const missing = [undefined, null, '', '   '] as unknown as string[];

beforeEach(() => touched.mockClear());

describe('isPresentId / requireActionId', () => {
  it('accept a non-empty string and nothing else', () => {
    expect(isPresentId('ck1')).toBe(true);
    for (const v of [...missing, 0, 1, {}, [], true]) expect(isPresentId(v)).toBe(false);
    expect(requireActionId('ck1', 'id')).toBe('ck1');
  });

  it('requireActionId throws a MissingIdError that route handlers map to 400', () => {
    for (const v of missing) {
      let caught: unknown;
      try {
        requireActionId(v, 'planId');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MissingIdError);
      expect(caught).toMatchObject({ status: 400, label: 'planId', message: 'planId is missing' });
    }
  });
});

describe('agency revokeInviteCodeIn', () => {
  function agencyTx() {
    const updateMany = vi.fn(async () => ({ count: 4 }));
    const tx = {
      tenant: { findUnique: vi.fn(async () => ({ kind: 'AGENCY', deletedAt: null })) },
      agencyInviteCode: { updateMany },
      auditEvent: { create: vi.fn() },
    } as unknown as TenantTx;
    return { tx, updateMany };
  }

  it.each(missing)('reports false for id %j and revokes nothing', async (id) => {
    const { tx, updateMany } = agencyTx();
    expect(await revokeInviteCodeIn(tx, { tenantId: 'agency-1', id, revokedBy: 'u' })).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('still revokes one code by (id, tenantId)', async () => {
    const { tx, updateMany } = agencyTx();
    updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await revokeInviteCodeIn(tx, { tenantId: 'agency-1', id: 'code-1', revokedBy: 'u' })).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1', tenantId: 'agency-1', revokedAt: null } })
    );
  });
});

describe('plan admin writes', () => {
  it.each(missing)('refuse plan/version id %j before touching the database', async (id) => {
    await expect(deletePlan(id, 'admin')).rejects.toBeInstanceOf(MissingIdError);
    await expect(updateDraftVersion(id, {} as never, [])).rejects.toBeInstanceOf(MissingIdError);
    await expect(unassignPlanFromTenant(id, 'tenant-1', 'admin')).rejects.toBeInstanceOf(MissingIdError);
    expect(touched).not.toHaveBeenCalled();
  });

  it('a real id goes on to the database (the fake above proves the guard, not a dead path)', async () => {
    await expect(deletePlan('plan-1', 'admin')).rejects.toThrow(/database touched/);
    expect(touched).toHaveBeenCalled();
  });
});
