/**
 * Dashboard date-range resolution.
 *
 * The range travels in the URL as two `YYYY-MM-DD` local-date strings so a
 * filtered dashboard is shareable. Anything else — a missing, malformed or
 * inverted pair — falls back to the default window rather than erroring, so a
 * hand-edited link never breaks the page.
 */

export const DEFAULT_RANGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

export interface DashboardRange {
  /** Start of the first day, local time. */
  from: Date;
  /** Start of the last day, local time — what the UI echoes back. */
  to: Date;
  /** End of the last day; the query bound, so `to` is inclusive. */
  rangeEnd: Date;
}

/** `YYYY-MM-DD` in local time. `toISOString()` would shift the day off UTC. */
export function toRangeParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseRangeParam(value: string | undefined): Date | null {
  if (!value || !DATE_PARAM.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveDashboardRange(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date()
): DashboardRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const toDate = parseRangeParam(to) ?? today;

  const parsedFrom = parseRangeParam(from);
  const fromDate =
    parsedFrom && parsedFrom <= toDate
      ? parsedFrom
      : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  return { from: fromDate, to: toDate, rangeEnd: new Date(toDate.getTime() + DAY_MS - 1) };
}
