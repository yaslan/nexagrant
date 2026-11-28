import { describe, expect, it } from 'vitest';

import { isRealUtcTimestamp } from '@/lib/env';

/**
 * NG-387 K2-4: ORPHAN_SWEEP_SINCE must name a real UTC instant. `2026-02-31T00:00:00Z` matched the
 * regex and was accepted by Date.parse (rolled over to 3 March), so a typo moved the cut-off silently.
 */
describe('isRealUtcTimestamp (ORPHAN_SWEEP_SINCE calendar check)', () => {
  it.each(['2026-12-01T09:00:00Z', '2026-12-01T09:00Z', '2024-02-29T00:00:00Z', '2026-12-31T23:59:59Z'])(
    'accepts the real instant %s',
    (value) => {
      expect(isRealUtcTimestamp(value)).toBe(true);
    },
  );

  it.each([
    '2026-02-31T00:00:00Z', // day rolls over to 3 March
    '2025-02-29T00:00:00Z', // not a leap year
    '2026-04-31T12:00:00Z', // April has 30 days
    '2026-13-01T00:00:00Z', // month 13
    '2026-12-01T25:00Z', // hour out of range
    '2026-12-01T09:60Z', // minute out of range
    '2026-12-01T24:00:00Z', // JS rolls 24:00 to the next day
    'not-a-date',
  ])('rejects %s', (value) => {
    expect(isRealUtcTimestamp(value)).toBe(false);
  });
});
