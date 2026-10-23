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

  it('leaves dates, amounts and short numbers alone', () => {
    const text = 'deadline 2026-10-23, budget 500000 EUR, 3 partners, call HORIZON-CL4-2027-01';
    expect(maskContact(text)).toBe(text);
  });

  it('passes null through', () => {
    expect(maskContact(null)).toBeNull();
  });

  it('is idempotent: masking twice changes nothing', () => {
    const once = maskContact('x@y.org and +32 2 123 45 67');
    expect(maskContact(once)).toBe(once);
  });
});
