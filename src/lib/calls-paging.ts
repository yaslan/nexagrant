/**
 * SEDIA reads only the first 10 000 hits of a query: measured live, page 100 at
 * size 100 and page 200 at size 50 answer, the next page of each comes back
 * empty with `totalResults: 0`. `/api/cagrilar` rejects a page past it with 400
 * `page_out_of_window`, and the calls page stops "Next" at the same line, so
 * both read this one constant (FO-42).
 */
export const SEDIA_RESULT_WINDOW = 10_000;

/**
 * The last page the calls page can open. `totalResults` stays SEDIA's real
 * total (16 651 for closed grants), but only the pages inside the window can be
 * read, so the pager ends at the last of them. Never below 1, so "1 / 1" shows
 * for an empty list.
 */
export function lastReachablePage(totalResults: number, pageSize: number): number {
  const pages = Math.ceil(totalResults / pageSize);
  const windowPages = Math.floor(SEDIA_RESULT_WINDOW / pageSize);
  return Math.max(1, Math.min(pages, windowPages));
}
