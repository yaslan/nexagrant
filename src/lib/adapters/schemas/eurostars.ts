import { z } from 'zod';
import { BaseTopicSchema } from './common';

/** Normalized Eurostars / EUREKA call. */
export const EurostarsTopicSchema = BaseTopicSchema;
export type EurostarsTopic = z.infer<typeof EurostarsTopicSchema>;

/**
 * Eurostars publishes calls as HTML, not JSON. "Schema drift" for this source is
 * therefore a page that no longer matches any known call pattern.
 *
 * Primary shape (eurekanetwork.org, verified 2026-09-06) is a card:
 *   <span>Deadline 10 September 2026</span> … <a>Eurostars Call 11 for projects …</a>
 */
export const EUROSTARS_CARD_PATTERN =
  /Deadline\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})[\s\S]{0,1500}?Eurostars\s+Call\s+(\d+)/gi;

/** Legacy call-code shapes, kept as a fallback for the older portal markup. */
export const EUROSTARS_CALL_PATTERNS: RegExp[] = [
  /EUROSTARS[-\s](\d{4}[-\s](?:0[1-9]|1[0-2]|A|B))/gi,
  /eurostars\s*call\s*(\d{4}[-\s][\dAB]{2,3})/gi,
  /EUREKA[-\s](\d{4}[-\s][\dAB]{2,3})/gi,
];

const MONTHS = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

/** "10 September 2026" → ISO at 17:00 UTC, or null when the month is unknown. */
export function parseLongDate(day: string, month: string, year: string): string | null {
  const m = MONTHS.indexOf(month.toLowerCase());
  if (m < 0) return null;
  const date = new Date(
    `${year}-${String(m + 1).padStart(2, '0')}-${day.padStart(2, '0')}T17:00:00Z`
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
