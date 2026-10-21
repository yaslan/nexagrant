import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PIC_MATCH_THRESHOLD,
  matchKeyFor,
  matchPic,
  matchableName,
  nameSimilarity,
  normalizePic,
  type CandidateOrganization,
} from './match-pic';

const ORGS: CandidateOrganization[] = [
  { organisationId: '999987648', name: 'ORTA DOGU TEKNIK UNIVERSITESI', country: 'TR' },
  { organisationId: '999979500', name: 'FRAUNHOFER GESELLSCHAFT ZUR FORDERUNG DER ANGEWANDTEN FORSCHUNG EV', country: 'DE' },
  { organisationId: '999842536', name: 'Universidad Politécnica de Madrid', country: 'ES' },
  { organisationId: '911111111', name: 'ACME ROBOTICS GMBH', country: 'AT' },
];

describe('normalizePic', () => {
  it('keeps digits only and treats empty as missing', () => {
    expect(normalizePic(' 999 987 648 ')).toBe('999987648');
    expect(normalizePic('')).toBeNull();
    expect(normalizePic(null)).toBeNull();
  });
});

describe('matchPic — exact PIC', () => {
  it('matches on PIC even when the name and country differ', () => {
    expect(matchPic({ pic: '999987648', name: 'METU', country: 'TR' }, ORGS)).toEqual({
      kind: 'exact',
      pic: '999987648',
      score: 1,
    });
  });

  it('matches a PIC written with spaces', () => {
    expect(matchPic({ pic: '999 979 500', name: 'x' }, ORGS)).toMatchObject({ kind: 'exact', pic: '999979500' });
  });

  it('falls back to fuzzy when the PIC is unknown', () => {
    const r = matchPic({ pic: '123456789', name: 'Orta Doğu Teknik Üniversitesi', country: 'tr' }, ORGS);
    expect(r).toMatchObject({ kind: 'fuzzy', pic: '999987648' });
  });
});

describe('matchPic — name + country fuzzy', () => {
  it('matches Turkish spelling against the ASCII CORDIS name', () => {
    const r = matchPic({ name: 'Orta Doğu Teknik Üniversitesi', country: 'TR' }, ORGS);
    expect(r).toEqual({ kind: 'fuzzy', pic: '999987648', score: 1 });
  });

  it('matches accented names and ignores legal suffixes', () => {
    expect(matchPic({ name: 'UNIVERSIDAD POLITECNICA DE MADRID', country: 'ES' }, ORGS)).toMatchObject({
      kind: 'fuzzy',
      pic: '999842536',
    });
    expect(matchPic({ name: 'Acme Robotics', country: 'AT' }, ORGS)).toMatchObject({ kind: 'fuzzy', pic: '911111111' });
  });

  it('accepts a small typo above the default threshold', () => {
    const r = matchPic({ name: 'Universidad Politecnica de Madird', country: 'ES' }, ORGS);
    expect(r.kind).toBe('fuzzy');
    if (r.kind === 'fuzzy') expect(r.score).toBeGreaterThanOrEqual(DEFAULT_PIC_MATCH_THRESHOLD);
  });

  it('honours a stricter threshold', () => {
    const r = matchPic({ name: 'Universidad Politecnica de Madird', country: 'ES' }, ORGS, 0.99);
    expect(r.kind).toBe('unmatched');
  });

  it('never matches across countries', () => {
    expect(matchPic({ name: 'Acme Robotics GmbH', country: 'DE' }, ORGS).kind).toBe('unmatched');
  });

  it('does not fuzzy-match without a country', () => {
    expect(matchPic({ name: 'ACME ROBOTICS GMBH' }, ORGS).kind).toBe('unmatched');
  });

  it('refuses a tie between two equally close organisations', () => {
    const twins: CandidateOrganization[] = [
      { organisationId: '1', name: 'NOVA LABS', country: 'PT' },
      { organisationId: '2', name: 'NOVA LABS', country: 'PT' },
    ];
    expect(matchPic({ name: 'Nova Labs', country: 'PT' }, twins).kind).toBe('unmatched');
  });
});

describe('matchPic — unmatched', () => {
  it('returns the PIC match key and the best score seen', () => {
    const r = matchPic({ pic: '222222222', name: 'Totally Different Institute', country: 'TR' }, ORGS);
    expect(r.kind).toBe('unmatched');
    if (r.kind === 'unmatched') {
      expect(r.matchKey).toBe('pic:222222222');
      expect(r.bestScore).toBeLessThan(DEFAULT_PIC_MATCH_THRESHOLD);
    }
  });

  it('returns a name key when there is no PIC', () => {
    const r = matchPic({ name: 'Nowhere Ltd.', country: 'ie' }, []);
    expect(r).toEqual({ kind: 'unmatched', matchKey: 'name:IE:NOWHERE', bestScore: 0 });
  });
});

describe('helpers', () => {
  it('matchKeyFor is stable across spelling variants', () => {
    expect(matchKeyFor({ name: 'Orta Doğu Teknik Üniversitesi', country: 'tr' })).toBe(
      matchKeyFor({ name: 'ORTA DOGU TEKNIK UNIVERSITESI', country: 'TR' })
    );
    expect(matchKeyFor({ name: 'x', country: null })).toBe('name:--:X');
  });

  it('nameSimilarity bounds', () => {
    expect(nameSimilarity('ABC', 'ABC')).toBe(1);
    expect(nameSimilarity('', 'ABC')).toBe(0);
    expect(nameSimilarity('ABCD', 'ABCE')).toBe(0.75);
  });

  it('matchableName strips diacritics normalizeOrgName leaves', () => {
    expect(matchableName('Universidad Politécnica de Madrid')).toBe('UNIVERSIDAD POLITECNICA DE MADRID');
    expect(matchableName('Københavns Universitet')).toBe('KOBENHAVNS UNIVERSITET');
  });
});
