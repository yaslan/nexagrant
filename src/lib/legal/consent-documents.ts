/**
 * The legal texts a person can be shown, and the version each is currently at.
 *
 * TASK-MTSWLANXSU0IG (A3). A `Consent` row stores a version, never a copy of
 * the text (prisma/schema.prisma explains why). This module is the one place
 * that says what that version is, so a text can never be edited in
 * messages/*.json while the recorded version silently stays the same.
 *
 * ── HOW TO CHANGE A LEGAL TEXT ───────────────────────────────────────────────
 * Editing the copy behind `messageKey` WITHOUT bumping `version` here is the
 * one thing this module exists to prevent: every row written afterwards claims
 * agreement to a text nobody agreed to, and the rows written before become
 * indistinguishable from it. So: change the copy, then bump the version in the
 * same commit. Old rows keep the old version and stay truthful about what they
 * mean — that the person agreed to something else, and may need to be asked
 * again. Nothing rewrites them.
 *
 * ── WHAT IS AND IS NOT IN SCOPE HERE ─────────────────────────────────────────
 * The legal CONTENT of these texts is not this module's business and is not
 * settled yet — it belongs to TASK-MTSWIFJKGTYC, which is waiting on legal
 * input. What is settled is the STRUCTURE: a keyed text, a version, a kind and
 * a purpose. `version` below is dated at the day the versioning scheme itself
 * started, not at the day a lawyer approved the words, because no lawyer has.
 * When the approved wording lands, that is a copy change plus a version bump —
 * exactly the flow above, and no schema or code change.
 */
import type { ConsentKind, ConsentPurpose } from '@prisma/client';

/**
 * One legal instrument presented at one moment.
 *
 * `kind` is the part that must not be fudged. Only EXPLICIT_CONSENT is an
 * art.6(1)(a) legal basis; a disclosure is an information duty and a terms
 * acceptance forms the art.6(1)(b) contract. docs/legal/processing-register.md
 * decides which is which, and it puts account creation (§1) on the contract —
 * so nothing on the registration form is consent, and nothing here says it is.
 */
export interface ConsentDocument {
  /** Stable identity, stored in `Consent.documentId`. */
  readonly id: string;
  /** Stored in `Consent.documentVersion`. Bump whenever the copy changes. */
  readonly version: string;
  /** next-intl key of the text as the user reads it. */
  readonly messageKey: string;
  /** Where the full text is served, per locale. */
  readonly href: (locale: string) => string;
  readonly kind: ConsentKind;
  readonly purpose: ConsentPurpose;
}

/**
 * The privacy notice — KVKK md.10 / GDPR art.13. An information duty, so its
 * kind is DISCLOSURE_ACK and not consent: there is no art.6(1)(a) basis here to
 * withdraw.
 */
export const PRIVACY_NOTICE: ConsentDocument = {
  id: 'privacy-notice',
  version: '2026-10-02.1',
  messageKey: 'legal.privacy.heading',
  href: (locale) => `/${locale}/privacy`,
  kind: 'DISCLOSURE_ACK',
  purpose: 'ACCOUNT_REGISTRATION',
};

/**
 * The terms of service. Accepting them is how the contract that §1 relies on
 * is actually formed, which is why this is recorded rather than assumed.
 */
export const TERMS_OF_SERVICE: ConsentDocument = {
  id: 'terms-of-service',
  version: '2026-10-02.2',
  messageKey: 'legal.terms.heading',
  href: (locale) => `/${locale}/terms`,
  kind: 'TERMS_ACCEPTANCE',
  purpose: 'ACCOUNT_REGISTRATION',
};

/**
 * The agency channel addendum (TASK-MUM676F010E9G, ADR-0006) — shown on the
 * registration screen only when the person arrived with an agency invite code
 * (`/kayit?kod=…`), and acknowledged in the same single box as the two above.
 *
 * An information duty on top of the privacy notice, so DISCLOSURE_ACK, and the
 * purpose stays ACCOUNT_REGISTRATION: the link to the agency is made at
 * registration and nowhere else. `documentId` is what tells it apart, which is
 * why no schema change was needed.
 *
 * What the person reads is the short text under `messageKey`, on the
 * registration screen itself. The full addendum
 * (docs/legal/agency-channel-notice-addendum.md §4/§5) is not published until
 * legal signs it off (§6 there), so `href` points at the box on the screen, not
 * at a page that does not exist yet. When that page ships: copy change, version
 * bump, `href` to `/${locale}/privacy/agency-channel`.
 */
export const AGENCY_CHANNEL_ADDENDUM: ConsentDocument = {
  id: 'agency-channel-addendum',
  version: '2026-09-29.1',
  messageKey: 'Auth.agencyInvite',
  href: (locale) => `/${locale}/kayit#agency-channel-notice`,
  kind: 'DISCLOSURE_ACK',
  purpose: 'ACCOUNT_REGISTRATION',
};

/** Whether this registration carries an agency invite code. */
export interface RegistrationScope {
  readonly agency?: boolean;
}

/**
 * Everything a single registration must put on the record.
 *
 * One tick of one box covers both documents, and both are named in the label
 * next to it with their own links — so the box is specific about what it
 * covers, and the record is specific about which versions were covered.
 */
export const REGISTRATION_DOCUMENTS: readonly ConsentDocument[] = [
  PRIVACY_NOTICE,
  TERMS_OF_SERVICE,
];

/** The set for one registration: with an invite code, the addendum joins it. */
export function registrationDocuments(scope: RegistrationScope = {}): readonly ConsentDocument[] {
  return scope.agency ? [...REGISTRATION_DOCUMENTS, AGENCY_CHANNEL_ADDENDUM] : REGISTRATION_DOCUMENTS;
}

/**
 * The rows a registration should write. Pure — it touches no database and no
 * clock beyond the one the caller passes in, so the write path can be tested
 * without one.
 */
export function registrationConsentRows(input: {
  tenantId: string;
  userId: string;
  locale: string;
  agency?: boolean;
}): Array<{
  tenantId: string;
  userId: string;
  kind: ConsentKind;
  purpose: ConsentPurpose;
  documentId: string;
  documentVersion: string;
  locale: string;
}> {
  return registrationDocuments({ agency: input.agency }).map((doc) => ({
    tenantId: input.tenantId,
    userId: input.userId,
    kind: doc.kind,
    purpose: doc.purpose,
    documentId: doc.id,
    documentVersion: doc.version,
    locale: input.locale,
  }));
}

/**
 * The exact string the browser sends back to say "these versions were on
 * screen and the box was ticked".
 *
 * It is a version stamp rather than a bare `true` so that a stale tab cannot
 * acknowledge a text it never showed: the server compares what came back
 * against what is current and refuses a mismatch
 * (see `acknowledgementMatchesCurrent`). With an invite code the stamp names
 * the addendum too, so a registration with a code cannot go through on a stamp
 * that never showed it.
 */
export function registrationAcknowledgementToken(scope: RegistrationScope = {}): string {
  return registrationDocuments(scope).map((d) => `${d.id}@${d.version}`).join(',');
}

/**
 * Does an acknowledgement token from the browser name exactly the documents
 * that are current right now?
 *
 * Refusing a stale token is the whole reason the token carries versions. If the
 * notice was republished while a registration form sat open, the person read
 * the old one, and accepting their tick would put a false version on the
 * record — worse than having no record, because it looks like proof.
 */
export function acknowledgementMatchesCurrent(token: unknown, scope: RegistrationScope = {}): boolean {
  return typeof token === 'string' && token === registrationAcknowledgementToken(scope);
}
