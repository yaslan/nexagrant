import crypto from 'crypto';
import { env } from '@/lib/env';
import { ENVELOPE_PREFIX, isEnvelopedToken } from './token-envelope';
import { CalendarEncryptionNotConfiguredError } from './errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits standard for AES-GCM

/**
 * Normalizes any provided key string into a 32-byte (256-bit) buffer.
 * Supports:
 * - 64-char hex string
 * - 32-byte raw utf-8 string
 * - 44-char base64 string
 * - Any passphrase (derived via SHA-256 to guarantee exactly 32 bytes)
 */
export function resolveEncryptionKey(rawKey?: string | null): Buffer | null {
  const keyStr = rawKey ?? env.CALENDAR_ENCRYPTION_KEY ?? process.env.CALENDAR_ENCRYPTION_KEY;
  if (!keyStr || typeof keyStr !== 'string' || keyStr.trim() === '') {
    return null;
  }

  const trimmed = keyStr.trim();

  // 1. 64-char hex string (256 bits)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // 2. 32-byte raw utf-8 string
  if (Buffer.byteLength(trimmed, 'utf8') === 32) {
    return Buffer.from(trimmed, 'utf8');
  }

  // 3. 32-byte base64 encoded string
  try {
    const b64 = Buffer.from(trimmed, 'base64');
    if (b64.length === 32) {
      return b64;
    }
  } catch {
    // Not valid base64
  }

  // 4. Fallback: SHA-256 hash of passphrase produces a deterministic 32-byte key
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

/**
 * Returns true if CALENDAR_ENCRYPTION_KEY is available and configured.
 */
export function hasCalendarEncryptionKey(): boolean {
  return resolveEncryptionKey() !== null;
}

/**
 * Encrypt a cleartext calendar token using AES-256-GCM and format into the
 * "fkenc1:<iv_hex>:<tag_hex>:<cipher_hex>" envelope.
 *
 * If the encryption key is not configured, throws CalendarEncryptionNotConfiguredError (503).
 */
export function encryptCalendarToken(token: string, keyOverride?: string | null): string {
  if (!token) {
    throw new Error('Cannot encrypt empty or null token');
  }

  const key = resolveEncryptionKey(keyOverride);
  if (!key) {
    throw new CalendarEncryptionNotConfiguredError();
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${ENVELOPE_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an enveloped token ("fkenc1:<iv_hex>:<tag_hex>:<cipher_hex>") back into cleartext.
 *
 * If the encryption key is not configured, throws CalendarEncryptionNotConfiguredError (503).
 * If the envelope is corrupted or the auth tag fails verification, throws an Error.
 */
export function decryptCalendarToken(envelopedToken: string, keyOverride?: string | null): string {
  if (!envelopedToken) {
    throw new Error('Cannot decrypt empty or null token');
  }

  if (!isEnvelopedToken(envelopedToken)) {
    throw new Error(`Token is not a valid encrypted envelope (must start with "${ENVELOPE_PREFIX}")`);
  }

  const key = resolveEncryptionKey(keyOverride);
  if (!key) {
    throw new CalendarEncryptionNotConfiguredError();
  }

  const payload = envelopedToken.slice(ENVELOPE_PREFIX.length);
  const parts = payload.split(':');

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Corrupted calendar token envelope: expected iv:tag:ciphertext components');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(
      `Failed to decrypt calendar token: authentication tag mismatch or corrupted ciphertext (${err instanceof Error ? err.message : 'decryption error'})`
    );
  }
}
