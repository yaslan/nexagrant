import { describe, expect, it } from 'vitest';

import {
  LIKELY_DUPLICATE_SIMILARITY,
  POSSIBLE_DUPLICATE_SIMILARITY,
  dedupeKey,
  findDuplicates,
  nameSimilarity,
  normaliseOrgName,
  normaliseTaxNumber,
} from '@/modules/m18/server/duplicates';

describe('M18 duplicates — normalisation', () => {
  it.each([
    ['ABC Gıda Sanayi ve Ticaret A.Ş.', 'abc gida'],
    ['ABC GIDA SAN. VE TİC. LTD. ŞTİ.', 'abc gida'],
    ['Çağlar & Öz Limited Şirketi', 'caglar oz'],
    ['  İzmir   Büyükşehir Belediyesi ', 'izmir buyuksehir belediyesi'],
  ])('%s → %s', (raw, expected) => {
    expect(normaliseOrgName(raw)).toBe(expected);
  });

  it('keeps words that tell bodies apart', () => {
    expect(normaliseOrgName('Konya Belediyesi')).not.toBe(normaliseOrgName('Konya Derneği'));
  });

  it('empty or legal-form-only names normalise to empty', () => {
    expect(normaliseOrgName(null)).toBe('');
    expect(normaliseOrgName('A.Ş.')).toBe('');
  });

  it('accepts 10-digit VKN and 11-digit TCKN, refuses anything else', () => {
    expect(normaliseTaxNumber('123 456 78-90')).toBe('1234567890');
    expect(normaliseTaxNumber('12345678901')).toBe('12345678901');
    for (const bad of ['123456789', '123456789012', 'TR1234567890', '', null, undefined]) {
      expect(normaliseTaxNumber(bad)).toBeNull();
    }
  });

  it('dedupeKey prefers the tax number, else name + plate', () => {
    expect(dedupeKey({ name: 'ABC A.Ş.', taxNumber: '1234567890', provinceCode: '6' })).toBe('tax:1234567890');
    expect(dedupeKey({ name: 'ABC Gıda A.Ş.', provinceCode: '6' })).toBe('name:abc gida|06');
    expect(dedupeKey({ name: 'ABC Gıda A.Ş.' })).toBe('name:abc gida|-');
    expect(dedupeKey({ name: 'Ltd. Şti.' })).toBeNull();
  });
});

describe('M18 duplicates — similarity', () => {
  it('thresholds are ordered', () => {
    expect(POSSIBLE_DUPLICATE_SIMILARITY).toBeLessThan(LIKELY_DUPLICATE_SIMILARITY);
  });

  it('is 1 for the same normalised name, 0 for empty, symmetric and in [0,1]', () => {
    expect(nameSimilarity('ABC Gıda A.Ş.', 'abc gida ltd şti')).toBe(1);
    expect(nameSimilarity('', 'abc')).toBe(0);
    const a = nameSimilarity('Karacabey Tarım Kooperatifi', 'Karacabey Tarim Koop.');
    expect(a).toBe(nameSimilarity('Karacabey Tarim Koop.', 'Karacabey Tarım Kooperatifi'));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(nameSimilarity('Karacabey Tarım Kooperatifi', 'Ege Tekstil')).toBeLessThan(0.2);
  });
});

describe('M18 duplicates — findDuplicates', () => {
  const existing = [
    { id: 'tax', name: 'Başka Ad', taxNumber: '1234567890', provinceCode: '35' },
    { id: 'key', name: 'ABC Gıda San. Tic. A.Ş.', provinceCode: '06', dedupeKey: 'name:abc gida|06' },
    { id: 'typo', name: 'Karacabey Tarım Kalkınma Kooperatifii', provinceCode: '16' },
    { id: 'near', name: 'Karacabey Tarım Kooperatifi Birliği', provinceCode: '16' },
    { id: 'other-province', name: 'Karacabey Tarım Kalkınma Kooperatifi', provinceCode: '06' },
    { id: 'unrelated', name: 'Ege Tekstil', provinceCode: '16' },
  ];

  it('tax number is decisive, whatever the name or province', () => {
    const hits = findDuplicates({ name: 'Yeni Unvan', taxNumber: '1234567890', provinceCode: '06' }, existing);
    expect(hits).toEqual([{ id: 'tax', reason: 'TAX_NUMBER', similarity: 1, strength: 'EXACT' }]);
  });

  it('matches the stored dedupeKey, or computes it when the row has none', () => {
    expect(findDuplicates({ name: 'ABC GIDA LTD', provinceCode: '6' }, existing)[0]).toMatchObject({ id: 'key', reason: 'DEDUPE_KEY' });
    expect(
      findDuplicates({ name: 'Ege Tekstil A.Ş.', provinceCode: '16' }, existing).find((h) => h.id === 'unrelated')
    ).toMatchObject({ reason: 'DEDUPE_KEY', strength: 'EXACT' });
  });

  it('ranks similar names in the same province, skips other provinces', () => {
    const hits = findDuplicates({ name: 'Karacabey Tarım Kalkınma Kooperatifi', provinceCode: '16' }, existing);
    expect(hits.map((h) => h.id)).not.toContain('other-province');
    expect(hits[0]).toMatchObject({ id: 'typo', strength: 'LIKELY' });
    expect(hits[0]!.similarity).toBeGreaterThanOrEqual(LIKELY_DUPLICATE_SIMILARITY);
    const near = hits.find((h) => h.id === 'near');
    if (near) expect(near.strength).toBe(near.similarity >= LIKELY_DUPLICATE_SIMILARITY ? 'LIKELY' : 'POSSIBLE');
    for (let i = 1; i < hits.length; i += 1) expect(hits[i - 1]!.similarity).toBeGreaterThanOrEqual(hits[i]!.similarity);
  });

  it('compares names when one province is unknown', () => {
    const hits = findDuplicates({ name: 'Karacabey Tarım Kalkınma Kooperatifi' }, existing);
    expect(hits.map((h) => h.id)).toContain('other-province');
  });

  it('labels a mid-range similarity POSSIBLE', () => {
    const hits = findDuplicates({ name: 'Anadolu Su Ürünleri Birliği' }, [
      { id: 'p', name: 'Anadolu Su Ürünleri Birliği Derneği' },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.strength).toBe('POSSIBLE');
  });
});
