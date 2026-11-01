import { describe, expect, it } from 'vitest';

import { evidenceBadge, isVerifiedStatus } from '../src/lib/evidence-status';
import { calculateEvidenceHealthScore } from '../src/lib/evidence-health';

/**
 * TASK-MTRH86RCGVEGC — a document nothing has verified must never be shown as verified.
 *
 * The evidence list used to compute its badge from `validUntil` alone: anything that
 * had not expired got the green tick, so `status: 'UNVERIFIED'` was displayed as
 * verified and valid. `Evidence.status` is the real verification column, and these
 * tests pin it to that column rather than to a date.
 */

const NOW = new Date('2026-09-07T12:00:00Z');
const IN_A_YEAR = new Date('2027-09-07T12:00:00Z');
const IN_TEN_DAYS = new Date('2026-09-17T12:00:00Z');
const LAST_YEAR = new Date('2025-09-07T12:00:00Z');

describe('evidenceBadge — verification', () => {
  it('does not print a valid badge for an unverified document', () => {
    // The regression: a long expiry date is not evidence that anyone checked the file.
    expect(evidenceBadge({ status: 'UNVERIFIED', validUntil: IN_A_YEAR }, NOW)).toEqual({
      kind: 'UNVERIFIED',
    });
  });

  it('does not print a valid badge for a document with no expiry and no verification', () => {
    expect(evidenceBadge({ status: 'UNVERIFIED', validUntil: null }, NOW)).toEqual({
      kind: 'UNVERIFIED',
    });
  });

  it('treats a missing status as unverified, not as verified', () => {
    // "We do not know" must fall to the safe side.
    expect(evidenceBadge({}, NOW)).toEqual({ kind: 'UNVERIFIED' });
    expect(evidenceBadge({ status: null }, NOW)).toEqual({ kind: 'UNVERIFIED' });
    expect(evidenceBadge({ status: '' }, NOW)).toEqual({ kind: 'UNVERIFIED' });
  });

  it('treats an unrecognised status as unverified', () => {
    expect(evidenceBadge({ status: 'PROBABLY_FINE' }, NOW)).toEqual({ kind: 'UNVERIFIED' });
  });

  it('reports a refusal as a refusal rather than as unverified', () => {
    expect(evidenceBadge({ status: 'REJECTED', validUntil: IN_A_YEAR }, NOW)).toEqual({
      kind: 'REJECTED',
    });
  });

  it('prints the valid badge only for a verified document', () => {
    expect(evidenceBadge({ status: 'VALID', validUntil: IN_A_YEAR }, NOW)).toEqual({
      kind: 'VALID',
    });
  });

  it('warns about a verified document that is about to expire', () => {
    expect(evidenceBadge({ status: 'VALID', validUntil: IN_TEN_DAYS }, NOW)).toEqual({
      kind: 'EXPIRING_SOON',
      daysLeft: 10,
    });
  });

  it('does not offer the expiry warning as a substitute for verification', () => {
    // An unverified document close to its expiry stays unverified: "10 days left"
    // would imply the certificate behind it had been accepted.
    expect(evidenceBadge({ status: 'UNVERIFIED', validUntil: IN_TEN_DAYS }, NOW)).toEqual({
      kind: 'UNVERIFIED',
    });
  });

  it('reports expiry even for an unverified document', () => {
    // Expiry is a fact carried by the date column, so it outranks verification state.
    expect(evidenceBadge({ status: 'UNVERIFIED', validUntil: LAST_YEAR }, NOW)).toEqual({
      kind: 'EXPIRED',
    });
  });

  it('ignores an unparseable expiry date instead of treating it as expired', () => {
    expect(evidenceBadge({ status: 'VALID', validUntil: 'not-a-date' }, NOW)).toEqual({
      kind: 'VALID',
    });
  });
});

describe('isVerifiedStatus', () => {
  it('accepts only the states that mean verification passed', () => {
    expect(isVerifiedStatus('VALID')).toBe(true);
    expect(isVerifiedStatus('EXPIRING_SOON')).toBe(true);

    expect(isVerifiedStatus('UNVERIFIED')).toBe(false);
    expect(isVerifiedStatus('REJECTED')).toBe(false);
    expect(isVerifiedStatus('EXPIRED')).toBe(false);
    expect(isVerifiedStatus(undefined)).toBe(false);
    expect(isVerifiedStatus(null)).toBe(false);
  });
});

describe('calculateEvidenceHealthScore — verification', () => {
  it('does not count an unverified document towards the valid total', () => {
    // The readiness figure on the evidence page ("1 Geçerli Belge", "60/100") is shown
    // to the user, so it may not be built out of documents nobody has checked.
    const result = calculateEvidenceHealthScore([
      { id: 'a', status: 'UNVERIFIED', validUntil: null },
    ]);

    expect(result.validCount).toBe(0);
  });

  it('counts a verified document towards the valid total', () => {
    const result = calculateEvidenceHealthScore([
      { id: 'a', status: 'VALID', validUntil: null },
    ]);

    expect(result.validCount).toBe(1);
  });

  it('scores a library of unverified documents below the same library once verified', () => {
    const items = [
      { id: 'a', category: 'CAT-01', validUntil: null },
      { id: 'b', category: 'CAT-02', validUntil: null },
    ];

    const unverified = calculateEvidenceHealthScore(
      items.map((i) => ({ ...i, status: 'UNVERIFIED' })),
    );
    const verified = calculateEvidenceHealthScore(
      items.map((i) => ({ ...i, status: 'VALID' })),
    );

    expect(unverified.score).toBeLessThan(verified.score);
  });
});
