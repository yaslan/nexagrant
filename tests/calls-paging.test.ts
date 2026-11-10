import { describe, expect, it } from 'vitest';
import { SEDIA_RESULT_WINDOW, CALLS_SEARCH_MAX_LENGTH, clampSearchText, lastReachablePage } from '@/lib/calls-paging';

/** NG-12 (PR #322 bulgu 4): one cap for the search text, read by the page and by the route. */
describe('clampSearchText', () => {
  it('is 200 characters', () => {
    expect(CALLS_SEARCH_MAX_LENGTH).toBe(200);
  });

  it('keeps a text inside the cap as it is', () => {
    expect(clampSearchText('enerji')).toBe('enerji');
    expect(clampSearchText('a'.repeat(200))).toBe('a'.repeat(200));
  });

  it('cuts a longer text to the cap and keeps its start', () => {
    const out = clampSearchText('b'.repeat(201));
    expect(out).toHaveLength(200);
    expect(out).toBe('b'.repeat(200));
  });

  it('is empty for an empty text', () => {
    expect(clampSearchText('')).toBe('');
  });
});

/**
 * FO-42 re-review finding 1: the closed-grants filter has 16 651 hits, the pager offered 833
 * pages at size 20 and page 501 came back 400 `page_out_of_window`. The pager now ends at the
 * last page inside SEDIA's window, the same line the route draws.
 */
describe('lastReachablePage', () => {
  it('is the window, 10 000 hits', () => {
    expect(SEDIA_RESULT_WINDOW).toBe(10_000);
  });

  it.each([
    // [totalResults, pageSize, last page]
    [16_651, 20, 500],
    [16_651, 50, 200],
    [16_651, 10, 1000],
    [10_000, 20, 500],
    [10_001, 20, 500],
    [10_001, 50, 200],
  ])('caps %i hits at size %i to page %i', (total, size, last) => {
    expect(lastReachablePage(total, size)).toBe(last);
  });

  it.each([
    [1_010, 20, 51],
    [1_010, 50, 21],
    [40, 20, 2],
    [41, 20, 3],
    [1, 50, 1],
  ])('leaves %i hits at size %i at their own %i pages', (total, size, last) => {
    expect(lastReachablePage(total, size)).toBe(last);
  });

  it('is 1 for an empty list', () => {
    expect(lastReachablePage(0, 20)).toBe(1);
  });

  it('never offers a page the route would reject', () => {
    for (const size of [10, 20, 50]) {
      const last = lastReachablePage(1_000_000, size);
      expect(last * size).toBeLessThanOrEqual(SEDIA_RESULT_WINDOW);
      expect((last + 1) * size).toBeGreaterThan(SEDIA_RESULT_WINDOW);
    }
  });
});
