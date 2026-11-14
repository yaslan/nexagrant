import { describe, expect, it } from 'vitest';

import { blankFieldsFrom, findCandidatePairs, type DuplicatePair } from '@/modules/m18/server/duplicate-pairs';
import { findDuplicates, normaliseOrgName, type ExistingOrganization } from '@/modules/m18/server/duplicates';
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
   * NG-197 rewrote the scan (each pair once, best `limit` kept while scanning, async with yields).
   * The answer must be the one the NG-135 scan gave: every row run through `findDuplicates`
   * against its block, first sighting of a pair wins, strongest first.
   */
  function referencePairs(orgs: readonly ExistingOrganization[]): DuplicatePair[] {
    const blocks = new Map<string, ExistingOrganization[]>();
    for (const o of orgs) {
      const first = normaliseOrgName(o.name).split(' ')[0] ?? '';
      if (!first) continue;
      blocks.set(first, [...(blocks.get(first) ?? []), o]);
    }
    const seen = new Set<string>();
    const pairs: DuplicatePair[] = [];
    for (const block of blocks.values()) {
      if (block.length < 2) continue;
      for (const o of block) {
        for (const hit of findDuplicates(o, block)) {
          if (hit.id === o.id) continue;
          const [aId, bId] = o.id < hit.id ? [o.id, hit.id] : [hit.id, o.id];
          if (seen.has(`${aId}|${bId}`)) continue;
          seen.add(`${aId}|${bId}`);
          pairs.push({ aId, bId, reason: hit.reason, similarity: hit.similarity, strength: hit.strength });
        }
      }
    }
    return pairs.sort(
      (x, y) => y.similarity - x.similarity || x.aId.localeCompare(y.aId) || x.bId.localeCompare(y.bId),
    );
  }

  it('gives the same pairs, reasons and order as running findDuplicates over each block (NG-197)', async () => {
    const orgs: ExistingOrganization[] = [
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
      ...Array.from({ length: 40 }, (_, i) => org(`b${String(i).padStart(2, '0')}`, `Bursa Toplu ${i + 1}`, '16')),
    ];
    const expected = referencePairs(orgs);
    expect(expected.length).toBeGreaterThan(100);
    expect(await findCandidatePairs(orgs, Number.MAX_SAFE_INTEGER)).toEqual(expected);
    expect(await findCandidatePairs(orgs)).toEqual(expected.slice(0, 100));
    expect(expected.some((p) => p.aId === 'a1' && p.bId === 'a6' && p.reason === 'DEDUPE_KEY')).toBe(true);
    expect(expected.some((p) => p.aId === 't1' && p.bId === 't2' && p.reason === 'TAX_NUMBER')).toBe(true);
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
