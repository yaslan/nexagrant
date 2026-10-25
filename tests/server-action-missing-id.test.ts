import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetScope } from './helpers/tenant-scope-mock';

/**
 * TASK-MUMSUA77J1C6Q — a server action's arguments come from the client, so an
 * id typed `string` can arrive as `undefined`. Prisma drops an `undefined` key
 * from `where`, which turns "delete this one row of the tenant" into "delete
 * every row of the tenant". The fakes below behave the way Prisma does with the
 * key dropped: the lookup finds *something*, and the delete matches everything.
 */

const h = vi.hoisted(() => ({
  evidenceFindFirst: vi.fn(),
  evidenceDeleteMany: vi.fn(),
  apiKeyDeleteMany: vi.fn(),
  auditEventCreate: vi.fn(),
  seatFindFirst: vi.fn(),
  generateSeatCandidates: vi.fn(),
}));

vi.mock('@/lib/tenant', async () => {
  const m = await import('./helpers/tenant-scope-mock');
  return m.tenantModuleStub();
});

vi.mock('@/lib/db', async () => {
  const m = await import('./helpers/tenant-scope-mock');
  return m.dbModuleStub({
    evidence: { findFirst: h.evidenceFindFirst, deleteMany: h.evidenceDeleteMany },
    apiKey: { deleteMany: h.apiKeyDeleteMany },
    auditEvent: { create: h.auditEventCreate },
    consortiumSeat: { findFirst: h.seatFindFirst },
  });
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/m8/server/matching', () => ({ generateSeatCandidates: h.generateSeatCandidates }));

import { deleteEvidence } from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import { revokeApiKey } from '@/app/[locale]/(app)/[workspace]/settings/api-keys/actions';
import { computeSeatCandidates } from '@/modules/m8/server/actions';

const missing = [undefined, null, ''] as unknown as string[];

beforeEach(() => {
  resetScope();
  vi.clearAllMocks();
  h.evidenceFindFirst.mockResolvedValue({ id: 'ev-any', r2ObjectKey: null, fileUrl: null });
  h.evidenceDeleteMany.mockResolvedValue({ count: 7 });
  h.apiKeyDeleteMany.mockResolvedValue({ count: 3 });
  h.seatFindFirst.mockResolvedValue({ id: 'seat-any' });
  h.generateSeatCandidates.mockResolvedValue([]);
});

describe('deleteEvidence', () => {
  it.each(missing)('refuses %j without touching the table', async (id) => {
    expect(await deleteEvidence(id)).toEqual({ success: false });
    expect(h.evidenceFindFirst).not.toHaveBeenCalled();
    expect(h.evidenceDeleteMany).not.toHaveBeenCalled();
  });

  it('still deletes one row by (id, tenantId)', async () => {
    expect(await deleteEvidence('ev-1')).toEqual({ success: true });
    expect(h.evidenceDeleteMany).toHaveBeenCalledWith({ where: { id: 'ev-1', tenantId: 'tenant-1' } });
  });
});

describe('revokeApiKey', () => {
  it.each(missing)('refuses %j without touching the table', async (id) => {
    expect(await revokeApiKey(id)).toEqual({ success: false });
    expect(h.apiKeyDeleteMany).not.toHaveBeenCalled();
  });

  it('still revokes one key by (id, tenantId)', async () => {
    await revokeApiKey('key-1');
    expect(h.apiKeyDeleteMany).toHaveBeenCalledWith({ where: { id: 'key-1', tenantId: 'tenant-1' } });
  });
});

describe('computeSeatCandidates', () => {
  it.each(missing)('refuses seat %j before the rewrite clears every seat', async (id) => {
    await expect(computeSeatCandidates('opp-1', id)).rejects.toThrow(/not found/);
    expect(h.seatFindFirst).not.toHaveBeenCalled();
    expect(h.generateSeatCandidates).not.toHaveBeenCalled();
  });

  it.each(missing)('refuses opportunity %j', async (id) => {
    await expect(computeSeatCandidates(id, 'seat-1')).rejects.toThrow(/not found/);
    expect(h.generateSeatCandidates).not.toHaveBeenCalled();
  });

  it('still rewrites one seat', async () => {
    await computeSeatCandidates('opp-1', 'seat-1');
    expect(h.generateSeatCandidates).toHaveBeenCalledWith('opp-1', 'seat-1', 'tenant-1', 5);
  });
});
