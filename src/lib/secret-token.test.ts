import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';

/**
 * TASK-MULQLL2T8ZJX4 — the partner portal and invite tokens are stored only as
 * SHA-256. These pin the format the migration (prisma/migrations/
 * hash-bearer-tokens.sql) writes, and that the accept/reject decision goes
 * through `timingSafeEqual`.
 */

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, default: actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const { generateSecretToken, hashSecretToken, issueSecretToken, secretTokenMatches } = await import('./secret-token');
const timingSafeEqual = vi.mocked((await import('node:crypto')).timingSafeEqual);

afterEach(() => timingSafeEqual.mockClear());

describe('secret-token', () => {
  it('generates 32 random bytes as 64 hex characters, never the same twice', () => {
    const a = generateSecretToken();
    const b = generateSecretToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashes to lowercase SHA-256 hex over UTF-8 — what Postgres encode(sha256(convert_to(t, \'UTF8\')), \'hex\') gives', () => {
    // Known vector: sha256("abc").
    expect(hashSecretToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // Computed in Postgres 16 by the migration for this exact legacy token (see the report).
    expect(hashSecretToken('inv-raw-hex-token-1')).toBe(
      '99244d1b1e8581c91ce474e796e0763cf8716c357356bae06b2fcc2f27b77ac7'
    );
  });

  it('issues a token whose stored value is its hash and never the token itself', () => {
    const { raw, hash } = issueSecretToken();
    expect(hash).toBe(hashSecretToken(raw));
    expect(hash).not.toContain(raw);
    expect(secretTokenMatches(raw, hash)).toBe(true);
  });

  it('refuses a wrong token, the stored hash presented as a token, and empty or malformed input', () => {
    const { raw, hash } = issueSecretToken();
    expect(secretTokenMatches(generateSecretToken(), hash)).toBe(false);
    // A leaked database value is not a credential: presenting the hash fails.
    expect(secretTokenMatches(hash, hash)).toBe(false);
    // One character off.
    expect(secretTokenMatches(raw.slice(0, -1) + (raw.endsWith('0') ? '1' : '0'), hash)).toBe(false);
    expect(secretTokenMatches('', hash)).toBe(false);
    expect(secretTokenMatches(raw, null)).toBe(false);
    expect(secretTokenMatches(raw, undefined)).toBe(false);
    expect(secretTokenMatches(raw, 'not-hex')).toBe(false);
    expect(secretTokenMatches(raw, hash.slice(0, 62))).toBe(false);
  });

  it('decides through crypto.timingSafeEqual on two 32-byte digests', () => {
    const { raw, hash } = issueSecretToken();
    secretTokenMatches(raw, hash);
    secretTokenMatches(generateSecretToken(), hash);
    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
    for (const [a, b] of timingSafeEqual.mock.calls) {
      expect((a as Buffer).length).toBe(32);
      expect((b as Buffer).length).toBe(32);
    }
    expect(crypto.createHash('sha256').update(raw).digest('hex')).toBe(hash);
  });
});
