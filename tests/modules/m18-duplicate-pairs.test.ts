import { describe, expect, it } from 'vitest';

import { blankFieldsFrom, findCandidatePairs } from '@/modules/m18/server/duplicate-pairs';
import { mergeSchema } from '@/modules/m18/server/merge-leads';

/**
 * NG-135 (M18-F3 phase B). Which organisations are offered as a duplicate pair, which fields a
 * merge fills in, and the merge input guard. The DB side of the merge runs in the e2e walk.
 */
describe('M18 duplicate pairs and merge rules', () => {
  const org = (id: string, name: string, provinceCode: string | null = '06', dedupeKey: string | null = null) => ({
    id,
    name,
    provinceCode,
    dedupeKey,
  });

  it('pairs exact-key and near-name organisations once each, strongest first', () => {
    const pairs = findCandidatePairs([
      org('a', 'Ankara Kooperatifi', '06'),
      org('b', 'Ankara Kooperatifi A.Ş.', '06'),
      org('c', 'Ankara Kooperatif', '06'),
      org('d', 'Izmir Kooperatifi', '35'),
    ]);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((p) => p.aId < p.bId)).toBe(true);
    const keys = pairs.map((p) => `${p.aId}|${p.bId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(pairs[0]).toMatchObject({ aId: 'a', bId: 'b' });
    expect(pairs.some((p) => p.aId === 'd' || p.bId === 'd')).toBe(false);
  });

  it('does not pair same-name organisations from different provinces', () => {
    const pairs = findCandidatePairs([org('a', 'Doğa Derneği', '06'), org('b', 'Doğa Derneği', '35')]);
    expect(pairs).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => org(`o${String(i).padStart(2, '0')}`, 'Ankara Kooperatifi'));
    expect(findCandidatePairs(many, 5)).toHaveLength(5);
  });

  it('fills only blank fields on the kept organisation, never overwrites a kept value', () => {
    const patch = blankFieldsFrom(
      { legalName: 'Kept Yasal', district: null, website: '', provinceCode: '06', sizeBand: null },
      { legalName: 'Dropped Yasal', district: 'Çankaya', website: 'https://x.example', provinceCode: '35', sizeBand: 'SMALL' },
    );
    expect(patch).toEqual({ district: 'Çankaya', website: 'https://x.example', sizeBand: 'SMALL' });
  });

  it('refuses a merge of an organisation into itself', () => {
    expect(mergeSchema.safeParse({ keepId: 'x', dropId: 'x' }).success).toBe(false);
    expect(mergeSchema.safeParse({ keepId: 'x', dropId: 'y' }).success).toBe(true);
    expect(mergeSchema.safeParse({ keepId: '', dropId: 'y' }).success).toBe(false);
  });
});
