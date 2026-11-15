import { describe, expect, it } from 'vitest';

import { blankFieldsFrom, findCandidatePairs, type DuplicatePair } from '@/modules/m18/server/duplicate-pairs';
import { type ExistingOrganization } from '@/modules/m18/server/duplicates';
import { mergeSchema } from '@/modules/m18/server/merge-leads';

import { frozenFindCandidatePairs } from './fixtures/m18-ng135-duplicate-pairs.frozen';

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

  it('pairs exact-key and near-name organisations once each, strongest first', async () => {
    const pairs = await findCandidatePairs([
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

  it('does not pair same-name organisations from different provinces', async () => {
    const pairs = await findCandidatePairs([org('a', 'Doğa Derneği', '06'), org('b', 'Doğa Derneği', '35')]);
    expect(pairs).toEqual([]);
  });

  it('caps the list', async () => {
    const many = Array.from({ length: 30 }, (_, i) => org(`o${String(i).padStart(2, '0')}`, 'Ankara Kooperatifi'));
    expect(await findCandidatePairs(many, 5)).toHaveLength(5);
  });

  /**
   * NG-197 rewrote the scan (each pair once, best `limit` kept while scanning, async with yields)
   * and moved the rule into `classifyPair`. The reference is a FROZEN copy of the NG-135 code
   * (`721fd71b`, `fixtures/m18-ng135-duplicate-pairs.frozen.ts`) that imports nothing from the
   * product, so a change to the rule cannot hide in the yardstick.
   *
   * What must match exactly: the set of pairs, each pair's reason, similarity and strength.
   * Order: NG-135 sorted by similarity (descending), then `aId`, and left pairs equal on both in
   * the order it first saw them; NG-197 breaks that tie by `bId`. So the order is compared as
   * "similarity descending, aId, then bId" — the frozen list re-sorted with the `bId` tie-break —
   * and the rows below include a tie group the frozen scan leaves out of `bId` order.
   */
  const byTieBreak = (x: DuplicatePair, y: DuplicatePair) =>
    y.similarity - x.similarity || x.aId.localeCompare(y.aId) || x.bId.localeCompare(y.bId);
  const pairKey = (p: DuplicatePair) => `${p.aId}|${p.bId}|${p.reason}|${p.similarity}|${p.strength}`;

  const equivalenceRows: ExistingOrganization[] = [
    // Listed first, so it is the candidate; its stored key matches a1's computed key only in the
    // other direction — the one-sided key test.
    org('a6', 'Ankara Birlik', '06', 'name:ankara kooperatifi|06'),
    org('a1', 'Ankara Kooperatifi', '06'),
    org('a2', 'Ankara Kooperatifi A.Ş.', '06'),
    org('a3', 'Ankara Kooperatif', null),
    org('a4', 'Ankara Kooperatifi', '35'),
    org('a5', 'Ankara Tarım Kooperatifi', '06'),
    { id: 't1', name: 'Doğa Derneği', provinceCode: '06', taxNumber: '1234567890' },
    { id: 't2', name: 'Doga Dernegi Sanayi', provinceCode: '35', taxNumber: '123.456.78-90' },
    org('d3', 'Doğa Derneği', null),
    org('i1', 'İzmir Ticaret Odası', '35'),
    org('i2', 'Izmir Ticaret Odasi', '35'),
    org('x1', '...', '06'),
    // Listed out of id order: the frozen scan yields (k1,k3) before (k1,k2), both similarity 1.
    org('k3', 'Konya Birlik', '42'),
    org('k1', 'Konya Birlik', '42'),
    org('k2', 'Konya Birlik', '42'),
    ...Array.from({ length: 40 }, (_, i) => org(`b${String(i).padStart(2, '0')}`, `Bursa Toplu ${i + 1}`, '16')),
  ];

  it('gives the same pairs, reasons and similarities as the frozen NG-135 scan, ordered with a bId tie-break (NG-197)', async () => {
    const frozen = frozenFindCandidatePairs(equivalenceRows, Number.MAX_SAFE_INTEGER);
    const expected = [...frozen].sort(byTieBreak);
    expect(expected.length).toBeGreaterThan(100);
    // The documented difference is real in this data: equal (similarity, aId), different order.
    expect(frozen.map(pairKey)).not.toEqual(expected.map(pairKey));
    expect(frozen.findIndex((p) => p.aId === 'k1' && p.bId === 'k3')).toBeLessThan(
      frozen.findIndex((p) => p.aId === 'k1' && p.bId === 'k2'),
    );

    const all = await findCandidatePairs(equivalenceRows, Number.MAX_SAFE_INTEGER);
    expect(new Set(all.map(pairKey))).toEqual(new Set(frozen.map(pairKey)));
    expect(all).toEqual(expected);
    expect(await findCandidatePairs(equivalenceRows)).toEqual(expected.slice(0, 100));
    expect(frozen.some((p) => p.aId === 'a1' && p.bId === 'a6' && p.reason === 'DEDUPE_KEY')).toBe(true);
    expect(frozen.some((p) => p.aId === 't1' && p.bId === 't2' && p.reason === 'TAX_NUMBER')).toBe(true);
  });

  /**
   * NG-197 drops a repeated id (first listing wins). NG-135 ran every listing: an identical repeat
   * changed nothing (its pairs were already seen), a repeat with other fields could add pairs.
   * Ids are primary keys, so the page never sends one twice; this pins the choice.
   */
  it('uses only the first listing of a repeated id (NG-197; NG-135 used every listing)', async () => {
    const identical = [org('a', 'Ankara Kooperatifi'), org('b', 'Ankara Kooperatifi A.Ş.'), org('a', 'Ankara Kooperatifi')];
    expect(await findCandidatePairs(identical)).toEqual(frozenFindCandidatePairs(identical));
    expect(await findCandidatePairs(identical)).toEqual([
      { aId: 'a', bId: 'b', reason: 'DEDUPE_KEY', similarity: 1, strength: 'EXACT' },
    ]);

    const repeatWithOtherFields = [
      org('a', 'Ankara Kooperatifi'),
      org('b', 'Bursa Birlik', '16'),
      org('c', 'Bursa Birlik', '16'),
      org('a', 'Bursa Birlik', '16'),
    ];
    expect(await findCandidatePairs(repeatWithOtherFields)).toEqual([
      { aId: 'b', bId: 'c', reason: 'DEDUPE_KEY', similarity: 1, strength: 'EXACT' },
    ]);
    // The frozen scan also paired the second listing of `a` with b and c.
    expect(frozenFindCandidatePairs(repeatWithOtherFields).map((p) => `${p.aId}|${p.bId}`)).toEqual(['a|b', 'a|c', 'b|c']);
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
