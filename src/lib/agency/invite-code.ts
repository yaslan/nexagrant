/**
 * Bulk invite codes a development agency hands out (TASK-MULRQJQYM0NAM, FB KAMU B1).
 *
 * A code is a bearer secret: whoever holds it opens a Discover tenant linked to
 * the agency. So it has to be unguessable, easy to read off a slide or a flyer,
 * and never stored in clear — the database keeps only its SHA-256.
 *
 * Pure module: no database, no framework. The server actions and the
 * registration path both go through `normalizeInviteCode` + `hashInviteCode`,
 * so what the agency was shown and what a registrant types hash the same.
 */
import { createHash, randomInt } from 'node:crypto';

/**
 * No 0/O, 1/I/L, or U: the characters people misread or mistype. 30 symbols,
 * 12 of them ≈ 58.9 bits — out of reach for guessing, short enough to type.
 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_LENGTH = 12;
const GROUP = 4;

/** A fresh code, grouped for display: `XXXX-XXXX-XXXX`. */
export function generateInviteCode(): string {
  let raw = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    // randomInt draws from the CSPRNG and rejects modulo bias itself.
    raw += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return formatInviteCode(raw);
}

export function formatInviteCode(raw: string): string {
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP) groups.push(raw.slice(i, i + GROUP));
  return groups.join('-');
}

/**
 * What a person typed, reduced to the canonical form, or `null` when it cannot
 * be a code at all. Case, spaces and dashes are forgiven; anything else is not
 * guessed at — a `null` here and an unknown code downstream end in the same
 * uniform refusal, so rejecting early leaks nothing.
 */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of raw) if (!INVITE_CODE_ALPHABET.includes(ch)) return null;
  return raw;
}

/** SHA-256 hex of the canonical form. Only this reaches the database. */
export function hashInviteCode(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Last four characters: enough for an agency to tell its codes apart in a list. */
export function inviteCodeHint(normalized: string): string {
  return normalized.slice(-4);
}
