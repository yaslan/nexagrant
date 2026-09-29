import { expect, type Locator, type Page, type Request } from '@playwright/test';

/**
 * Wait until React has hydrated `target`, i.e. its event handlers are attached.
 *
 * `waitForLoadState('networkidle')` stood in for this and is not the same
 * thing: it waits for 500 ms with no request in flight *anywhere on the page*.
 * On CI run 36491973080 both auth.spec tests that used it on `/tr/register`
 * timed out there after 60 s. The page had already rendered (the test just
 * before them saw the heading and both OAuth buttons in 3.3 s). The same wait on
 * the same route passed eleven minutes later in registration-consent.spec.ts
 * (TASK-MULU828HTNN4N). A condition about the whole network passes or fails
 * with whatever the dev server is doing at that moment. Whether a click reaches
 * `onClick` depends on one thing only: whether React has hydrated the element.
 *
 * React 19 stores a DOM node's current props under a `__reactProps$<random>`
 * key when it hydrates or creates that node, and it never stores them on
 * server-rendered markup it has not reached yet. That key is the "handlers are
 * attached" signal.
 *
 * `inflight` is optional. When given, a timeout reports the requests still
 * open, so a CI failure says what it was waiting on instead of just "timeout".
 */
export async function expectHydrated(
  target: Locator,
  inflight?: InflightRequests,
  timeout = 30_000,
): Promise<void> {
  await expect(target).toBeVisible({ timeout });
  await expect
    .poll(
      () =>
        target.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps$'))),
      {
        timeout,
        message: `React never hydrated ${target}${inflight ? `; requests still open: ${inflight.describe()}` : ''}`,
      },
    )
    .toBe(true);
}

export type InflightRequests = { describe(): string };

/** Tracks the page's open requests from now on, for {@link expectHydrated}'s timeout message. */
export function trackInflight(page: Page): InflightRequests {
  const open = new Map<Request, number>();
  page.on('request', (r) => open.set(r, Date.now()));
  page.on('requestfinished', (r) => open.delete(r));
  page.on('requestfailed', (r) => open.delete(r));
  return {
    describe() {
      if (open.size === 0) return 'none';
      const now = Date.now();
      return [...open]
        .map(([r, t]) => `${r.method()} ${r.url()} (${((now - t) / 1000).toFixed(1)}s)`)
        .join(', ');
    },
  };
}
