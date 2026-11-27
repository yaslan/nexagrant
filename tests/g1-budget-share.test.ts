import { describe, expect, test } from 'vitest';
import { g1SeatsWithoutAgreedShare, type G1BudgetShare, type G1Seat } from '../src/lib/gates/g1-consortium';
import { DEFAULT_GATE_RULES } from '../src/lib/scoring/defaults';

/**
 * NG-33: the pure half of the G1 budget-share condition (spec §12 G1). The gate wiring is covered in
 * tests/gates.test.ts; these cases fix which seats the rule looks at and what counts as agreed.
 */

const seat = (id: string, over: Partial<G1Seat> = {}): G1Seat => ({
  id,
  roleKey: 'research',
  required: true,
  status: 'CONFIRMED',
  organizationId: `org-${id}`,
  partnerOrgId: null,
  memberStage: 'CONFIRMED',
  loiReceivedAt: null,
  ...over,
});

const agreed = (seatId: string): G1BudgetShare => ({ seatId, agreedAt: new Date('2026-11-01T00:00:00.000Z') });
const proposed = (seatId: string): G1BudgetShare => ({ seatId, agreedAt: null });

describe('g1SeatsWithoutAgreedShare', () => {
  test('a seated critical member with an agreed share is not listed', () => {
    expect(g1SeatsWithoutAgreedShare([seat('a')], [agreed('a')])).toEqual([]);
  });

  test('a seated critical member with no share row is listed', () => {
    expect(g1SeatsWithoutAgreedShare([seat('a')], []).map((s) => s.id)).toEqual(['a']);
  });

  test('a share that is only proposed (agreedAt null) does not count', () => {
    expect(g1SeatsWithoutAgreedShare([seat('a')], [proposed('a')]).map((s) => s.id)).toEqual(['a']);
  });

  test("another seat's agreed share does not count for this seat", () => {
    expect(g1SeatsWithoutAgreedShare([seat('a')], [agreed('b')]).map((s) => s.id)).toEqual(['a']);
  });

  test('a seat that names nobody is not listed: it is already unfilled', () => {
    expect(g1SeatsWithoutAgreedShare([seat('a', { organizationId: null, status: 'OPEN' })], [])).toEqual([]);
  });

  test('an optional (not required) seat is not listed', () => {
    expect(g1SeatsWithoutAgreedShare([seat('a', { required: false })], [])).toEqual([]);
  });

  test('a tenant-private partner on the seat counts as a member', () => {
    expect(
      g1SeatsWithoutAgreedShare([seat('a', { organizationId: null, partnerOrgId: 'partner-a' })], []).map((s) => s.id),
    ).toEqual(['a']);
  });

  test('mixed: only the seats without an agreed share are listed, in order', () => {
    const seats = [seat('a'), seat('b'), seat('c'), seat('d', { required: false })];
    expect(g1SeatsWithoutAgreedShare(seats, [agreed('a'), proposed('b')]).map((s) => s.id)).toEqual(['b', 'c']);
  });
});

describe('the budget-share rule default', () => {
  test('ships off', () => {
    expect(DEFAULT_GATE_RULES.G1.requireAgreedBudgetShareForCriticalSeats).toBe(false);
  });
});
