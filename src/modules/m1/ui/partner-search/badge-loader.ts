/**
 * "Has an active announcement (N)" badges of the M1 partner table (FO-62).
 *
 * The FO-61 contract has no "count by PIC list" read, only
 * GET /api/organizations/:pic/announcements, one organisation per call, and on a
 * metered plan every call spends a list query of the month. So the loader asks
 * for ONE organisation first; when that answer carries a quota (metered plan) it
 * stops and every badge stays hidden — fifty badges must not eat a ten-query
 * month. Unmetered plans get the rest with a small concurrency cap.
 */

export interface BadgeProbe {
  total: number;
  /** The response carried `meta.quota`: the plan meters list queries. */
  metered: boolean;
}

export type FetchBadge = (pic: string) => Promise<BadgeProbe | null>;

export interface BadgeLoader {
  /** Live announcement count of `pic`, or null when unknown or not to be shown. */
  load(pic: string): Promise<number | null>;
}

export function createBadgeLoader(fetchBadge: FetchBadge, concurrency = 4): BadgeLoader {
  const cache = new Map<string, Promise<number | null>>();
  let probe: Promise<boolean> | null = null; // resolves to "metered"
  let running = 0;
  const waiting: Array<() => void> = [];

  async function slot<T>(work: () => Promise<T>): Promise<T> {
    if (running >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await work();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  }

  function load(pic: string): Promise<number | null> {
    const cached = cache.get(pic);
    if (cached) return cached;

    let result: Promise<number | null>;
    if (probe === null) {
      const first = fetchBadge(pic).catch(() => null);
      probe = first.then((r) => r?.metered ?? false);
      result = first.then((r) => (r && !r.metered ? r.total : null));
    } else {
      const gate = probe;
      result = gate.then((metered) =>
        metered ? null : slot(() => fetchBadge(pic).catch(() => null)).then((r) => r?.total ?? null)
      );
    }
    cache.set(pic, result);
    return result;
  }

  return { load };
}
