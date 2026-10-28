import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Retention paging (FO-195 B1), no database: how many transactions a run opens and when
 * it stops. The deletes themselves are pinned against Postgres in
 * tests/m17-text-retention.live.test.ts.
 */
const scopes: string[] = [];
let pages: Array<Array<{ id: string }>> = [];
const findMany = vi.fn();
const updateMany = vi.fn();

vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async (_purpose: string, context: string, cb: (tx: unknown) => Promise<unknown>) => {
    scopes.push(context);
    return cb({
      interregAnalysis: { findMany, updateMany },
      interregCriterionMark: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      interregAnalysisResult: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      $executeRaw: vi.fn(async () => 0),
    });
  },
}));

const { purgeExpiredInterregText } = await import('@/modules/m17/server/retention');

const NOW = new Date('2026-10-01T03:35:00.000Z');
const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${String(from + i).padStart(6, '0')}` }));

beforeEach(() => {
  scopes.length = 0;
  findMany.mockReset();
  updateMany.mockReset();
  updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length }));
  pages = [];
  findMany.mockImplementation(async () => pages.shift() ?? []);
});

describe('purgeExpiredInterregText paging', () => {
  it('opens one transaction per page, not one for the run', async () => {
    pages = [page(0, 3), page(3, 3), page(6, 1)];
    const r = await purgeExpiredInterregText(NOW, { batchSize: 3 });
    expect(scopes).toHaveLength(3);
    expect(r).toEqual({ callSlots: 7, projectSlots: 7, analyses: 7, more: false });
  });

  it('a page smaller than the batch ends the run; an exactly full last page costs one empty look', async () => {
    pages = [page(0, 3)];
    const r = await purgeExpiredInterregText(NOW, { batchSize: 3 });
    expect(scopes).toHaveLength(2); // full page, then the empty one
    expect(r.more).toBe(false);
    expect(r.analyses).toBe(3);
  });

  it('each page starts after the last id of the previous one, so a skipped row is not re-read', async () => {
    pages = [page(0, 2), page(2, 2), []];
    await purgeExpiredInterregText(NOW, { batchSize: 2 });
    const wheres = findMany.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres[0]).not.toContain('"gt"');
    expect(wheres[1]).toContain('"gt":"a000001"');
    expect(wheres[2]).toContain('"gt":"a000003"');
  });

  it('stops at maxBatches with more=true, having committed the pages it ran', async () => {
    pages = [page(0, 2), page(2, 2), page(4, 2), page(6, 2)];
    const r = await purgeExpiredInterregText(NOW, { batchSize: 2, maxBatches: 3 });
    expect(scopes).toHaveLength(3);
    expect(r).toEqual({ callSlots: 6, projectSlots: 6, analyses: 6, more: true });
  });

  it('stops when the time budget is spent', async () => {
    pages = [page(0, 2), page(2, 2), page(4, 2)];
    const r = await purgeExpiredInterregText(NOW, { batchSize: 2, budgetMs: 1e-9 });
    expect(scopes).toHaveLength(1);
    expect(r.more).toBe(true);
  });

  it('a page whose rows were all re-uploaded meanwhile does not end the run early', async () => {
    pages = [page(0, 2), page(2, 1)];
    updateMany.mockImplementationOnce(async () => ({ count: 0 })).mockImplementationOnce(async () => ({ count: 0 }));
    const r = await purgeExpiredInterregText(NOW, { batchSize: 2 });
    expect(scopes).toHaveLength(2);
    expect(r.analyses).toBe(1); // only the second page changed anything
  });

  it('refuses nonsense limits and an invalid date', async () => {
    await expect(purgeExpiredInterregText(NOW, { batchSize: 0 })).rejects.toThrow(/positive/);
    await expect(purgeExpiredInterregText(NOW, { budgetMs: 0 })).rejects.toThrow(/positive/);
    await expect(purgeExpiredInterregText(new Date('nope'))).rejects.toThrow(/valid Date/);
    expect(scopes).toHaveLength(0);
  });
});
