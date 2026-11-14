import { describe, it, expect } from 'vitest';

import { parseMinimumConsortium } from './common';

/**
 * NG-52 — the call's own minimum-partner threshold, read from the eligibility
 * text the SEDIA payload ships (specification §4: a call carries "asgari ortak").
 */
describe('parseMinimumConsortium', () => {
  it('reads the Horizon Europe general condition', () => {
    expect(
      parseMinimumConsortium(
        'Legal entities must form a consortium of at least three independent legal entities, each established in a different country: at least one in a Member State.'
      )
    ).toEqual({ minPartners: 3, minCountries: 3 });
  });

  it('reads an Erasmus+ style sentence with digits and a separate country count', () => {
    expect(parseMinimumConsortium('Proposals must be submitted by a consortium of minimum 4 organisations from 3 different eligible countries.')).toEqual({
      minPartners: 4,
      minCountries: 3,
    });
  });

  it('reads "a minimum of two organisations from two different Member States"', () => {
    expect(parseMinimumConsortium('a minimum of two organisations from two different Member States or associated third countries')).toEqual({
      minPartners: 2,
      minCountries: 2,
    });
  });

  it('returns nothing when the text states no threshold', () => {
    expect(parseMinimumConsortium('The conditions are described in General Annex B.')).toEqual({});
    expect(parseMinimumConsortium('')).toEqual({});
  });

  // CRW NG-186 bulgu 2: an upper bound on countries is not a minimum.
  it.each([
    'Consortia may include partners from up to 3 different countries.',
    'Partners from no more than 3 different countries are eligible.',
    'Partners from not more than three different Member States.',
    'The consortium may involve at most 3 different countries.',
    'A maximum of 3 different countries may take part.',
    'Maximum 3 different eligible countries.',
    'max 3 different countries',
    'max. 3 different countries',
    'max (up to) 3 different countries',
  ])('reads no country minimum from an upper bound: %s', (text) => {
    expect(parseMinimumConsortium(text)).toEqual({});
  });

  it('keeps the partner minimum and ignores the country cap in the same sentence', () => {
    expect(parseMinimumConsortium('at least 3 partners from up to 5 different countries')).toEqual({ minPartners: 3 });
  });

  it('reads the minimum when a cap and a minimum both appear', () => {
    expect(
      parseMinimumConsortium('No more than 6 different countries may participate; partners must come from 3 different eligible countries.')
    ).toEqual({ minCountries: 3 });
  });
  // CRW NG-186 (2. tur) B-1: a lower bound paired with a cap in the same phrase keeps the lower bound.
  it.each<[string, { minPartners?: number; minCountries?: number }]>([
    ['at least 3 and at most 5 different countries', { minCountries: 3 }],
    ['at least 3 legal entities from at least 2 and at most 4 different countries', { minPartners: 3, minCountries: 2 }],
    ['partners from a minimum of 2 and a maximum of 4 different countries', { minCountries: 2 }],
    ['between 3 and 6 different Member States', { minCountries: 3 }],
    ['partners from 2 to 4 different countries', { minCountries: 2 }],
  ])('keeps the lower bound of a range: %s', (text, expected) => {
    expect(parseMinimumConsortium(text)).toEqual(expected);
  });

  // CRW NG-186 (2. tur) B-2: more upper-bound qualifiers.
  it.each([
    'fewer than 4 different countries',
    'less than 4 different countries',
    'limited to 3 different countries',
    'not exceeding 3 different countries',
    'under 4 different countries',
  ])('reads no country minimum from an upper bound (B-2): %s', (text) => {
    expect(parseMinimumConsortium(text)).toEqual({});
  });

  // CRW NG-186 (2. tur) A–Q table, kept whole as a regression net.
  it.each<[string, string, { minPartners?: number; minCountries?: number }]>([
    ['A', 'up to 3 different countries', {}],
    ['B', 'no more than 3 different countries', {}],
    ['C', 'at most 3 different countries', {}],
    ['D', 'maximum of 3 different countries', {}],
    ['E', 'up to a maximum of 3 different countries', {}],
    ['F', 'fewer than 4 different countries', {}],
    ['G', 'less than 4 different countries', {}],
    ['H', 'limited to 3 different countries', {}],
    ['I', 'at least 3 and at most 5 different countries', { minCountries: 3 }],
    ['J', 'at least 3 legal entities from at least 2 and at most 4 different countries', { minPartners: 3, minCountries: 2 }],
    ['K', 'at least 4 organisations, of which at most 2 in the same country and at least 3 different countries', { minPartners: 4, minCountries: 3 }],
    ['L', 'up to 5 different countries; at least 2 different countries', { minCountries: 2 }],
    ['M', 'maximum 5 different countries, minimum 3 different countries', { minCountries: 3 }],
    ['N', 'at least 3 partners, up to 2 different countries', { minPartners: 3 }],
    ['O', 'at least three legal entities, each established in a different country', { minPartners: 3, minCountries: 3 }],
    ['P', 'at least 3 entities, up to 3 different countries, each established in a different country', { minPartners: 3, minCountries: 3 }],
    ['Q', 'at least 2 partners from 3 different countries', { minPartners: 2, minCountries: 3 }],
  ])('CRW table %s: %s', (_id, text, expected) => {
    expect(parseMinimumConsortium(text)).toEqual(expected);
  });

  // CRW NG-186 (3. tur) bulgu A: "no fewer than" / "not less than" is a minimum, not a cap.
  it.each<[string, { minPartners?: number; minCountries?: number }]>([
    ['no fewer than 3 different countries', { minCountries: 3 }],
    ['not less than 3 different countries', { minCountries: 3 }],
    ['not fewer than 3 different countries', { minCountries: 3 }],
    ['no less than 3 different countries', { minCountries: 3 }],
  ])('reads a negated "fewer/less than" as a minimum (A): %s', (text, expected) => {
    expect(parseMinimumConsortium(text)).toEqual(expected);
  });

  // CRW NG-186 (3. tur) bulgu B: a dash range without spaces keeps its lower bound.
  it.each<[string, { minPartners?: number; minCountries?: number }]>([
    ['2-3 different countries', { minCountries: 2 }],
    ['2–4 different countries', { minCountries: 2 }],
    ['partners from 2 - 4 different countries', { minCountries: 2 }],
  ])('keeps the lower bound of an unspaced dash range (B): %s', (text, expected) => {
    expect(parseMinimumConsortium(text)).toEqual(expected);
  });

  // CRW NG-186 (3. tur) bulgu C: "under the N different countries" is not a minimum.
  it('reads no country minimum from "under the N different countries" (C)', () => {
    expect(parseMinimumConsortium('under the 3 different countries rule')).toEqual({});
  });

  // CRW NG-186 (3. tur) phrase table (13 rows), kept whole as a regression net.
  it.each<[number, string, { minPartners?: number; minCountries?: number }]>([
    [1, 'at least 3 and at most 5 different countries', { minCountries: 3 }],
    [2, '3 to 5 partners from different countries', {}],
    [3, 'between 2 and 4 partners', {}],
    [4, 'under the 3 different countries rule', {}],
    [5, 'three to five different countries', { minCountries: 3 }],
    [6, '2-3 different countries', { minCountries: 2 }],
    [7, 'partners from 2 to 4 different countries', { minCountries: 2 }],
    [8, 'no fewer than 3 different countries', { minCountries: 3 }],
    [9, 'up to 4 partners from 3 different countries', { minCountries: 3 }],
    [10, 'at least two different countries, no more than 5 different countries', { minCountries: 2 }],
    [11, 'maximum 4 partners, at least 3 different countries', { minCountries: 3 }],
    [12, 'at least 3 partners; at most 2 partners per country, at least 3 different countries', { minPartners: 3, minCountries: 3 }],
    [13, 'minimum 3 legal entities, from at least 2 different countries and up to 4 partners', { minPartners: 3, minCountries: 2 }],
  ])('CRW round-3 table %i: %s', (_id, text, expected) => {
    expect(parseMinimumConsortium(text)).toEqual(expected);
  });
});
