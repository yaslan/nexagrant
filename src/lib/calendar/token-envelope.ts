/**
 * Envelope format contract for `CalendarConnection.accessToken` / `refreshToken`.
 *
 * Implemented with AES-256-GCM in `src/lib/calendar/encryption.ts`.
 * The gate in `src/lib/db.ts` calls `assertEnvelopedOrNull` before every
 * `calendarConnection` write and rejects anything that isn't `null` or
 * prefixed with `ENVELOPE_PREFIX`.
 */
export const ENVELOPE_PREFIX = 'fkenc1:';

export function isEnvelopedToken(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX) && value.length > ENVELOPE_PREFIX.length;
}

export class PlaintextCalendarTokenError extends Error {
  constructor(field: 'accessToken' | 'refreshToken') {
    super(
      `CalendarConnection.${field} must be null or an encrypted envelope ("${ENVELOPE_PREFIX}…") — ` +
        `plaintext OAuth tokens cannot be written. See docs/ROADMAP.md open decision #12.`
    );
    this.name = 'PlaintextCalendarTokenError';
  }
}

export function assertEnvelopedOrNull(
  value: string | null | undefined,
  field: 'accessToken' | 'refreshToken'
): void {
  if (value === null || value === undefined) return;
  if (!isEnvelopedToken(value)) {
    throw new PlaintextCalendarTokenError(field);
  }
}

export {
  encryptCalendarToken,
  decryptCalendarToken,
  hasCalendarEncryptionKey,
  resolveEncryptionKey,
} from './encryption';
