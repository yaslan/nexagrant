import { describe, expect, it } from 'vitest';

import { findCandidatePairs } from '@/modules/m18/server/duplicate-pairs';

/**
 * NG-197. The `/duplicates` page runs the duplicate review in the request process. With the
 * NG-135 e2e data (1.000 imported rows that share their first word and differ only in a number,
 * plus the two merge rows) every row lands in one block and nearly every pair is "possibly the
 * same", so the review was one synchronous stretch of ~0.8 s on a laptop and several seconds on
 * a CI runner. While it ran, no other callback of the process ran — among them the timeout of
 * the layout's `withTenant` (Prisma `maxWait`, 2 s), which then fired before the BEGIN answer was
 * read: P2028 "Unable to start a transaction in the given time" and the page fell to the error
 * boundary (CI runs 43617581936, 43620910006, 43620964548).
 *
 * The review has to hand the event loop back while it works. This pins the longest stretch the
 * loop is held, measured by a 0 ms timer chain that runs whenever the loop is free.
 */

const RUN = 'ng197run';
const BULK = Array.from({ length: 1000 }, (_, i) => ({
  id: `bulk${String(i).padStart(5, '0')}`,
  name: `M18 E2E Toplu ${RUN} ${i + 1}`,
  provinceCode: '06',
  dedupeKey: `name:m18 e2e toplu ${RUN} ${i + 1}|06`,
}));
const MERGE = [
  { id: 'merge-a', name: `M18 E2E Birleşme ${RUN}`, provinceCode: null, dedupeKey: `name:m18 e2e birlesme ${RUN}|-` },
  { id: 'merge-b', name: `M18 E2E Birleşme ${RUN}`, provinceCode: '06', dedupeKey: `name:m18 e2e birlesme ${RUN}|06` },
];

/** Longest gap between two runs of a 0 ms timer while `work` is in flight. */
async function longestLoopStall(work: () => Promise<unknown>): Promise<number> {
  let last = performance.now();
  let longest = 0;
  let running = true;
  const tick = () => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
    if (running) setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
  try {
    await work();
  } finally {
    running = false;
  }
  const now = performance.now();
  return Math.max(longest, now - last);
}

/** Far below Prisma's 2 s `maxWait`, far above one slice of the review on a slow runner. */
const STALL_BUDGET_MS = 250;

describe('M18 duplicate review keeps the event loop free (NG-197)', () => {
  it(`never holds the loop longer than ${STALL_BUDGET_MS} ms on the 1.002-row e2e data`, async () => {
    let pairs: Awaited<ReturnType<typeof findCandidatePairs>> = [];
    const stall = await longestLoopStall(async () => {
      pairs = await findCandidatePairs([...BULK, ...MERGE]);
    });
    expect(stall).toBeLessThan(STALL_BUDGET_MS);
    // Same answer as before: the merge pair is found, the list is capped at 100.
    expect(pairs).toHaveLength(100);
    expect(pairs.some((p) => p.aId === 'merge-a' && p.bId === 'merge-b')).toBe(true);
  });
});
