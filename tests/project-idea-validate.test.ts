import { describe, expect, it } from 'vitest';
import {
  PROJECT_IDEA_LIMITS,
  checkTrl,
  parseKeywords,
  trlCriterionState,
  validateProjectIdea,
  type ProjectIdeaDraft,
} from '@/lib/project-ideas/validate';

const VALID: ProjectIdeaDraft = {
  institution: 'Örnek Üniversite',
  title: 'Akıllı sulama',
  summary: 'Toprak nemine göre sulama.',
  keywords: ['sulama', 'iot'],
  trl: 4,
  targetPrograms: ['horizonEurope'],
};

describe('checkTrl — TRL 1..9 integer', () => {
  it.each([1, 2, 5, 8, 9])('accepts %i', (n) => {
    expect(checkTrl(n)).toBeNull();
  });

  it.each([0, -1, 10, 99])('rejects out of range %i', (n) => {
    expect(checkTrl(n)).toBe('trlOutOfRange');
  });

  it.each([1.5, 4.0001, Number.NaN, Number.POSITIVE_INFINITY])('rejects non-integer %s', (n) => {
    expect(checkTrl(n)).toBe('trlNotInteger');
  });

  it('requires a value when none was chosen', () => {
    expect(checkTrl(null)).toBe('trlRequired');
  });
});

describe('validateProjectIdea', () => {
  it('passes a complete draft', () => {
    const r = validateProjectIdea(VALID);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
  });

  it('TRL boundary: 1 and 9 pass, 0 and 10 fail', () => {
    expect(validateProjectIdea({ ...VALID, trl: 1 }).ok).toBe(true);
    expect(validateProjectIdea({ ...VALID, trl: 9 }).ok).toBe(true);
    expect(validateProjectIdea({ ...VALID, trl: 0 })).toMatchObject({ ok: false, errors: { trl: 'trlOutOfRange' } });
    expect(validateProjectIdea({ ...VALID, trl: 10 })).toMatchObject({ ok: false, errors: { trl: 'trlOutOfRange' } });
  });

  it('reports every missing required field at once', () => {
    const r = validateProjectIdea({
      institution: '   ',
      title: '',
      summary: '',
      keywords: [],
      trl: null,
      targetPrograms: [],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual({
      institution: 'required',
      title: 'required',
      trl: 'trlRequired',
      targetPrograms: 'programRequired',
    });
  });

  it('summary is optional, but capped', () => {
    expect(validateProjectIdea({ ...VALID, summary: '' }).ok).toBe(true);
    const long = 'a'.repeat(PROJECT_IDEA_LIMITS.summary + 1);
    expect(validateProjectIdea({ ...VALID, summary: long }).errors).toEqual({ summary: 'tooLong' });
  });

  it('caps keyword count and keyword length', () => {
    const many = Array.from({ length: PROJECT_IDEA_LIMITS.keywords + 1 }, (_, i) => `k${i}`);
    expect(validateProjectIdea({ ...VALID, keywords: many }).errors).toEqual({ keywords: 'keywordsTooMany' });
    const long = ['x'.repeat(PROJECT_IDEA_LIMITS.keywordLength + 1)];
    expect(validateProjectIdea({ ...VALID, keywords: long }).errors).toEqual({ keywords: 'keywordTooLong' });
  });

  it('rejects a program outside the known list', () => {
    expect(validateProjectIdea({ ...VALID, targetPrograms: ['nope'] }).errors).toEqual({
      targetPrograms: 'programUnknown',
    });
  });
});

describe('parseKeywords', () => {
  it('splits, trims, drops empties and removes case-insensitive duplicates', () => {
    expect(parseKeywords(' sulama, IoT ,, iot , ,toprak ')).toEqual(['sulama', 'IoT', 'toprak']);
  });

  it('returns an empty list for blank input', () => {
    expect(parseKeywords('  ,  ')).toEqual([]);
  });
});

describe('trlCriterionState', () => {
  it('is "missing" with no idea and "present" once one exists', () => {
    expect(trlCriterionState(0)).toBe('missing');
    expect(trlCriterionState(1)).toBe('present');
  });
});
