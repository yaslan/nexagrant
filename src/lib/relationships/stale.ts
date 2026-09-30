/**
 * The M4 60-day rule, pure: shared by the /relationships list (the "stale"
 * badge) and the daily reminder job (./stale-reminder.ts), so the screen and
 * the e-mail draw the line on the same day. No imports: a page can use it
 * without pulling in the database layer.
 */

export const STALE_AFTER_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 UTC of `now`'s day: "a digest went out today" means a stamp at or after this. */
export function dayStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The moment at or before which a last contact is stale. */
export function staleCutoff(now: Date, days: number = STALE_AFTER_DAYS): Date {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`stale window must be a whole number of days >= 1, got ${days}`);
  if (Number.isNaN(now.getTime())) throw new RangeError('stale window: `now` is not a valid date');
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Pure: is this relationship stale at `now`? 60 full days since the last
 * contact — contact 60 × 24 h ago is stale, a millisecond later is not. The
 * /relationships list marks rows with this same function.
 */
export function isStaleRelationship(lastContactAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastContactAt) return false;
  const at = new Date(lastContactAt).getTime();
  return Number.isFinite(at) && at <= staleCutoff(now).getTime();
}

/**
 * Pure: stale and not yet reminded for this stale period. A period is one
 * `lastContactAt` value: the reminder records the contact it named
 * (`staleRemindedContactAt`), and any other value — a later contact, or one
 * entered after the reminder but dated before it — starts a new period.
 * Comparing against WHEN the reminder went out instead silenced a relationship
 * for good after a back-dated contact (İNCELEME-51 B-2).
 */
export function isReminderDue(
  row: { lastContactAt: Date | null; staleRemindedContactAt: Date | null },
  now: Date
): boolean {
  if (!isStaleRelationship(row.lastContactAt, now)) return false;
  return row.staleRemindedContactAt === null || row.staleRemindedContactAt.getTime() !== new Date(row.lastContactAt as Date).getTime();
}
