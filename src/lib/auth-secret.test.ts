import { describe, it, expect } from 'vitest';
import { assertAuthSecretConfigured, AuthSecretNotConfiguredError } from './auth-secret';

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
});
