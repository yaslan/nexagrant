/**
 * Field-level encryption of the buyer's VKN/TCKN (NG-40, §18.3).
 *
 * `TenantBillingIdentity.buyerVknTckn` and `Invoice.buyerVknTckn` hold a tax
 * number, and for a sole trader that is a TCKN — a national identity number
 * (KVKK md.5-6). In the database they are stored as an AES-256-GCM envelope
 * `fktax1:<iv_hex>:<tag_hex>:<cipher_hex>`; the application sees plain digits
 * because the Prisma extension in `src/lib/db.ts` (`withTaxIdEncryption`)
 * encrypts on write and decrypts on read.
 *
 * Key: `TAX_ID_ENCRYPTION_KEY`, read from the environment only — never from
 * code, a log line or an error message. 32 bytes as 64 hex characters or as
 * base64 (`openssl rand -base64 32`). A passphrase is refused: a short secret
 * would be stretched silently into something that looks like a key. This is a
 * different variable from `CALENDAR_ENCRYPTION_KEY` on purpose, so rotating or
 * leaking one does not touch the other.
 *
 * Behaviour:
 *   • write: always encrypts; with no usable key it THROWS (fail closed) rather
 *     than store the number in clear.
 *   • read: an envelope is decrypted (no key → throws); a value without the
 *     prefix is a legacy plaintext row and is returned unchanged, so the
 *     application keeps working while `scripts/encrypt-tax-ids.ts` converts
 *     the table.
 *   • the ciphertext is randomised (fresh IV), so equality search on the column
 *     is impossible by design. Nothing queries it by value.
 */
import crypto from 'node:crypto';

export const TAX_ID_PREFIX = 'fktax1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class TaxIdEncryptionKeyError extends Error {
  constructor() {
    // Names the variable, never a value.
    super('TAX_ID_ENCRYPTION_KEY is missing or is not a 32-byte key (64 hex characters or base64 of 32 bytes)');
    this.name = 'TaxIdEncryptionKeyError';
  }
}

/** Parses the key; null when it is absent or not exactly 32 bytes. */
export function resolveTaxIdKey(raw: string | undefined | null = process.env.TAX_ID_ENCRYPTION_KEY): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  const b64 = Buffer.from(value, 'base64');
  return b64.length === 32 ? b64 : null;
}

export function isEncryptedTaxId(value: string): boolean {
  return value.startsWith(TAX_ID_PREFIX) && value.length > TAX_ID_PREFIX.length;
}

export function encryptTaxId(plain: string, keyOverride?: string | null): string {
  if (isEncryptedTaxId(plain)) return plain; // idempotent: never double-wrap
  const key = resolveTaxIdKey(keyOverride === undefined ? process.env.TAX_ID_ENCRYPTION_KEY : keyOverride);
  if (!key) throw new TaxIdEncryptionKeyError();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${TAX_ID_PREFIX}${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${body.toString('hex')}`;
}

/** Envelope → digits; legacy plaintext → unchanged. */
export function decryptTaxId(stored: string, keyOverride?: string | null): string {
  if (!isEncryptedTaxId(stored)) return stored;
  const key = resolveTaxIdKey(keyOverride === undefined ? process.env.TAX_ID_ENCRYPTION_KEY : keyOverride);
  if (!key) throw new TaxIdEncryptionKeyError();
  const parts = stored.slice(TAX_ID_PREFIX.length).split(':');
  if (parts.length !== 3 || parts.some((p) => !p)) throw new Error('Corrupted tax id envelope');
  const [ivHex = '', tagHex = '', bodyHex = ''] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(bodyHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    // Never echo the envelope or the cause: it may carry key-dependent detail.
    throw new Error('Tax id decryption failed (wrong key or corrupted envelope)');
  }
}

const FIELD = 'buyerVknTckn';

function mapField(obj: unknown, fn: (v: string) => string): void {
  if (!obj || typeof obj !== 'object') return;
  const rec = obj as Record<string, unknown>;
  const v = rec[FIELD];
  if (typeof v === 'string') {
    rec[FIELD] = fn(v);
  } else if (v && typeof v === 'object' && typeof (v as { set?: unknown }).set === 'string') {
    // Prisma's `{ set: '…' }` form of an update.
    (v as { set: string }).set = fn((v as { set: string }).set);
  }
}

/** Encrypts the field in a write payload (create/update data, array for createMany). */
export function encryptWriteData(data: unknown): void {
  if (Array.isArray(data)) data.forEach((d) => mapField(d, (v) => encryptTaxId(v)));
  else mapField(data, (v) => encryptTaxId(v));
}

/** Decrypts the field in a query result (one row, many rows or null). */
export function decryptResult(result: unknown): void {
  if (Array.isArray(result)) result.forEach((r) => mapField(r, (v) => decryptTaxId(v)));
  else mapField(result, (v) => decryptTaxId(v));
}
