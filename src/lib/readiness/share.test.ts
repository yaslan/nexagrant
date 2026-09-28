import { describe, expect, it } from 'vitest';
import { READINESS_QUESTIONS, type ReadinessAnswers } from './questions';
import { buildShareQuery, decodeAnswers, encodeAnswers, parseShareQuery } from './share';

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
