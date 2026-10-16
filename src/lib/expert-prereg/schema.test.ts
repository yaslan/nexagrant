import { describe, expect, it } from 'vitest';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import { EXPERTISE_AREAS, PROVINCES } from './options';
import { expertPreRegInputSchema, isLinkedInUrl, isValidOrcid } from './schema';

const valid = {
  fullName: 'Ayşe Yılmaz',
  email: 'Ayse@Example.org',
  province: '34',
  title: 'Proje Yöneticisi',
  isFreelancer: true,
  expertiseAreas: ['digital-ict'],
  roles: ['project-manager'],
  programmes: ['erasmus-plus'],
  projectCodes: '',
  orcid: '0000-0002-1825-0097',
  linkedinUrl: 'https://www.linkedin.com/in/ayse-yilmaz',
  languages: ['tr', 'en'],
  referredBy: '',
  utmSource: 'newsletter',
  kvkkAccepted: true,
  visibilityConsent: true,
  marketingConsent: false,
};

function codeOf(input: unknown, field: string): string | undefined {
  const result = expertPreRegInputSchema.safeParse(input);
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.path[0] === field);
  return issue?.message;
}

describe('expertPreRegInputSchema', () => {
  it('accepts a complete valid submission and normalises the email and blanks', () => {
    const result = expertPreRegInputSchema.parse(valid);
    expect(result.email).toBe('ayse@example.org');
    expect(result.projectCodes).toBeNull();
    expect(result.referredBy).toBeNull();
    expect(result.orcid).toBe('0000-0002-1825-0097');
  });

  it('defaults marketing consent to false and allows the optional fields to be absent', () => {
    const minimal = { ...valid, marketingConsent: undefined, title: undefined, orcid: undefined, linkedinUrl: undefined };
    const result = expertPreRegInputSchema.parse(minimal);
    expect(result.marketingConsent).toBe(false);
    expect(result.title).toBeNull();
    expect(result.orcid).toBeNull();
    expect(result.linkedinUrl).toBeNull();
  });

  it('refuses a missing required field with the code required', () => {
    expect(codeOf({ ...valid, fullName: undefined }, 'fullName')).toBe('required');
    expect(codeOf({ ...valid, expertiseAreas: [] }, 'expertiseAreas')).toBe('required');
  });

  it('refuses a name that is too short or too long', () => {
    expect(codeOf({ ...valid, fullName: 'A' }, 'fullName')).toBe('too_short');
    expect(codeOf({ ...valid, fullName: 'x'.repeat(121) }, 'fullName')).toBe('too_long');
  });

  it('refuses a malformed email', () => {
    expect(codeOf({ ...valid, email: 'not-an-email' }, 'email')).toBe('invalid_email');
  });

  it('refuses a slug that is not in the closed list', () => {
    expect(codeOf({ ...valid, province: '99' }, 'province')).toBe('unknown_slug');
    expect(codeOf({ ...valid, expertiseAreas: ['astrology'] }, 'expertiseAreas')).toBe('unknown_slug');
    expect(codeOf({ ...valid, roles: ['boss'] }, 'roles')).toBe('unknown_slug');
    expect(codeOf({ ...valid, programmes: ['nope'] }, 'programmes')).toBe('unknown_slug');
    expect(codeOf({ ...valid, languages: ['xx'] }, 'languages')).toBe('unknown_slug');
  });

  it('refuses too many expertise areas', () => {
    const tooMany = EXPERTISE_AREAS.slice(0, 9);
    expect(codeOf({ ...valid, expertiseAreas: tooMany }, 'expertiseAreas')).toBe('too_many');
  });

  it('refuses an ORCID with a wrong check digit or shape', () => {
    expect(codeOf({ ...valid, orcid: '0000-0002-1825-0098' }, 'orcid')).toBe('invalid_orcid');
    expect(codeOf({ ...valid, orcid: '0000-0002-1825' }, 'orcid')).toBe('invalid_orcid');
  });

  it('refuses a LinkedIn URL that is not https on linkedin.com', () => {
    expect(codeOf({ ...valid, linkedinUrl: 'http://www.linkedin.com/in/x' }, 'linkedinUrl')).toBe('invalid_url');
    expect(codeOf({ ...valid, linkedinUrl: 'https://evil.example/linkedin.com' }, 'linkedinUrl')).toBe('invalid_url');
  });

  it('refuses a submission without both consents as consent_required', () => {
    expect(codeOf({ ...valid, kvkkAccepted: false }, 'kvkkAccepted')).toBe('consent_required');
    expect(codeOf({ ...valid, visibilityConsent: undefined }, 'visibilityConsent')).toBe('consent_required');
  });
});

describe('isValidOrcid', () => {
  it('accepts the ORCID documentation example and rejects a broken check digit', () => {
    expect(isValidOrcid('0000-0002-1825-0097')).toBe(true);
    expect(isValidOrcid('0000-0001-5000-0007')).toBe(true);
    expect(isValidOrcid('0000-0000-0000-001X')).toBe(true);
    expect(isValidOrcid('0000-0001-5000-0009')).toBe(false);
  });
});

describe('isLinkedInUrl', () => {
  it('accepts linkedin.com and its subdomains over https only', () => {
    expect(isLinkedInUrl('https://linkedin.com/in/a')).toBe(true);
    expect(isLinkedInUrl('https://tr.linkedin.com/in/a')).toBe(true);
    expect(isLinkedInUrl('https://notlinkedin.com/in/a')).toBe(false);
    expect(isLinkedInUrl('ftp://linkedin.com/in/a')).toBe(false);
  });
});

describe('province list', () => {
  it('has 81 unique plate codes whose names are the 81 readiness provinces', () => {
    expect(PROVINCES).toHaveLength(81);
    expect(new Set(PROVINCES.map((p) => p.value)).size).toBe(81);
    expect(PROVINCES.map((p) => p.name).sort()).toEqual([...TR_PROVINCES].sort());
  });
});
