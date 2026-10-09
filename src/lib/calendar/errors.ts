import type { CalendarProviderType } from './provider';

/**
 * Failures the calendar settings screen has to explain to a person.
 *
 * They live here, not in `src/modules/m9/server/calendar-actions.ts`, because
 * that file carries `'use server'`: every export of a Server Actions module
 * must be an async function, so a class or a union type declared there breaks
 * the build.
 *
 * The codes are stable and machine-readable so the client can translate them
 * (CLAUDE.md rule 8) instead of showing a raw English `Error.message`.
 */
export type CalendarActionCode =
  | 'CALENDAR_ALREADY_CONNECTED'
  | 'CALENDAR_OAUTH_NOT_CONFIGURED'
  | 'CALENDAR_APP_URL_NOT_CONFIGURED'
  | 'CALENDAR_ENCRYPTION_NOT_CONFIGURED'
  | 'CALENDAR_CONNECTION_NOT_FOUND'
  | 'CALENDAR_FORBIDDEN'
  | 'CALENDAR_UNKNOWN_PROVIDER';

const CODES: readonly CalendarActionCode[] = [
  'CALENDAR_ALREADY_CONNECTED',
  'CALENDAR_OAUTH_NOT_CONFIGURED',
  'CALENDAR_APP_URL_NOT_CONFIGURED',
  'CALENDAR_ENCRYPTION_NOT_CONFIGURED',
  'CALENDAR_CONNECTION_NOT_FOUND',
  'CALENDAR_FORBIDDEN',
  'CALENDAR_UNKNOWN_PROVIDER',
];

export class CalendarActionError extends Error {
  constructor(readonly code: CalendarActionCode) {
    super(code);
    this.name = 'CalendarActionError';
  }
}

/**
 * Thrown when token encryption/decryption is attempted but CALENDAR_ENCRYPTION_KEY
 * is not configured in the environment.
 * Consistent with the iyzico pattern ("anahtar yoksa 503").
 */
export class CalendarEncryptionNotConfiguredError extends Error {
  readonly code = 'CALENDAR_ENCRYPTION_NOT_CONFIGURED';
  readonly status = 503;

  constructor(message = 'Calendar encryption key is not configured (CALENDAR_ENCRYPTION_KEY)') {
    super(message);
    this.name = 'CalendarEncryptionNotConfiguredError';
  }
}

/**
 * What a calendar Server Action answers with.
 *
 * A refusal is *returned*, not thrown. In a production build Next.js does not
 * send a Server Action's thrown `Error.message` to the browser — only an opaque
 * `digest` — so a thrown CALENDAR_* code reached the client in `next dev` and
 * never in production, where every refusal fell back to `errors.unknown`
 * (TASK-MUSFNYHSA49AB). A returned value is serialised as data in both modes.
 */
export type CalendarActionFailure = { ok: false; code: CalendarActionCode };
export type CalendarActionResult<T extends object = object> = ({ ok: true } & T) | CalendarActionFailure;

export function calendarFailure(code: CalendarActionCode): CalendarActionFailure {
  return { ok: false, code };
}

const isCode = (value: unknown): value is CalendarActionCode =>
  typeof value === 'string' && (CODES as readonly string[]).includes(value);

/**
 * Read the code out of a calendar failure.
 *
 * The primary input is the `{ ok: false, code }` an action returned. A thrown
 * error with a listed `code` (CalendarActionError, or
 * CalendarEncryptionNotConfiguredError on the server) is read the same way;
 * failing that, an error whose message carries a code — what a throw looks like
 * after crossing the boundary in `next dev`. Anything unrecognised stays
 * unrecognised rather than being mapped to a plausible message the user would
 * then act on.
 */
export function calendarErrorCode(error: unknown): CalendarActionCode | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (isCode(code)) return code;
  }
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CODES.find((code) => message.includes(code)) ?? null;
}

/**
 * Providers that can be connected in this deployment right now.
 *
 * Not a feature flag: a statement about what exists. `.ics` needs no
 * authorisation — the user downloads the file — while Google has no OAuth
 * client configured and no callback route to return to. Outlook was removed
 * (owner decision 29.09, TASK-MUMMIHYY2F4KB): M9 is Google Calendar + .ics. Add a provider
 * here when its OAuth client and callback route exist, not before.
 */
export const SELF_SERVE_PROVIDERS: readonly CalendarProviderType[] = ['ics'];
