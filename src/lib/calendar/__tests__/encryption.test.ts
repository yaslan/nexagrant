import { describe, it, expect } from 'vitest';
import {
  encryptCalendarToken,
  decryptCalendarToken,
  resolveEncryptionKey,
  hasCalendarEncryptionKey,
} from '../encryption';
import { ENVELOPE_PREFIX, isEnvelopedToken } from '../token-envelope';
import { CalendarEncryptionNotConfiguredError } from '../errors';

const SAMPLE_HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SAMPLE_PASSPHRASE = 'fabrika-super-secret-calendar-passphrase-2026';
const SAMPLE_TOKEN = 'ya29.a0ARrdaM-GoogleOAuthAccessTokenSample_987654321_secret';

describe('Calendar token AES-256-GCM encryption', () => {
  describe('key resolution', () => {
    it('resolves 64-char hex key to 32 bytes', () => {
      const key = resolveEncryptionKey(SAMPLE_HEX_KEY);
      expect(key).not.toBeNull();
      expect(key?.length).toBe(32);
    });

    it('resolves passphrase key via SHA-256 to 32 bytes', () => {
      const key = resolveEncryptionKey(SAMPLE_PASSPHRASE);
      expect(key).not.toBeNull();
      expect(key?.length).toBe(32);
    });

    it('returns null for empty/null key', () => {
      expect(resolveEncryptionKey('')).toBeNull();
      expect(resolveEncryptionKey('   ')).toBeNull();
    });

    it('reports whether calendar encryption key is configured', () => {
      const orig = process.env.CALENDAR_ENCRYPTION_KEY;
      try {
        process.env.CALENDAR_ENCRYPTION_KEY = SAMPLE_HEX_KEY;
        expect(hasCalendarEncryptionKey()).toBe(true);

        delete process.env.CALENDAR_ENCRYPTION_KEY;
        expect(hasCalendarEncryptionKey()).toBe(false);
      } finally {
        if (orig) process.env.CALENDAR_ENCRYPTION_KEY = orig;
      }
    });
  });

  describe('encryption and decryption round-trip', () => {
    it('encrypts and decrypts with hex key successfully', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);

      expect(encrypted.startsWith(ENVELOPE_PREFIX)).toBe(true);
      expect(isEnvelopedToken(encrypted)).toBe(true);
      // Cleartext must not be exposed anywhere in the ciphertext envelope
      expect(encrypted).not.toContain(SAMPLE_TOKEN);
      expect(encrypted).not.toContain('ya29.');

      const decrypted = decryptCalendarToken(encrypted, SAMPLE_HEX_KEY);
      expect(decrypted).toBe(SAMPLE_TOKEN);
    });

    it('encrypts and decrypts with passphrase key successfully', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_PASSPHRASE);
      const decrypted = decryptCalendarToken(encrypted, SAMPLE_PASSPHRASE);
      expect(decrypted).toBe(SAMPLE_TOKEN);
    });

    it('produces different ciphertexts for the same plaintext due to random IV', () => {
      const enc1 = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      const enc2 = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      expect(enc1).not.toBe(enc2);
      expect(decryptCalendarToken(enc1, SAMPLE_HEX_KEY)).toBe(SAMPLE_TOKEN);
      expect(decryptCalendarToken(enc2, SAMPLE_HEX_KEY)).toBe(SAMPLE_TOKEN);
    });

    it('formats envelope as fkenc1:<iv_hex>:<tag_hex>:<cipher_hex>', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      const payload = encrypted.slice(ENVELOPE_PREFIX.length);
      const parts = payload.split(':');

      expect(parts.length).toBe(3);
      // IV is 12 bytes = 24 hex characters
      expect(parts[0].length).toBe(24);
      // AuthTag is 16 bytes = 32 hex characters
      expect(parts[1].length).toBe(32);
      // Ciphertext hex is non-empty
      expect(parts[2].length).toBeGreaterThan(0);
    });
  });

  describe('missing key behavior (503 pattern)', () => {
    it('throws CalendarEncryptionNotConfiguredError (503) when key is unset on encrypt', () => {
      const origKey = process.env.CALENDAR_ENCRYPTION_KEY;
      try {
        delete process.env.CALENDAR_ENCRYPTION_KEY;
        expect(() => encryptCalendarToken(SAMPLE_TOKEN, '')).toThrow(
          CalendarEncryptionNotConfiguredError
        );
        try {
          encryptCalendarToken(SAMPLE_TOKEN, '');
        } catch (err) {
          expect(err).toBeInstanceOf(CalendarEncryptionNotConfiguredError);
          expect((err as CalendarEncryptionNotConfiguredError).status).toBe(503);
          expect((err as CalendarEncryptionNotConfiguredError).code).toBe(
            'CALENDAR_ENCRYPTION_NOT_CONFIGURED'
          );
        }
      } finally {
        if (origKey) process.env.CALENDAR_ENCRYPTION_KEY = origKey;
      }
    });

    it('throws CalendarEncryptionNotConfiguredError (503) when key is unset on decrypt', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      expect(() => decryptCalendarToken(encrypted, '')).toThrow(
        CalendarEncryptionNotConfiguredError
      );
    });
  });

  describe('tamper detection and authentication failure', () => {
    it('fails decryption if ciphertext is tampered with', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      const payload = encrypted.slice(ENVELOPE_PREFIX.length);
      const [iv, tag, cipher] = payload.split(':');

      // Flip the first byte of ciphertext
      const tamperedCipher = (cipher.startsWith('00') ? 'ff' : '00') + cipher.slice(2);
      const tamperedEnvelope = `${ENVELOPE_PREFIX}${iv}:${tag}:${tamperedCipher}`;

      expect(() => decryptCalendarToken(tamperedEnvelope, SAMPLE_HEX_KEY)).toThrow(
        /authentication tag mismatch/i
      );
    });

    it('fails decryption if auth tag is tampered with', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      const payload = encrypted.slice(ENVELOPE_PREFIX.length);
      const [iv, tag, cipher] = payload.split(':');

      const tamperedTag = (tag.startsWith('00') ? 'ff' : '00') + tag.slice(2);
      const tamperedEnvelope = `${ENVELOPE_PREFIX}${iv}:${tamperedTag}:${cipher}`;

      expect(() => decryptCalendarToken(tamperedEnvelope, SAMPLE_HEX_KEY)).toThrow(
        /authentication tag mismatch/i
      );
    });

    it('fails decryption if decrypting with a different key', () => {
      const encrypted = encryptCalendarToken(SAMPLE_TOKEN, SAMPLE_HEX_KEY);
      const differentKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      expect(() => decryptCalendarToken(encrypted, differentKey)).toThrow(
        /authentication tag mismatch/i
      );
    });

    it('rejects non-enveloped plaintext on decrypt', () => {
      expect(() => decryptCalendarToken('raw-unencrypted-token', SAMPLE_HEX_KEY)).toThrow(
        /Token is not a valid encrypted envelope/i
      );
    });
  });
});
