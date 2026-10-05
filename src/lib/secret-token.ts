/**
 * Bearer tokens that are stored only as a hash (TASK-MULQLL2T8ZJX4, ROADMAP
 * open decision #12 §8.3).
 *
 * `ApplicationPart.magicToken` (the consortium partner portal link) and
 * `Invitation.token` used to sit in the database as plain text: anyone who could
 * read a backup or a leaked dump could open every partner portal and accept
 * every pending invitation. They now follow the `ApiKey.keyHash` pattern
 * (src/lib/api-auth.ts):
 *
 * - The raw token is generated here, returned to the caller exactly once — to
 *   be put into a link or an e-mail — and never written anywhere.
 * - The database keeps `sha256(raw)` as lowercase hex. A lookup hashes the
 *   presented token and finds the row by that hash through the unique index.
 * - The row that comes back is checked again with `timingSafeEqual`, so the
 *   final accept/reject never depends on a byte-by-byte string comparison.
 *
 * A plain SHA-256 is enough here — unlike a password, the input is 32 random
 * bytes, so there is nothing to brute-force and no need for a slow KDF or salt.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes as 64 hex characters — the length both tokens always had. */
export function generateSecretToken(): string {
  return randomBytes(32).toString('hex');
}

/** What the database stores for a token: SHA-256 over its UTF-8 bytes, hex. */
export function hashSecretToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** A fresh token plus the hash to store for it. Show `raw` once, keep `hash`. */
export function issueSecretToken(): { raw: string; hash: string } {
  const raw = generateSecretToken();
  return { raw, hash: hashSecretToken(raw) };
}

/**
 * Constant-time check that `raw` is the token behind `storedHash`. Both sides
 * are compared as fixed-length SHA-256 digests, so the time taken does not
 * depend on how many leading characters of the token were right.
 */
export function secretTokenMatches(raw: string, storedHash: string | null | undefined): boolean {
  if (!raw || !storedHash) return false;
  const given = createHash('sha256').update(raw, 'utf8').digest();
  // A malformed hash decodes short (Buffer.from never throws on bad hex).
  const expected = Buffer.from(storedHash, 'hex');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(given, expected);
}
