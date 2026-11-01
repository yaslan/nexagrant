/**
 * Contact masking for Partner Search free text (FO-65 F3 / TASK-MVL3LMW9R7S5E).
 *
 * The announcement summary is written by the organisation, and people put their
 * own e-mail address and phone number in it. Both are masked before the text is
 * stored (`PartnerSearchAnnouncement.description`, `RawFetch.payload`). The UI shows
 * stored text, so it needs no second copy of this rule: the rule lives here only.
 *
 * Privacy wins a tie: a number that may be a phone number is masked. The exceptions
 * below are the shapes partner-search text carries all the time (deadlines with a
 * time, PIC / grant agreement numbers, budgets, year lists, ISBNs) and that no
 * phone number takes; they are kept so a deadline does not turn into "[phone]:00".
 * Probe set: tests/partner-search-mask.test.ts (PR #163 review, crw2-fb B1 + Ö1).
 */

/** "." or an obfuscated "(dot)" / "[dot]", or a bare " dot " between two words. */
const DOT = String.raw`(?:\.|\s?(?:[[(]\s?dot\s?[\])]|\bdot\b)\s?)`;
/** "@", an obfuscated "(at)" / "[at]", or a bare " at " between two words. */
const AT = String.raw`(?:\s?@\s?|\s?[[(]\s?at\s?[\])]\s?|\s+at\s+)`;
/** Local part: Unicode letters too (müller@…), hence the `u` flag. */
const LOCAL_WORD = String.raw`[\p{L}\p{N}_%+-]+`;
const DOMAIN_LABEL = String.raw`[\p{L}\p{N}-]+`;
const EMAIL = new RegExp(
  `${LOCAL_WORD}(?:${DOT}${LOCAL_WORD})*${AT}${DOMAIN_LABEL}(?:${DOT}${DOMAIN_LABEL})*${DOT}\\p{L}{2,}`,
  'giu'
);

/**
 * Number shapes that are not phone numbers, tried before a phone candidate at the
 * same position: a date with an optional time, a PIC / GA / grant agreement number,
 * an ISBN, and a list or range of years.
 */
const NOT_A_PHONE = [
  String.raw`\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?`,
  String.raw`\d{1,2}[./]\d{1,2}[./]\d{4}(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?)?`,
  String.raw`\b(?:PIC|GA|grant\s+agreement)(?:\s+(?:no\.?|nr\.?|number|n°))?\s*[:#]?\s*\d{9}\b`,
  String.raw`\bISBN(?:-1[03])?:?\s*(?:\d[-\s]?){9,12}[\dX]\b`,
  String.raw`\b(?:19|20)\d{2}(?:\s*[,/–-]?\s*(?:19|20)\d{2}\b)+`,
].join('|');

/** A run of digits with short separator runs ("030 / 1234567"); the digit count decides. */
const PHONE_CANDIDATE = String.raw`(?:\+|00)?\d(?:[\s().\/-]{0,3}\d){6,}`;

const NUMBER_RUN = new RegExp(`(${NOT_A_PHONE})|${PHONE_CANDIDATE}`, 'giu');

/** Fewer digits than this is an amount or a reference; a date is caught above. 8 = "12 34 56 78" (DK). */
const PHONE_MIN_DIGITS = 8;

/** "125 000 000" / "2.500.000": thousands groups with one separator and no leading 0 or "+". */
const AMOUNT = /^[1-9]\d{0,2}([ .,])\d{3}(?:\1\d{3})*$/;

/** A personal LinkedIn profile URL (`linkedin.com/in/…`), with or without the scheme. */
const LINKEDIN_PROFILE = /(?:https?:\/\/)?(?:[\p{L}-]+\.)*linkedin\.com\/in\/[\p{L}\p{N}_%.-]+\/?/giu;

export const EMAIL_MASK = '[email]';
export const PHONE_MASK = '[phone]';
export const LINKEDIN_MASK = '[linkedin]';

export function maskContact(text: string): string;
export function maskContact(text: null): null;
export function maskContact(text: string | null): string | null;
export function maskContact(text: string | null): string | null {
  if (text == null) return null;
  return text
    .replace(EMAIL, EMAIL_MASK)
    .replace(LINKEDIN_PROFILE, LINKEDIN_MASK)
    .replace(NUMBER_RUN, (match, notAPhone: string | undefined) => {
      if (notAPhone !== undefined) return match;
      if (AMOUNT.test(match)) return match;
      const digits = match.replace(/\D/g, '').length;
      return digits >= PHONE_MIN_DIGITS ? PHONE_MASK : match;
    });
}
