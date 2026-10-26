/**
 * "Has an active announcement (N)" badges of the M1 partner table (FO-62).
 *
 * The FO-61 contract has no "count by PIC list" read, only
 * GET /api/organizations/:pic/announcements, one organisation per call, and on a
 * metered plan every call spends a list query of the month. Whether the plan is
 * metered is decided on the server (`partners/page.tsx`, `partnerSearchGrant`):
 * a metered plan renders no badge and so asks for nothing. This loader only
 * runs on an unmetered plan: each PIC once, with a small concurrency cap.
 */

/** Live announcement count of one PIC, or null when the answer was not a count. */
export type FetchBadge = (pic: string) => Promise<number | null>;

export interface BadgeLoader {
  /** Live announcement count of `pic`, or null when unknown. */
  load(pic: string): Promise<number | null>;
}

export function createBadgeLoader(fetchBadge: FetchBadge, concurrency = 4): BadgeLoader {
  const cache = new Map<string, Promise<number | null>>();
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
    const result = slot(() => fetchBadge(pic)).catch(() => null);
    cache.set(pic, result);
    return result;
  }

  return { load };
}

/**
 * One loader per workspace, shared by every badge of a table. Client-side
 * navigation keeps module state, and the workspace switcher is a plain link, so
 * a loader kept without its scope would carry one workspace's counts into the
 * next. A new scope replaces the old loader.
 */
export function scopedLoader(make: () => BadgeLoader): (scope: string) => BadgeLoader {
  let current: { scope: string; loader: BadgeLoader } | null = null;
  return (scope) => {
    if (current?.scope !== scope) current = { scope, loader: make() };
    return current.loader;
  };
}
