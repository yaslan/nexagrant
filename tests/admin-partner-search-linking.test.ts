import { describe, test, expect } from 'vitest';
import { announcementsOfUnmatched, parsePic } from '@/app/[locale]/admin/partner-search/linking';

describe('parsePic', () => {
  test('keeps digits and drops pasted spaces and dashes', () => {
    expect(parsePic('999999999')).toBe('999999999');
    expect(parsePic(' 999 999-999 ')).toBe('999999999');
  });

  test('rejects letters, empty and out-of-range lengths', () => {
    expect(parsePic('')).toBeNull();
    expect(parsePic('PIC999999999')).toBeNull();
    expect(parsePic('1234')).toBeNull();
    expect(parsePic('1234567890123')).toBeNull();
  });
});

describe('announcementsOfUnmatched', () => {
  const rows = [
    { id: 'a', organizationName: 'ACME Research GmbH', country: 'DE' },
    { id: 'b', organizationName: 'acme  research gmbh', country: 'DE' },
    { id: 'c', organizationName: 'ACME Research GmbH', country: 'AT' },
    { id: 'd', organizationName: 'Other Org', country: 'DE' },
  ];

  test('matches on the same name + country key the ingestor uses', () => {
    const ids = announcementsOfUnmatched({ name: 'ACME Research GmbH', country: 'DE' }, rows).map((r) => r.id);
    expect(ids).toContain('a');
    expect(ids).not.toContain('c');
    expect(ids).not.toContain('d');
  });

  test('an organisation without a usable key links nothing', () => {
    expect(announcementsOfUnmatched({ name: '', country: null }, rows)).toEqual([]);
  });
});
