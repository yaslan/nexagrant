import { describe, expect, it } from 'vitest';
import { PURGE_BATCH_SIZE, deleteInBatches, purgeClock } from '../purge-policy';

const REAL = new Date('2026-11-27T10:00:00.000Z');

describe('purgeClock (NG-375 B-1, NG-366 sec-gnd B-1)', () => {
  it('no moment given: the real clock', () => {
    expect(purgeClock(undefined, REAL)).toBe(REAL);
  });

  it('a future moment (2099) is clamped to the real clock', () => {
    expect(purgeClock(new Date('2099-01-01T03:45:00.000Z'), REAL)).toBe(REAL);
  });

  it('a past moment is kept: a test can pin a fixed past time', () => {
    const past = new Date('2026-01-01T00:00:00.000Z');
    expect(purgeClock(past, REAL)).toBe(past);
  });

  it('an invalid moment is passed through, so the cutoff throws on it', () => {
    const bad = new Date('nope');
    expect(purgeClock(bad, REAL)).toBe(bad);
  });
});

describe('deleteInBatches (NG-375 B-2)', () => {
  /** A fake table of `rows` ids: findBatch returns the first `take`, deleteIds removes them. */
  function fakeTable(rows: number) {
    let remaining = Array.from({ length: rows }, (_, i) => `r${i}`);
    const takes: number[] = [];
    const deletes: number[] = [];
    return {
      takes,
      deletes,
      findBatch: async (take: number) => {
        takes.push(take);
        return remaining.slice(0, take).map((id) => ({ id }));
      },
      deleteIds: async (ids: string[]) => {
        deletes.push(ids.length);
        const before = remaining.length;
        remaining = remaining.filter((id) => !ids.includes(id));
        return before - remaining.length;
      },
    };
  }

  it('the batch size is 1000', () => {
    expect(PURGE_BATCH_SIZE).toBe(1000);
  });

  it('2500 rows go in batches of 1000, 1000, 500 and all are deleted', async () => {
    const t = fakeTable(2500);
    expect(await deleteInBatches(t.findBatch, t.deleteIds)).toBe(2500);
    expect(t.deletes).toEqual([1000, 1000, 500]);
    expect(t.takes).toEqual([1000, 1000, 1000]);
  });

  it('exactly one full batch costs one extra empty probe and nothing else', async () => {
    const t = fakeTable(1000);
    expect(await deleteInBatches(t.findBatch, t.deleteIds)).toBe(1000);
    expect(t.deletes).toEqual([1000]);
    expect(t.takes).toEqual([1000, 1000]);
  });

  it('no rows: nothing deleted, one probe', async () => {
    const t = fakeTable(0);
    expect(await deleteInBatches(t.findBatch, t.deleteIds)).toBe(0);
    expect(t.deletes).toEqual([]);
  });

  it('a batch that deletes nothing stops the loop instead of spinning on the same rows', async () => {
    let calls = 0;
    const total = await deleteInBatches(
      async () => {
        calls += 1;
        return [{ id: 'stuck' }];
      },
      async () => 0,
    );
    expect(total).toBe(0);
    expect(calls).toBe(1);
  });

  it('rejects a non-positive batch size', async () => {
    await expect(deleteInBatches(async () => [], async () => 0, 0)).rejects.toThrow(RangeError);
  });
});
