import { describe, it, expect } from 'vitest';
import { assertEnvelopedOrNull, isEnvelopedToken, ENVELOPE_PREFIX, PlaintextCalendarTokenError } from '../token-envelope';

describe('token-envelope', () => {
  it('rejects a plaintext token', () => {
    expect(() => assertEnvelopedOrNull('ya29.plaintext-access-token', 'accessToken')).toThrow(
      PlaintextCalendarTokenError
    );
  });

  it('accepts a properly enveloped token', () => {
    expect(() => assertEnvelopedOrNull(`${ENVELOPE_PREFIX}abc123ciphertext`, 'refreshToken')).not.toThrow();
    expect(isEnvelopedToken(`${ENVELOPE_PREFIX}abc123ciphertext`)).toBe(true);
  });

  it('accepts null (column not populated yet)', () => {
    expect(() => assertEnvelopedOrNull(null, 'accessToken')).not.toThrow();
    expect(() => assertEnvelopedOrNull(undefined, 'refreshToken')).not.toThrow();
  });
});
