import { describe, expect, test } from 'vitest';
import type { OppStatus } from '@prisma/client';

import {
  WithdrawalInputSchema,
  reactivateOpportunity,
  reactivationRefusal,
  reactivationTarget,
  withdrawOpportunity,
  withdrawalRefusal,
} from '@/lib/k5-pipeline/withdrawal';
import { ProjectIdeaInputSchema } from '@/lib/project-ideas/records';

/**
 * NG-38 — the parts of the withdrawal and the project idea that need no database: the reason
 * is required, and which statuses can be withdrawn. The write itself is in
 * tests/decision-log.live.test.ts.
 */

describe('withdrawal reason', () => {
  test.each([
    ['missing', {}],
    ['empty', { reason: '' }],
    ['blank', { reason: '   \n\t ' }],
    ['null', { reason: null }],
  ])('a %s reason is refused', (_label, input) => {
    expect(WithdrawalInputSchema.safeParse(input).success).toBe(false);
  });

  test('a reason is trimmed and kept', () => {
    expect(WithdrawalInputSchema.parse({ reason: '  Bütçe yetmiyor  ' })).toEqual({ reason: 'Bütçe yetmiyor' });
  });

  test('a reason longer than 2000 characters is refused', () => {
    expect(WithdrawalInputSchema.safeParse({ reason: 'a'.repeat(2001) }).success).toBe(false);
    expect(WithdrawalInputSchema.safeParse({ reason: 'a'.repeat(2000) }).success).toBe(true);
  });

  test('no other field passes', () => {
    expect(WithdrawalInputSchema.safeParse({ reason: 'x', status: 'FUNDED' }).success).toBe(false);
  });
});

describe('which statuses can be withdrawn', () => {
  const cases: [OppStatus, ReturnType<typeof withdrawalRefusal>][] = [
    ['ACTIVE', null],
    ['SUBMITTED', null],
    ['WITHDRAWN', 'ALREADY_WITHDRAWN'],
    ['FUNDED', 'ALREADY_DECIDED'],
    ['REJECTED', 'ALREADY_DECIDED'],
    ['ABOVE_THRESHOLD', 'ALREADY_DECIDED'],
  ];
  test.each(cases)('%s → %s', (status, expected) => {
    expect(withdrawalRefusal(status)).toBe(expected);
  });
});

describe('project idea input', () => {
  const ok = { title: 'Akıllı sulama', trl: 4, targetPrograms: ['HORIZON-CL6'], keywords: ['su'] };

  test('a full idea passes, text trimmed, lists de-duplicated', () => {
    expect(
      ProjectIdeaInputSchema.parse({ ...ok, title: ' Akıllı sulama ', keywords: ['su', 'su', ' tarım '] }),
    ).toMatchObject({ title: 'Akıllı sulama', keywords: ['su', 'tarım'], summary: null });
  });

  test.each([0, 10, 3.5, null])('TRL %s is refused (1-9, whole number)', (trl) => {
    expect(ProjectIdeaInputSchema.safeParse({ ...ok, trl }).success).toBe(false);
  });

  test('a blank title is refused', () => {
    expect(ProjectIdeaInputSchema.safeParse({ ...ok, title: '  ' }).success).toBe(false);
  });

  test('status is not set through the input', () => {
    expect(ProjectIdeaInputSchema.safeParse({ ...ok, status: 'APPLIED' }).success).toBe(false);
  });
});

describe('withdrawal opportunity id', () => {
  // A server action's id can arrive as undefined, null or "": Prisma would drop it from the
  // `where` and the conditional update would cover the whole tenant. It is refused before
  // any query (no database here, so a query would fail the test).
  const scope = { tenantId: 't-1', userId: 'u-1', role: 'TENANT_OWNER' };
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['blank', '  '],
  ])('an %s id answers NOT_FOUND without a query', async (_label, id) => {
    await expect(
      withdrawOpportunity(scope, id as unknown as string, { reason: 'Ortak bulunamadı' }),
    ).resolves.toEqual({ refused: 'NOT_FOUND' });
  });
});

/**
 * NG-241 — reactivating a withdrawn opportunity (K-584158 = A). The write is in
 * tests/decision-log.live.test.ts; here the rules that need no database.
 */
describe('which statuses can be reactivated', () => {
  const cases: [OppStatus, ReturnType<typeof reactivationRefusal>][] = [
    ['WITHDRAWN', null],
    ['ACTIVE', 'NOT_WITHDRAWN'],
    ['SUBMITTED', 'NOT_WITHDRAWN'],
    ['FUNDED', 'NOT_WITHDRAWN'],
    ['REJECTED', 'NOT_WITHDRAWN'],
    ['ABOVE_THRESHOLD', 'NOT_WITHDRAWN'],
  ];
  test.each(cases)('%s → %s', (status, expected) => {
    expect(reactivationRefusal(status)).toBe(expected);
  });
});

describe('where a reactivation returns to', () => {
  // The status the withdrawal left. Only the two withdrawable ones are real answers; anything
  // else (no record from before NG-241, or a value that cannot have been withdrawn) is ACTIVE:
  // SUBMITTED claims a submission the record does not show.
  const cases: [OppStatus | null, OppStatus][] = [
    ['ACTIVE', 'ACTIVE'],
    ['SUBMITTED', 'SUBMITTED'],
    [null, 'ACTIVE'],
    ['FUNDED', 'ACTIVE'],
    ['WITHDRAWN', 'ACTIVE'],
  ];
  test.each(cases)('withdrawn from %s → %s', (from, expected) => {
    expect(reactivationTarget(from)).toBe(expected);
  });
});

describe('reactivation input, refused before any query', () => {
  // No database here: a query would fail the test, so each of these must answer first.
  const base = { tenantId: 't-1', userId: 'u-1', role: 'TENANT_OWNER', opportunityId: 'o-1' };
  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '  \n\t '],
    ['null', null],
    ['too long', 'a'.repeat(2001)],
  ])('a %s reason answers REASON_REQUIRED', async (_label, reason) => {
    await expect(reactivateOpportunity({ ...base, reason: reason as unknown as string })).resolves.toEqual({
      refused: 'REASON_REQUIRED',
    });
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['blank', '  '],
  ])('an %s id answers NOT_FOUND', async (_label, id) => {
    await expect(
      reactivateOpportunity({ ...base, opportunityId: id as unknown as string, reason: 'Ortak bulundu' }),
    ).resolves.toEqual({ refused: 'NOT_FOUND' });
  });
});
