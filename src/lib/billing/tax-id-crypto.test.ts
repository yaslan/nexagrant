import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TAX_ID_PREFIX,
  TaxIdEncryptionKeyError,
  assertTaxIdKeyIsNotFixture,
  decryptResult,
  decryptTaxId,
  encryptTaxId,
  encryptWriteData,
  findNestedTaxIdAccess,
  isEncryptedTaxId,
  resolveTaxIdKey,
} from './tax-id-crypto';

// Throwaway keys of this test file only.
const KEY_A = 'a'.repeat(64);
const KEY_B = Buffer.alloc(32, 7).toString('base64');
const VKN = '2840958172';

describe('tax-id-crypto', () => {
  it('round-trips and never leaves the digits in the envelope', () => {
    const enc = encryptTaxId(VKN, KEY_A);
    expect(enc.startsWith(TAX_ID_PREFIX)).toBe(true);
    expect(enc).not.toContain(VKN);
    expect(decryptTaxId(enc, KEY_A)).toBe(VKN);
  });

  it('is randomised: the same number encrypts differently each time', () => {
    expect(encryptTaxId(VKN, KEY_A)).not.toBe(encryptTaxId(VKN, KEY_A));
  });

  it('is idempotent on an envelope and passes legacy plaintext through on read', () => {
    const enc = encryptTaxId(VKN, KEY_A);
    expect(encryptTaxId(enc, KEY_A)).toBe(enc);
    expect(isEncryptedTaxId(VKN)).toBe(false);
    expect(decryptTaxId(VKN, KEY_A)).toBe(VKN);
  });

  it('fails closed without a usable key and names no value', () => {
    expect(() => encryptTaxId(VKN, '')).toThrow(TaxIdEncryptionKeyError);
    expect(() => encryptTaxId(VKN, 'short-passphrase')).toThrow(TaxIdEncryptionKeyError);
    const enc = encryptTaxId(VKN, KEY_A);
    expect(() => decryptTaxId(enc, '')).toThrow(TaxIdEncryptionKeyError);
    try {
      encryptTaxId(VKN, 'short');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(VKN);
      expect(String((e as Error).message)).not.toContain('short');
    }
  });

  it('rejects a wrong key and a tampered envelope without echoing the envelope', () => {
    const enc = encryptTaxId(VKN, KEY_A);
    expect(() => decryptTaxId(enc, KEY_B)).toThrow(/decryption failed/);
    const tampered = enc.slice(0, -2) + (enc.endsWith('00') ? '11' : '00');
    expect(() => decryptTaxId(tampered, KEY_A)).toThrow(/decryption failed/);
    expect(() => decryptTaxId(`${TAX_ID_PREFIX}zz`, KEY_A)).toThrow(/Corrupted/);
  });

  it('accepts 64-hex and base64 keys only', () => {
    expect(resolveTaxIdKey(KEY_A)?.length).toBe(32);
    expect(resolveTaxIdKey(KEY_B)?.length).toBe(32);
    expect(resolveTaxIdKey('x'.repeat(32))).toBeNull();
    expect(resolveTaxIdKey(null)).toBeNull();
    expect(resolveTaxIdKey('')).toBeNull();
    // `undefined` falls back to the environment (default parameter): null only when that is unset.
    const saved = process.env.TAX_ID_ENCRYPTION_KEY;
    try {
      delete process.env.TAX_ID_ENCRYPTION_KEY;
      expect(resolveTaxIdKey(undefined)).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.TAX_ID_ENCRYPTION_KEY;
      else process.env.TAX_ID_ENCRYPTION_KEY = saved;
    }
  });

  it('write/read helpers cover data, { set }, arrays and results', () => {
    process.env.TAX_ID_ENCRYPTION_KEY = KEY_A;
    const one = { buyerVknTckn: VKN, buyerName: 'X' };
    encryptWriteData(one);
    expect(isEncryptedTaxId(one.buyerVknTckn)).toBe(true);
    expect(one.buyerName).toBe('X');

    const setForm = { buyerVknTckn: { set: VKN } };
    encryptWriteData(setForm);
    expect(isEncryptedTaxId(setForm.buyerVknTckn.set)).toBe(true);

    const many: Array<{ buyerVknTckn?: string; buyerName?: string }> = [{ buyerVknTckn: VKN }, { buyerName: 'no tax field' }];
    encryptWriteData(many);
    expect(isEncryptedTaxId(many[0]?.buyerVknTckn ?? '')).toBe(true);

    decryptResult(one);
    decryptResult(many);
    decryptResult(null);
    expect(one.buyerVknTckn).toBe(VKN);
    expect(many[0]?.buyerVknTckn).toBe(VKN);
  });

  // NG-40 sec F4: a base64 key is exactly the canonical text of 32 bytes.
  it('refuses an irregular 43/44-character text as a key (F4)', () => {
    expect(resolveTaxIdKey('x'.repeat(43))).toBeNull(); // no padding
    expect(resolveTaxIdKey(`${'x'.repeat(43)}=`)).toBeNull(); // non-canonical trailing bits
    expect(resolveTaxIdKey(`${'ab cd'.repeat(8)}abc=`)).toBeNull(); // junk characters
    expect(resolveTaxIdKey(`${'A'.repeat(42)}-=`)).toBeNull(); // url-safe alphabet is not this key format
    expect(resolveTaxIdKey(KEY_B)?.length).toBe(32);
    expect(resolveTaxIdKey(crypto.randomBytes(32).toString('base64'))?.length).toBe(32);
  });

  // NG-40 sec F3: only a real envelope is idempotent.
  it('rejects a value that starts with the prefix but is not a full envelope (F3)', () => {
    expect(() => encryptTaxId(`${TAX_ID_PREFIX}junk`, KEY_A)).toThrow(/malformed/);
    expect(() => encryptTaxId(TAX_ID_PREFIX, KEY_A)).toThrow(/malformed/);
    expect(() => encryptTaxId(`${TAX_ID_PREFIX}${'a'.repeat(24)}:${'b'.repeat(32)}:`, KEY_A)).toThrow(/malformed/);
    const real = encryptTaxId(VKN, KEY_A);
    expect(encryptTaxId(real, KEY_A)).toBe(real);
  });

  // NG-40 sec F2: the public test key must not run in production.
  it('refuses the published fixture key in production only (F2)', () => {
    const FIXTURE = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    expect(() => assertTaxIdKeyIsNotFixture('production', FIXTURE)).toThrow(/test fixture/);
    expect(() => assertTaxIdKeyIsNotFixture('production', ` ${FIXTURE}\n`)).toThrow(/test fixture/);
    expect(() => assertTaxIdKeyIsNotFixture('production', KEY_A)).not.toThrow();
    expect(() => assertTaxIdKeyIsNotFixture('production', undefined)).not.toThrow();
    expect(() => assertTaxIdKeyIsNotFixture('test', FIXTURE)).not.toThrow();
    expect(() => assertTaxIdKeyIsNotFixture('development', FIXTURE)).not.toThrow();
    // round 3: an unset / blank NODE_ENV is not an explicit development, so it is checked too
    expect(() => assertTaxIdKeyIsNotFixture(undefined, FIXTURE)).toThrow(/test fixture/);
    expect(() => assertTaxIdKeyIsNotFixture('', FIXTURE)).toThrow(/test fixture/);
    expect(() => assertTaxIdKeyIsNotFixture(undefined, KEY_A)).not.toThrow();
    try {
      assertTaxIdKeyIsNotFixture('production', FIXTURE);
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(FIXTURE);
    }
  });

  // NG-40 sec F1: nested write / include paths the extension cannot see.
  it('finds a nested write or include that reaches the encrypted field (F1)', () => {
    expect(findNestedTaxIdAccess({ data: { billingIdentity: { create: { buyerVknTckn: VKN } } } })).toBe('billingIdentity');
    expect(findNestedTaxIdAccess({ data: { invoices: { create: [{ buyerVknTckn: VKN }] } } })).toBe('invoices');
    expect(findNestedTaxIdAccess({ include: { billingIdentity: true } })).toBe('billingIdentity');
    expect(findNestedTaxIdAccess({ select: { id: true, invoices: { select: { id: true } } } })).toBe('invoices');
    expect(findNestedTaxIdAccess({ create: { x: { buyerVknTckn: VKN } } })).toBe('buyerVknTckn');
    // harmless: where filters, counts, unrelated writes
    expect(findNestedTaxIdAccess({ where: { billingIdentity: { isNot: null } }, data: { name: 'x' } })).toBeNull();
    expect(findNestedTaxIdAccess({ select: { _count: { select: { invoices: true } } } })).toBeNull();
    expect(findNestedTaxIdAccess(undefined)).toBeNull();
  });

  // NG-40 sec round 3 / F1: the two covered models may carry the field at the TOP level
  // only; every nested path from them is refused.
  it('for the covered models allows only the top-level field (F1, round 3)', () => {
    const top = { allowTopLevelField: true };
    expect(findNestedTaxIdAccess({ data: { buyerVknTckn: VKN, buyerName: 'x' } }, top)).toBeNull();
    expect(findNestedTaxIdAccess({ data: [{ buyerVknTckn: VKN }, { buyerVknTckn: VKN }] }, top)).toBeNull();
    expect(findNestedTaxIdAccess({ create: { buyerVknTckn: VKN }, update: { buyerVknTckn: { set: VKN } } }, top)).toBeNull();
    expect(findNestedTaxIdAccess({ select: { buyerVknTckn: true } }, top)).toBeNull();
    expect(findNestedTaxIdAccess({ data: { tenant: { update: { billingIdentity: { create: { buyerVknTckn: VKN } } } } } }, top)).toBe('billingIdentity');
    expect(findNestedTaxIdAccess({ data: { tenant: { update: { invoices: { create: { buyerVknTckn: VKN } } } } } }, top)).toBe('invoices');
    expect(findNestedTaxIdAccess({ include: { tenant: { include: { invoices: true } } } }, top)).toBe('invoices');
    expect(findNestedTaxIdAccess({ data: { tenant: { update: { x: { buyerVknTckn: VKN } } } } }, top)).toBe('buyerVknTckn');
    expect(findNestedTaxIdAccess({ where: { tenantId: 't' }, include: { tenant: true } }, top)).toBeNull();
  });
});
