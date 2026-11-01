import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  assertAuthSecretConfigured,
  AuthSecretNotConfiguredError,
  MIN_AUTH_SECRET_LENGTH,
} from './auth-secret';

const TEST_SECRET = 'test-only-auth-secret-not-used-anywhere-else';

describe('assertAuthSecretConfigured', () => {
  it('refuses to start when no signing key is set', () => {
    expect(() => assertAuthSecretConfigured({})).toThrow(AuthSecretNotConfiguredError);
  });

  it('treats a blank value as unset', () => {
    expect(() => assertAuthSecretConfigured({ AUTH_SECRET: '   ' })).toThrow(
      AuthSecretNotConfiguredError
    );
  });

  it('accepts AUTH_SECRET', () => {
    expect(() => assertAuthSecretConfigured({ AUTH_SECRET: TEST_SECRET })).not.toThrow();
  });

  it('accepts the legacy NEXTAUTH_SECRET name', () => {
    expect(() => assertAuthSecretConfigured({ NEXTAUTH_SECRET: TEST_SECRET })).not.toThrow();
  });

  // TASK-MULU7GVFBTRXX K-3
  it('refuses a key shorter than 32 characters', () => {
    expect(MIN_AUTH_SECRET_LENGTH).toBe(32);
    for (const weak of ['x', 'secret', 'change-me', 'a'.repeat(31), ` ${'a'.repeat(31)} `]) {
      expect(() => assertAuthSecretConfigured({ AUTH_SECRET: weak })).toThrow(/too short/);
      expect(() => assertAuthSecretConfigured({ NEXTAUTH_SECRET: weak })).toThrow(AuthSecretNotConfiguredError);
    }
    expect(() => assertAuthSecretConfigured({ AUTH_SECRET: 'a'.repeat(32) })).not.toThrow();
  });

  // TASK-MULU7GVFBTRXX K-4 — the digest set is a parameter, so the refusal is
  // proven with a key of the test's own and the real retired value stays out.
  it('refuses a key whose SHA-256 is on the retired list', () => {
    const retiredKey = 'a-key-this-test-pretends-was-committed-to-git';
    const retired = new Set([createHash('sha256').update(retiredKey).digest('hex')]);
    expect(() => assertAuthSecretConfigured({ AUTH_SECRET: retiredKey }, retired)).toThrow(/retired key/);
    expect(() => assertAuthSecretConfigured({ NEXTAUTH_SECRET: retiredKey }, retired)).toThrow(
      AuthSecretNotConfiguredError
    );
    expect(() => assertAuthSecretConfigured({ AUTH_SECRET: TEST_SECRET }, retired)).not.toThrow();
  });

  it('the built-in retired list holds only SHA-256 digests, never a value', () => {
    // The default list is used when no set is passed; TEST_SECRET is not on it.
    expect(() => assertAuthSecretConfigured({ AUTH_SECRET: TEST_SECRET })).not.toThrow();
    const source = readFileSync(join(__dirname, 'auth-secret.ts'), 'utf8');
    const block = source.slice(source.indexOf('RETIRED_SECRET_SHA256'), source.indexOf(']);'));
    const entries = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e).toMatch(/^[0-9a-f]{64}$/);
  });
});
