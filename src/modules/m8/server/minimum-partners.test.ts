import { describe, it, expect } from 'vitest';

import {
  minimumPartnerState,
  passesMinimumPartnerFilter,
  readMinimumPartnerRule,
} from './minimum-partners';

/**
 * NG-52 — the minimum-partner pre-filter (specification §6 "Ön filtre (zorunlu)":
 * uygun ülkeler, asgari ortak sayısı, ...). The threshold is per call (§4 `call`:
 * "asgari ortak"), so it is read from the topic's eligibility record, never
 * written into the code.
 */

describe('readMinimumPartnerRule', () => {
  it('reads the call threshold from the topic eligibility record', () => {
    expect(readMinimumPartnerRule({ restricted: null, minPartners: 3, minCountries: 3 })).toEqual({
      minPartners: 3,
      minCountries: 3,
    });
  });

  it('is unknown — not a guessed number — when the call carries none', () => {
    expect(readMinimumPartnerRule({ restricted: null, eligibleCountries: [] })).toEqual({
      minPartners: null,
      minCountries: null,
    });
    expect(readMinimumPartnerRule(null)).toEqual({ minPartners: null, minCountries: null });
    expect(readMinimumPartnerRule('garbage')).toEqual({ minPartners: null, minCountries: null });
  });

  it('ignores a value that is not a positive whole number', () => {
    expect(readMinimumPartnerRule({ minPartners: 0, minCountries: -2 })).toEqual({ minPartners: null, minCountries: null });
    expect(readMinimumPartnerRule({ minPartners: 2.5, minCountries: '3' })).toEqual({ minPartners: null, minCountries: null });
  });
});

describe('minimumPartnerState', () => {
  const rule = { minPartners: 3, minCountries: 3 };

  it('needs a new country on every remaining seat when the open seats are just enough', () => {
    // One confirmed partner in DE, one open seat (the one being matched) + one more:
    // 3 countries needed, 1 held, 2 seats left → both must bring a new country.
    const state = minimumPartnerState(rule, ['CONFIRMED', 'OPEN', 'OPEN'], new Set(['DE']));
    expect(state).toMatchObject({ countryShortfall: 2, openSeats: 2, requiresNewCountry: true, partnerShortfall: 0 });
  });

  it('does not force a new country while there is slack', () => {
    const state = minimumPartnerState(rule, ['CONFIRMED', 'OPEN', 'OPEN', 'OPEN'], new Set(['DE']));
    expect(state.requiresNewCountry).toBe(false);
  });

  it('reports a seat plan too small to ever reach the call minimum', () => {
    const state = minimumPartnerState({ minPartners: 4, minCountries: null }, ['CONFIRMED', 'OPEN'], new Set(['DE']));
    expect(state.partnerShortfall).toBe(2);
    expect(state.requiresNewCountry).toBe(false);
  });

  it('counts the seat being matched even when the plan lists it as no open seat', () => {
    const state = minimumPartnerState(rule, ['CONFIRMED'], new Set(['DE']));
    expect(state.openSeats).toBe(1);
    expect(state.requiresNewCountry).toBe(true);
  });

  it('is a no-op when the call threshold is unknown', () => {
    const state = minimumPartnerState({ minPartners: null, minCountries: null }, ['CONFIRMED', 'OPEN'], new Set(['DE']));
    expect(state.requiresNewCountry).toBe(false);
    expect(state.partnerShortfall).toBe(0);
  });
});

describe('passesMinimumPartnerFilter', () => {
  const tight = minimumPartnerState({ minPartners: 3, minCountries: 3 }, ['CONFIRMED', 'OPEN', 'OPEN'], new Set(['DE']));
  const loose = minimumPartnerState({ minPartners: 3, minCountries: 3 }, ['CONFIRMED', 'OPEN', 'OPEN', 'OPEN'], new Set(['DE']));

  it('keeps a candidate from a country the consortium does not have yet', () => {
    expect(passesMinimumPartnerFilter('TR', tight)).toBe(true);
  });

  it('drops a candidate from a country already held when every seat must add one', () => {
    expect(passesMinimumPartnerFilter('DE', tight)).toBe(false);
  });

  it('drops a candidate with no recorded country when a new one is required', () => {
    expect(passesMinimumPartnerFilter(null, tight)).toBe(false);
  });

  it('keeps everyone while there is slack', () => {
    expect(passesMinimumPartnerFilter('DE', loose)).toBe(true);
    expect(passesMinimumPartnerFilter(null, loose)).toBe(true);
  });
});
