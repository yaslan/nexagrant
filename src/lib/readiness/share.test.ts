import { describe, expect, it } from 'vitest';
import { READINESS_QUESTIONS, type ReadinessAnswers } from './questions';
import {
  buildShareQuery,
  decodeAnswers,
  decodeReadinessCode,
  encodeAnswers,
  encodeReadinessCode,
  parseShareQuery,
  readinessSignupPath,
} from './share';

const ORG_TYPES = ['municipality', 'metropolitan'] as const;

const answers: ReadinessAnswers = Object.fromEntries(
  READINESS_QUESTIONS.map((q, i) => [q.id, (i % 3) as 0 | 1 | 2]),
);

describe('readiness share link', () => {
  it('round-trips answers and org type through the query string', () => {
    const query = buildShareQuery('metropolitan', answers);
    expect(query).toBe('kurum=metropolitan&cevap=012012012012012');
    expect(parseShareQuery(new URLSearchParams(query!), ORG_TYPES)).toEqual({
      orgType: 'metropolitan',
      answers,
      province: null,
    });
  });

  it('carries an optional province and drops an unknown one', () => {
    const query = buildShareQuery('municipality', answers, 'Samsun');
    expect(query).toBe('kurum=municipality&cevap=012012012012012&il=Samsun');
    expect(parseShareQuery(new URLSearchParams(query!), ORG_TYPES)?.province).toBe('Samsun');
    const bogus = parseShareQuery(
      new URLSearchParams('kurum=municipality&cevap=012012012012012&il=Atlantis'),
      ORG_TYPES,
    );
    expect(bogus).toMatchObject({ orgType: 'municipality', province: null });
  });

  it('refuses to encode an incomplete test', () => {
    expect(encodeAnswers({ pic: 2 })).toBeNull();
    expect(buildShareQuery('municipality', { pic: 2 })).toBeNull();
  });

  it('rejects malformed or tampered links instead of scoring them', () => {
    expect(decodeAnswers('01201201201201')).toBeNull(); // 14 digits
    expect(decodeAnswers('0120120120120123')).toBeNull(); // 16 digits
    expect(decodeAnswers('01201201201201x')).toBeNull();
    expect(decodeAnswers('012012012012013')).toBeNull(); // 3 is not an answer
    expect(parseShareQuery(new URLSearchParams('kurum=hacker&cevap=012012012012012'), ORG_TYPES)).toBeNull();
    expect(parseShareQuery(new URLSearchParams('kurum=municipality'), ORG_TYPES)).toBeNull();
  });
});

describe('readinessSignupPath (TASK-MULV3JXS1AW5X)', () => {
  it('carries the source, and the province when there is one', () => {
    expect(readinessSignupPath('tr')).toBe('/tr/kayit?kaynak=fon-hazirlik');
    expect(readinessSignupPath('en', null)).toBe('/en/register?kaynak=fon-hazirlik');
    expect(readinessSignupPath('tr', 'İstanbul')).toBe('/tr/kayit?kaynak=fon-hazirlik&il=%C4%B0stanbul');
    expect(new URL(readinessSignupPath('tr', 'Şanlıurfa'), 'http://x').searchParams.get('il')).toBe('Şanlıurfa');
  });
});

describe('readiness code on the sign-up link (TASK-MULRR8P7HIII4, B6)', () => {
  it('round-trips org type and answers as one parameter', () => {
    const code = encodeReadinessCode('municipality', answers);
    expect(code).toBe('municipality.012012012012012');
    expect(decodeReadinessCode(code, ORG_TYPES)).toEqual({ orgType: 'municipality', answers, code });
    const url = new URL(readinessSignupPath('tr', 'Samsun', code), 'http://x');
    expect(url.pathname).toBe('/tr/kayit');
    expect(url.searchParams.get('kaynak')).toBe('fon-hazirlik');
    expect(url.searchParams.get('karne')).toBe(code);
  });

  it('refuses anything that is not exactly a known org type and 15 answers', () => {
    for (const bad of [
      null,
      undefined,
      '',
      '012012012012012',
      'municipality',
      'municipality.',
      'municipality.01201201201201',
      'municipality.0120120120120123',
      'municipality.012012012012013',
      'SME.012012012012012',
      'municipality.012012012012012.x',
      '.012012012012012',
    ]) {
      expect(decodeReadinessCode(bad, ORG_TYPES)).toBeNull();
    }
    expect(encodeReadinessCode('municipality', {})).toBeNull();
  });
});
