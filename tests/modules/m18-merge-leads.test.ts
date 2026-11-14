import { describe, it, expect, vi } from 'vitest';
import { mergeLeadOrganizations } from '@/modules/m18/server/merge-leads';
import { MissingIdError } from '@/lib/required-id';
import type { TenantTx } from '@/lib/db';

/**
 * NG-135 — a blank id must never reach a write. Every write method is a spy; the tests assert
 * none of them is called when the tenant or either organisation id is missing.
 */
function fakeTx() {
  const write = () => vi.fn(async () => ({ count: 0 }));
  const tx = {
    leadOrganization: {
      findFirst: vi.fn(async () => ({ id: 'org-x', tenantId: 't1', deletedAt: null })),
      update: vi.fn(async () => ({})),
    },
    leadMatch: { findMany: vi.fn(async () => []), deleteMany: write(), updateMany: write() },
    leadContact: { updateMany: write() },
    deal: { updateMany: write() },
  };
  return tx;
}

function writesOf(tx: ReturnType<typeof fakeTx>) {
  return [
    tx.leadMatch.deleteMany,
    tx.leadMatch.updateMany,
    tx.leadContact.updateMany,
    tx.deal.updateMany,
    tx.leadOrganization.update,
  ];
}

describe('mergeLeadOrganizations — blank ids write nothing', () => {
  const cases: Array<[string, string, unknown]> = [
    ['blank tenantId', '', { keepId: 'a', dropId: 'b' }],
    ['missing keepId', 't1', { dropId: 'b' }],
    ['blank keepId', 't1', { keepId: '   ', dropId: 'b' }],
    ['missing dropId', 't1', { keepId: 'a' }],
  ];

  for (const [label, tenantId, input] of cases) {
    it(`${label}: throws and performs no write`, async () => {
      const tx = fakeTx();
      await expect(
        mergeLeadOrganizations(tx as unknown as TenantTx, tenantId, input),
      ).rejects.toBeInstanceOf(Error);
      expect(tx.leadOrganization.findFirst).not.toHaveBeenCalled();
      for (const w of writesOf(tx)) expect(w).not.toHaveBeenCalled();
    });
  }

  it('the thrown error names the blank field (MissingIdError)', async () => {
    const tx = fakeTx();
    const err = await mergeLeadOrganizations(tx as unknown as TenantTx, 't1', {
      keepId: '   ',
      dropId: 'b',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingIdError);
    expect((err as MissingIdError).label).toBe('keepId');
  });

  it('with all ids present, the merge writes through the checked ids', async () => {
    const tx = fakeTx();
    tx.leadOrganization.findFirst
      .mockResolvedValueOnce({ id: 'a', tenantId: 't1', deletedAt: null } as never)
      .mockResolvedValueOnce({ id: 'b', tenantId: 't1', deletedAt: null } as never);
    const result = await mergeLeadOrganizations(tx as unknown as TenantTx, 't1', {
      keepId: 'a',
      dropId: 'b',
    });
    expect(result?.keepId).toBe('a');
    expect(tx.deal.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', organizationId: 'b' },
      data: { organizationId: 'a' },
    });
  });
});
