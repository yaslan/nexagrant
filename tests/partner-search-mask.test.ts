import { describe, expect, it } from 'vitest';
import { EMAIL_MASK, PHONE_MASK, maskContact } from '@/modules/m1/server/partner-search/mask';

describe('maskContact (FO-65 F3)', () => {
  it.each([
    ['write to jane.doe@example-org.eu for details', `write to ${EMAIL_MASK} for details`],
    ['mailto: a+b@uni.ac.be', `mailto: ${EMAIL_MASK}`],
    ['call +32 2 123 45 67 today', `call ${PHONE_MASK} today`],
    ['tel 0032 471 23 45 67', `tel ${PHONE_MASK}`],
    ['phone: 070-123-4567 (office)', `phone: ${PHONE_MASK} (office)`],
  ])('masks contact details: %j', (input, expected) => {
    expect(maskContact(input)).toBe(expected);
  });

  // PR #163 review probe set (crw2-fb B1 + Ö1): every row of the reviewer's table plus
  // the GA / " at " / (dot) / [dot] forms. Contact details masked, the rest unchanged.
  it.each([
    // B1 — leaked before
    ['Tel. 030 / 1234567', `Tel. ${PHONE_MASK}`],
    ['Tel: 02/123.45.67', `Tel: ${PHONE_MASK}`],
    ['call 12 34 56 78 (DK)', `call ${PHONE_MASK} (DK)`],
    ['jane.doe(at)uni-x.de', EMAIL_MASK],
    ['jane.doe [at] uni-x.de', EMAIL_MASK],
    ['müller@uni-x.de', EMAIL_MASK],
    ['jane.doe at uni-x.de', EMAIL_MASK],
    ['jane(dot)doe(at)uni-x(dot)de', EMAIL_MASK],
    ['jane.doe[at]uni-x[dot]de', EMAIL_MASK],
    ['Kontakt: m.mueller(at)tu-x.de, Tel. 030 / 1234567', `Kontakt: ${EMAIL_MASK}, Tel. ${PHONE_MASK}`],
    // masked before, still masked
    ['phone +32 (0)2 123 45 67', `phone ${PHONE_MASK}`],
    ['tel +45 12 34 56 78', `tel ${PHONE_MASK}`],
    ['mob. +49 151 2345 6789', `mob. ${PHONE_MASK}`],
    ['tel +44 20 7946 0958 ext. 12', `tel ${PHONE_MASK} ext. 12`],
    // Ö1 — false positives before, unchanged now
    ['deadline 2026-10-23 17:00 Brussels', 'deadline 2026-10-23 17:00 Brussels'],
    ['deadline 23.10.2026 17:00:00', 'deadline 23.10.2026 17:00:00'],
    ['our PIC 999999999', 'our PIC 999999999'],
    ['grant agreement 101057321', 'grant agreement 101057321'],
    ['GA 101057321', 'GA 101057321'],
    ['budget 125 000 000 EUR', 'budget 125 000 000 EUR'],
    ['years 2026 2027 2028', 'years 2026 2027 2028'],
    ['ISBN 978-3-16-148410-0', 'ISBN 978-3-16-148410-0'],
    // unchanged before, unchanged now
    ['opening 2026-05-12 and deadline 2026-09-16', 'opening 2026-05-12 and deadline 2026-09-16'],
    ['HORIZON-CL5-2024-D3-01-02', 'HORIZON-CL5-2024-D3-01-02'],
    ['EUR 2.500.000,00', 'EUR 2.500.000,00'],
    ['TRL 4-6, 24-36 months', 'TRL 4-6, 24-36 months'],
  ])('review probe: %j', (input, expected) => {
    expect(maskContact(input)).toBe(expected);
  });

  it('leaves dates, amounts and short numbers alone', () => {
    const text = 'deadline 2026-10-23, budget 500000 EUR, 3 partners, call HORIZON-CL4-2027-01';
    expect(maskContact(text)).toBe(text);
  });

  it('passes null through', () => {
    expect(maskContact(null)).toBeNull();
  });

  it('is idempotent: masking twice changes nothing', () => {
    const once = maskContact('x@y.org, jane(at)uni.de and 030 / 1234567');
    expect(maskContact(once)).toBe(once);
  });
});
