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
  // Strict base64 (NG-40 sec F4): Buffer.from(…, 'base64') skips junk characters and
  // ignores stray trailing bits, so an irregular 43-character text decoded to 32
  // bytes and was taken as a key. Accept only the canonical 44-character text of
  // exactly 32 bytes (`openssl rand -base64 32`).
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const b64 = Buffer.from(value, 'base64');
  return b64.length === 32 && b64.toString('base64') === value ? b64 : null;
}

/**
 * SHA-256 of the 32 key bytes of the throwaway key that the test and gate
 * configs (vitest.config.mts, playwright.config.ts, scripts/gate-isolated.sh)
 * publish. Kept as a hash so the value is not repeated in code that ships.
 */
const FIXTURE_KEY_SHA256 = '4884fdaafea47c29fea7159d0daddd9c085d6200e1359e85bb81736af6b7c837';

/**
 * NG-40 sec F2: with the published fixture key every tax number "encrypted" in
 * production could be read by anyone. Refuse it at start-up when NODE_ENV is
 * production or when nobody said which environment this is. Names the variable
 * only, never a value.
 */
export function assertTaxIdKeyIsNotFixture(nodeEnv: string | undefined, raw: string | undefined | null): void {
  // Fail closed (F2 round 3): only an explicit development/test skips the check, so a
  // process that never set NODE_ENV (unset or blank) is treated like production.
  if (nodeEnv === 'development' || nodeEnv === 'test') return;
  const key = resolveTaxIdKey(raw);
  if (key && crypto.createHash('sha256').update(key).digest('hex') === FIXTURE_KEY_SHA256) {
    throw new Error('TAX_ID_ENCRYPTION_KEY is the public test fixture key; set a real key in production');
  }
}

export function isEncryptedTaxId(value: string): boolean {
  return value.startsWith(TAX_ID_PREFIX) && value.length > TAX_ID_PREFIX.length;
}

/** A complete `fktax1:<iv 12B>:<tag 16B>:<cipher>` envelope, as encryptTaxId writes it. */
const ENVELOPE_RE = /^fktax1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

export function encryptTaxId(plain: string, keyOverride?: string | null): string {
  if (ENVELOPE_RE.test(plain)) return plain; // idempotent: never double-wrap a real envelope
  // NG-40 sec F3: a value that only starts like an envelope would be stored as
  // "ciphertext" that no read can open. Refuse it instead of passing it through.
  if (plain.startsWith(TAX_ID_PREFIX)) throw new Error('Tax id value starts with the envelope prefix but is malformed');
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

const NESTED_WRITE_KEYS = ['data', 'create', 'update'] as const;
const NESTED_READ_KEYS = ['include', 'select'] as const;
const TAX_ID_RELATIONS = new Set(['billingIdentity', 'invoices', 'invoice']);

function walkForTaxId(node: unknown, relations: boolean): string | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = walkForTaxId(item, relations);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === FIELD) return key;
    if (relations && TAX_ID_RELATIONS.has(key)) return key;
    if (key === '_count') continue; // a count never returns the field
    const hit = walkForTaxId(value, relations);
    if (hit) return hit;
  }
  return null;
}

/**
 * NG-40 sec F1: the Prisma extension encrypts/decrypts `buyerVknTckn` only for
 * operations ON `TenantBillingIdentity` and `Invoice`. The same field reached
 * through another model — `tenant.update({ data: { billingIdentity: { create } } })`
 * or `tenant.findMany({ include: { invoices: true } })` — would store clear text
 * or hand back an undecrypted envelope, silently. This returns the first key
 * that reaches the field (the field itself, or the relations `billingIdentity` /
 * `invoices` / `invoice`) inside a write payload or an include/select; null when
 * the call is clean. `where` and `_count` are ignored: they never move the value.
 * src/lib/db.ts throws on a hit for every model. For the two covered models the
 * model's own handler owns the top-level field (`allowTopLevelField`); every nested
 * path from them (`tenant.update.invoices.create`, `tenant.include.invoices`) is refused too.
 */
export function findNestedTaxIdAccess(args: unknown, opts: { allowTopLevelField?: boolean } = {}): string | null {
  if (!args || typeof args !== 'object') return null;
  const a = args as Record<string, unknown>;
  for (const k of [...NESTED_WRITE_KEYS, ...NESTED_READ_KEYS]) {
    const node = a[k];
    if (!opts.allowTopLevelField) {
      const hit = walkForTaxId(node, true);
      if (hit) return hit;
      continue;
    }
    // The model's own handler encrypts/decrypts the TOP-LEVEL field (a data object, each
    // createMany row, a select flag); skip exactly that key and still walk everything else.
    for (const item of Array.isArray(node) ? node : [node]) {
      if (!item || typeof item !== 'object') continue;
      for (const [key, value] of Object.entries(item)) {
        if (key === FIELD) continue;
        const hit = walkForTaxId({ [key]: value }, true);
        if (hit) return hit;
      }
    }
  }
  return null;
}
