import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isPlaceholderEmail, parseBetaRoster } from '@/lib/beta/roster';

const HEADER =
  'slug,orgName,country,orgType,contactName,contactEmail,locale,timezone,segment,notes\n';

describe('parseBetaRoster', () => {
  it('parses a row and normalises case', () => {
    const [row] = parseBetaRoster(
      HEADER + 'acme,Acme BV,nl,sme,Jane Doe,Jane@Example.Invalid,EN,Europe/Brussels,sme,note\n'
    );
    expect(row).toMatchObject({
      slug: 'acme',
      country: 'NL',
      orgType: 'SME',
      contactEmail: 'jane@example.invalid',
      locale: 'en',
    });
  });

  it('ignores comment lines', () => {
    expect(parseBetaRoster('# a note\n' + HEADER + 'acme,Acme,NL,SME,J,j@a.invalid,en,,,\n')).toHaveLength(1);
  });

  it('rejects a duplicate slug', () => {
    const csv =
      HEADER +
      'acme,Acme,NL,SME,J,a@a.invalid,en,,,\n' +
      'acme,Acme 2,NL,SME,K,b@a.invalid,en,,,\n';
    expect(() => parseBetaRoster(csv)).toThrow(/duplicate slug/);
  });

  it('rejects a non-kebab-case slug', () => {
    expect(() => parseBetaRoster(HEADER + 'Acme_Co,Acme,NL,SME,J,a@a.invalid,en,,,\n')).toThrow(
      /kebab-case/
    );
  });

  it('rejects an unknown org type', () => {
    expect(() => parseBetaRoster(HEADER + 'acme,Acme,NL,STARTUP,J,a@a.invalid,en,,,\n')).toThrow(
      /not a known OrgType/
    );
  });

  it('rejects an unsupported locale', () => {
    expect(() => parseBetaRoster(HEADER + 'acme,Acme,NL,SME,J,a@a.invalid,de,,,\n')).toThrow(
      /locale must be/
    );
  });

  it('rejects a malformed email', () => {
    expect(() => parseBetaRoster(HEADER + 'acme,Acme,NL,SME,J,not-an-email,en,,,\n')).toThrow(
      /is not an email address/
    );
  });

  it('rejects a missing required column value', () => {
    expect(() => parseBetaRoster(HEADER + 'acme,,NL,SME,J,a@a.invalid,en,,,\n')).toThrow(
      /"orgName" is required/
    );
  });
});

describe('isPlaceholderEmail', () => {
  it('flags reserved domains', () => {
    expect(isPlaceholderEmail('a@example.invalid')).toBe(true);
    expect(isPlaceholderEmail('a@foo.test')).toBe(true);
    expect(isPlaceholderEmail('a@example.com')).toBe(true);
  });

  it('passes a real domain', () => {
    expect(isPlaceholderEmail('a@fabrika.dev')).toBe(false);
    expect(isPlaceholderEmail('a@invalid-corp.nl')).toBe(false);
  });
});

describe('the shipped roster', () => {
  const csv = fs.readFileSync(
    path.join(process.cwd(), 'docs/BETA_DATA/beta-partners.csv'),
    'utf8'
  );
  const partners = parseBetaRoster(csv);

  it('holds exactly ten design partners', () => {
    expect(partners).toHaveLength(10);
  });

  it('covers both locales so the tr and en invite are both exercised', () => {
    expect(partners.some((p) => p.locale === 'tr')).toBe(true);
    expect(partners.some((p) => p.locale === 'en')).toBe(true);
  });

  it('is still entirely placeholder, so --send stays blocked', () => {
    // Flips to false once real partners are entered; that is the intended signal.
    expect(partners.every((p) => isPlaceholderEmail(p.contactEmail))).toBe(true);
  });
});
