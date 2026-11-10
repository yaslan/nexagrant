import { describe, expect, it } from 'vitest';
import {
  TAX_ID_PREFIX,
  TaxIdEncryptionKeyError,
  decryptResult,
  decryptTaxId,
  encryptTaxId,
  encryptWriteData,
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
    expect(resolveTaxIdKey(undefined)).not.toBeUndefined();
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
});
