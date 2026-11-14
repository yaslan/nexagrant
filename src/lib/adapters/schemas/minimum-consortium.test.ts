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
});
