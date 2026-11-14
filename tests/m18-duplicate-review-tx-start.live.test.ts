import { describe, expect, test } from 'vitest';
import { withTenant } from '@/lib/db';
import { findCandidatePairs } from '@/modules/m18/server/duplicate-pairs';
import { suiteHasDatabase } from './helpers/database-availability';

/**
 * NG-197 — the P2028 of the M18 merge e2e, on the real driver.
 *
 * After the merge click Next renders the workspace layout and the `/duplicates` page together.
 * The layout starts a `withTenant` transaction: Prisma arms its `maxWait` timer, then waits for
 * BEGIN. The page meanwhile runs the duplicate review. When the review held the event loop longer
 * than `maxWait`, the timer was due before the BEGIN answer was read; Node runs timers first, so
 * the transaction was aborted with P2028 although the pool had idle connections and Postgres was
 * idle (`pg_stat_activity`: only `idle` / `ClientRead`). See the NG-197 report.
 *
 * CI runners are several times slower than a laptop, where the review took ~0.8 s against the
 * 2 s default. Here `maxWait` is cut to 300 ms so the same race shows on any machine: the
 * transaction must still start, because the review hands the loop back while it works.
 */

const SUITE = 'm18-duplicate-review-tx-start.live';
const hasDb = await suiteHasDatabase(SUITE);
const TENANT = 'ng197-tx-start-probe'; // only has to be non-empty for set_config; nothing is read or written

const RUN = 'ng197live';
const ORGS = [
  ...Array.from({ length: 1000 }, (_, i) => ({
    id: `bulk${String(i).padStart(5, '0')}`,
    name: `M18 E2E Toplu ${RUN} ${i + 1}`,
    provinceCode: '06',
    dedupeKey: `name:m18 e2e toplu ${RUN} ${i + 1}|06`,
  })),
  { id: 'merge-a', name: `M18 E2E Birleşme ${RUN}`, provinceCode: null, dedupeKey: `name:m18 e2e birlesme ${RUN}|-` },
  { id: 'merge-b', name: `M18 E2E Birleşme ${RUN}`, provinceCode: '06', dedupeKey: `name:m18 e2e birlesme ${RUN}|06` },
];

describe.skipIf(!hasDb)('M18 duplicate review vs a concurrent tenant transaction (NG-197)', () => {
  test('a withTenant started as the review begins gets its transaction within maxWait', async () => {
    await withTenant(TENANT, (tx) => tx.$queryRaw`SELECT 1`); // a warm pool, as in the running app

    // The layout's transaction: started first, it arms the maxWait timer and waits for BEGIN.
    const layoutTx = withTenant(TENANT, (tx) => tx.$queryRaw`SELECT 1`, { maxWait: 300 }).then(
      () => 'started',
      (error: unknown) => `refused: ${(error as { code?: string }).code ?? String(error)}`,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    // The page's work, in the same process.
    const pairs = await findCandidatePairs(ORGS);

    expect(await layoutTx).toBe('started');
    expect(pairs.some((p) => p.aId === 'merge-a' && p.bId === 'merge-b')).toBe(true);
  });
});
