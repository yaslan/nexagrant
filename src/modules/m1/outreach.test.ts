import { describe, expect, it } from 'vitest';

import {
  PARTNER_SEARCH_BASE_URLS,
  PARTNER_SEARCH_SOURCES,
  buildMailto,
  buildPartnerSearchLinks,
  fillTemplate,
  sanitizeQueryText,
} from './outreach';

const byId = (links: ReturnType<typeof buildPartnerSearchLinks>) =>
  Object.fromEntries(links.map((l) => [l.id, l]));

describe('buildPartnerSearchLinks', () => {
  const links = byId(
    buildPartnerSearchLinks({
      orgName: 'Fraunhofer Gesellschaft & Co',
      country: 'DE',
      topic: { code: 'HORIZON-CL5-2024-D3-01-05', title: 'Hydrogen valleys' },
    }),
  );

  it('has no LinkedIn deep link in any source, URL or search text (spec D2 l.14)', () => {
    const list = buildPartnerSearchLinks({ orgName: 'Acme', country: 'DE', topic: { code: 'X1', title: 'T' } });
    expect(list.map((l) => l.id)).not.toContain('linkedin');
    expect(PARTNER_SEARCH_SOURCES).not.toContain('linkedin');
    expect(Object.keys(PARTNER_SEARCH_BASE_URLS)).not.toContain('linkedin');
    for (const link of list) expect(`${link.url} ${link.searchText}`.toLowerCase()).not.toContain('linkedin');
  });

  it('returns all four sources in the declared order', () => {
    const list = buildPartnerSearchLinks({ orgName: 'X' });
    expect(list.map((l) => l.id)).toEqual([...PARTNER_SEARCH_SOURCES]);
  });

  it('pre-fills F&T Portal with the encoded organisation name', () => {
    expect(links.ft!.url).toBe(
      `${PARTNER_SEARCH_BASE_URLS.ft}?keywords=Fraunhofer%20Gesellschaft%20%26%20Co`,
    );
    expect(links.ft!.prefilled).toBe(true);
  });

  it('filters Ideal-ist by topic code and needs no copy text then', () => {
    expect(links.idealist!.url).toBe(
      `${PARTNER_SEARCH_BASE_URLS.idealist}?topic_id=HORIZON-CL5-2024-D3-01-05`,
    );
    expect(links.idealist!.prefilled).toBe(true);
    expect(links.idealist!.searchText).toBe('');
  });

  it('gives EEN and GREENET their plain page plus topic + English country name to copy', () => {
    expect(links.een!.url).toBe(PARTNER_SEARCH_BASE_URLS.een);
    expect(links.greenet!.url).toBe(PARTNER_SEARCH_BASE_URLS.greenet);
    expect(links.een!.prefilled).toBe(false);
    expect(links.een!.searchText).toBe('Hydrogen valleys Germany');
    expect(links.greenet!.searchText).toBe('Hydrogen valleys Germany');
  });

  it('encodes non-ASCII names (Turkish characters) as UTF-8', () => {
    const [ft] = buildPartnerSearchLinks({ orgName: 'Türkiye Bilimsel Ölçüm' });
    expect(ft!.url.endsWith('?keywords=T%C3%BCrkiye%20Bilimsel%20%C3%96l%C3%A7%C3%BCm')).toBe(true);
  });

  it('falls back to bare search pages when there is no topic', () => {
    const l = byId(buildPartnerSearchLinks({ orgName: 'Acme', country: null, topic: null }));
    expect(l.idealist!.url).toBe(PARTNER_SEARCH_BASE_URLS.idealist);
    expect(l.idealist!.prefilled).toBe(false);
    expect(l.een!.searchText).toBe('');
  });

  it('ignores a malformed country code', () => {
    const l = byId(buildPartnerSearchLinks({ orgName: 'Acme', country: 'Germany', topic: { code: 'X1' } }));
    expect(l.een!.searchText).toBe('X1');
  });

  it('never puts personal data (e-mail, phone) into any URL', () => {
    const list = buildPartnerSearchLinks({
      orgName: 'Acme Ltd jane.doe@acme.example +90 532 123 45 67',
      country: 'TR',
      topic: { code: 'HORIZON-CL4 info@x.org', title: 'Robots call 0212-555-1234' },
    });
    for (const link of list) {
      const decoded = decodeURIComponent(link.url) + ' ' + link.searchText;
      expect(decoded).not.toMatch(/@/);
      expect(decoded).not.toMatch(/532|555/);
      expect(link.url.startsWith('https://')).toBe(true);
    }
    expect(byId(list).ft!.url).toBe(`${PARTNER_SEARCH_BASE_URLS.ft}?keywords=Acme%20Ltd`);
  });
});

describe('sanitizeQueryText', () => {
  it('keeps topic codes intact', () => {
    expect(sanitizeQueryText('HORIZON-CL5-2024-D3-01-05')).toBe('HORIZON-CL5-2024-D3-01-05');
    // A long digit run glued to a code is part of the code, not a phone number.
    expect(sanitizeQueryText('HORIZON-MSCA-2021-101072345')).toBe('HORIZON-MSCA-2021-101072345');
  });
  it('caps length at 200 characters', () => {
    expect(sanitizeQueryText('a'.repeat(500))).toHaveLength(200);
  });
  it('returns empty for null/undefined', () => {
    expect(sanitizeQueryText(null)).toBe('');
    expect(sanitizeQueryText(undefined)).toBe('');
  });
});

describe('fillTemplate', () => {
  const tpl = 'Dear {institution}, re {callCode} / {projectTitle}. {institution}';
  it('fills every occurrence', () => {
    expect(fillTemplate(tpl, { institution: 'KTH', callCode: 'C-1', projectTitle: 'P' })).toBe(
      'Dear KTH, re C-1 / P. KTH',
    );
  });
  it('leaves the placeholder visible when a value is empty', () => {
    expect(fillTemplate(tpl, { institution: 'KTH', callCode: '  ', projectTitle: '' })).toBe(
      'Dear KTH, re {callCode} / {projectTitle}. KTH',
    );
  });
});

describe('buildMailto', () => {
  it('has an empty recipient and RFC 6068 encoding', () => {
    const url = buildMailto('Hi & bye', 'Line 1\nLine 2');
    expect(url).toBe('mailto:?subject=Hi%20%26%20bye&body=Line%201%0D%0ALine%202');
  });
});
