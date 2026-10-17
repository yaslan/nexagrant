/**
 * Rules of the expert pre-registration that the server enforces (FO-19,
 * TASK-MVBIXPP33UK1B). One place, so the form copy, the mail and the tests read
 * the same numbers. No client import: this is server code.
 */

/**
 * Version of the consent text the expert ticks. A stored row never claims
 * agreement to a text nobody saw: bump this together with the copy in
 * messages/*.json when the consent wording changes.
 */
export const EXPERT_PREREG_CONSENT_VERSION = 'kvkk-v2';

/** The first this many verified experts get a founder number ("Kurucu Uzman"). */
export const FOUNDER_SEAT_LIMIT = 100;

/** A verification link works this long after the registration (24 hours). */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A pending expert who registers again gets a new link, but not sooner than this
 * after the last one: without it one e-mail address could be sent mail forever.
 */
export const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * At most this many verification mails to one address in {@link MAIL_DAY_MS} (FO-45 F5).
 * The cooldown spaces them out; this caps the day. The first registration counts as one.
 */
export const EXPERT_PREREG_DAILY_MAIL_LIMIT = 3;
export const MAIL_DAY_MS = 24 * 60 * 60 * 1000;

/** At most this many registrations per client IP in {@link IP_WINDOW_MS}. */
export const REGISTRATION_IP_LIMIT = 5;
export const IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * A submission counted against the IP window (ExpertPreRegAttempt) is kept this long.
 * Longer than IP_WINDOW_MS so the table stays small, and rows past it are deleted on
 * every submission (register.ts).
 */
export const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Serialises registrations and founder numbering so concurrent requests cannot pass a limit or share a number. */
export const EXPERT_PREREG_LOCK_KEY = 7_302_026_019_001n;

/**
 * The signed result on the verify redirect (`?r=`, verified-outcome.ts) is good
 * this long. It is read once, right after the redirect; an hour is plenty.
 */
export const VERIFIED_OUTCOME_TTL_SECONDS = 60 * 60;
