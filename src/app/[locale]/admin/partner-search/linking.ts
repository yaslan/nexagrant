import { matchKeyFor } from '@/modules/m1/server/partner-search/match-pic';

/**
 * Which stored announcements belong to an UnmatchedOrganization (FO-64 / PS-K6).
 *
 * An unmatched announcement is stored with `organizationPic = null` and without the
 * portal's PIC, so a `pic:` matchKey cannot be compared against it. The organisation's
 * name + country key can: the ingestor writes the queue row's `name` and `country`
 * from the same announcement row it stores. Pure, so it is tested without a database.
 */
export function announcementsOfUnmatched<T extends { organizationName: string; country: string | null }>(
  unmatched: { name: string; country: string | null },
  announcements: readonly T[]
): T[] {
  const key = matchKeyFor({ name: unmatched.name, country: unmatched.country });
  if (key === null) return [];
  return announcements.filter((a) => matchKeyFor({ name: a.organizationName, country: a.country }) === key);
}

/**
 * PICs are 9 digits; spaces and dashes an admin pastes in are dropped. The bound is loose
 * on purpose: the real check is that a CordisOrganization with this id exists.
 */
export function parsePic(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{5,12}$/.test(digits) ? digits : null;
}
