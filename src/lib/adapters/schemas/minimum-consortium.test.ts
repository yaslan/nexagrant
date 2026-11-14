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
});
