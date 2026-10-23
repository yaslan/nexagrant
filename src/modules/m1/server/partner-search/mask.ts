/**
 * Contact masking for Partner Search free text (FO-65 F3 / TASK-MVL3LMW9R7S5E).
 *
 * The announcement summary is written by the organisation, and people put their
 * own e-mail address and phone number in it. Both are masked before the text is
 * stored (`PartnerSearchAnnouncement.description`, `RawFetch.payload`). The UI shows
 * stored text, so it needs no second copy of this rule: the rule lives here only.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** A run of digits with optional separators; the digit count decides whether it is a phone number. */
const PHONE_CANDIDATE = /(?:\+|00)?\d(?:[\s().-]?\d){6,}/g;

/** Fewer digits than this is a date (2026-10-23 has 8), an amount or a reference, not a phone number. */
const PHONE_MIN_DIGITS = 9;

export const EMAIL_MASK = '[email]';
export const PHONE_MASK = '[phone]';

export function maskContact(text: string): string;
export function maskContact(text: null): null;
export function maskContact(text: string | null): string | null;
export function maskContact(text: string | null): string | null {
  if (text == null) return null;
  return text
    .replace(EMAIL, EMAIL_MASK)
    .replace(PHONE_CANDIDATE, (match) => {
      const digits = match.replace(/\D/g, '').length;
      return digits >= PHONE_MIN_DIGITS ? PHONE_MASK : match;
    });
}
