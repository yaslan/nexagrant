import { describe, test, expect, vi } from 'vitest';
import {
  calculateCriterionAverage,
  calculateEvaluationScore,
  getScoreDistribution,
} from '../../../src/modules/m6/server/scoring';
import type { TenantTx } from '../../../src/lib/db';
import {
  compareM6ToESR,
  validateScoreRange,
  checkNoDuplicateScore,
  validateReviewerAccess,
  validateEvaluationTenant,
} from '../../../src/modules/m6/server/comparison';

describe('M6 Scoring Engine & ESR Comparison', () => {
  test('Criterion average: [5, 4, 3] -> 4.0', async () => {
    const mockDb = {
      score: {
        findMany: vi.fn().mockResolvedValue([
          { score: 5 },
          { score: 4 },
          { score: 3 },
        ]),
      },
    } as unknown as TenantTx;

    const avg = await calculateCriterionAverage(mockDb, 'crit-1', 'tenant-a');
    expect(avg).toBe(4.0);
    expect(mockDb.score.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { criterionId: 'crit-1', reviewer: { tenantId: 'tenant-a' }, submittedAt: { not: null } },
      })
    );
  });

  test('Weighted evaluation score: criterion weights correctly applied', async () => {
    // Criterion A (weight 0.6): scores 5, 5 -> avg 5.0
    // Criterion B (weight 0.4): scores 3, 3 -> avg 3.0
    // Weighted avg = (5.0 * 0.6 + 3.0 * 0.4) / (0.6 + 0.4) = (3.0 + 1.2) / 1.0 = 4.2
    const mockDb = {
      score: {
        findMany: vi.fn().mockResolvedValue([
          {
            score: 5,
            reviewer: { id: 'rev-1' },
            criterion: { id: 'crit-a', name: 'Excellence', weight: 0.6 },
          },
          {
            score: 5,
            reviewer: { id: 'rev-2' },
            criterion: { id: 'crit-a', name: 'Excellence', weight: 0.6 },
          },
          {
            score: 3,
            reviewer: { id: 'rev-1' },
            criterion: { id: 'crit-b', name: 'Impact', weight: 0.4 },
          },
          {
            score: 3,
            reviewer: { id: 'rev-2' },
            criterion: { id: 'crit-b', name: 'Impact', weight: 0.4 },
          },
        ]),
      },
    } as unknown as TenantTx;

    const score = await calculateEvaluationScore(mockDb, 'eval-1', 'tenant-a');
    expect(score).toBe(4.2);
  });

  test('Score distribution: returns { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 } format', async () => {
    const mockDb = {
      score: {
        findMany: vi.fn().mockResolvedValue([
          { score: 5 },
          { score: 5 },
          { score: 4 },
        ]),
      },
    } as unknown as TenantTx;

    const dist = await getScoreDistribution(mockDb, 'crit-1', 'tenant-a');
    expect(dist).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
  });

  test('ESR comparison: delta calculated correctly (ESR - M6)', async () => {
    // Evaluation avgScore = 4.0, ESR total = 13.5 out of 15 (which maps onto panel scale 4.6)
    const mockDb = {
      evaluation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'eval-1',
          tenantId: 'tenant-a',
          avgScore: 4.0,
          proposal: { esrScores: { total: 13.5 } },
          reviewers: [{ id: 'rev-1', userId: 'user-1', status: 'completed' }],
        }),
      },
    } as unknown as TenantTx;

    const result = await compareM6ToESR(mockDb, 'eval-1', 'tenant-a');
    expect(result.m6Score).toBe(4.0);
    expect(result.esrScore).toBe(4.6);
    expect(result.delta).toBe(0.6);
    expect(result.agreement).toBe(false); // delta 0.6 > 0.5 threshold
  });

  test('ESR comparison: warning issued when M6 > ESR (agreement is false)', async () => {
    // M6 panel score = 4.8, ESR score = 3.5. M6 overrated proposal -> agreement warning
    const mockDb = {
      evaluation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'eval-2',
          tenantId: 'tenant-a',
          avgScore: 4.8,
          proposal: { esrScores: { total: 9.375 } }, // total 9.375 out of 15 -> panel scale 3.5
          reviewers: [{ id: 'rev-1', userId: 'user-1', status: 'completed' }],
        }),
      },
    } as unknown as TenantTx;

    const result = await compareM6ToESR(mockDb, 'eval-2', 'tenant-a');
    expect(result.m6Score).toBe(4.8);
    expect(result.esrScore).toBe(3.5);
    expect(result.delta).toBe(-1.3);
    expect(result.agreement).toBe(false); // M6 > ESR triggers warning (agreement = false)
  });

  test('Tenant isolation: tenant A reviewer cannot access tenant B evaluation', async () => {
    const mockDb = {
      evaluation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'eval-b',
          tenantId: 'tenant-b',
          proposal: { esrScores: { total: 12 } },
          reviewers: [],
        }),
      },
      reviewer: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as TenantTx;

    // Comparing evaluation for tenant-a should fail because evaluation belongs to tenant-b
    await expect(compareM6ToESR(mockDb, 'eval-b', 'tenant-a')).rejects.toThrow(
      /not found or access denied/i
    );

    const isTenantValid = await validateEvaluationTenant(mockDb, 'eval-b', 'tenant-a');
    expect(isTenantValid).toBe(false);
  });

  test('Reviewer access: unseated reviewer access is rejected', async () => {
    const mockDb = {
      reviewer: {
        findFirst: vi.fn().mockResolvedValue(null), // User is not in reviewer table
      },
    } as unknown as TenantTx;

    const hasAccess = await validateReviewerAccess(mockDb, 'eval-1', 'unseated-user', 'tenant-a');
    expect(hasAccess).toBe(false);
    expect(mockDb.reviewer.findFirst).toHaveBeenCalledWith({
      where: { evaluationId: 'eval-1', userId: 'unseated-user', tenantId: 'tenant-a' },
    });
  });

  test('Duplicate score prevention: checkNoDuplicateScore returns false when score exists', async () => {
    const mockDb = {
      score: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-score-id' }),
      },
    } as unknown as TenantTx;

    const canSubmit = await checkNoDuplicateScore(mockDb, 'rev-1', 'crit-1');
    expect(canSubmit).toBe(false); // Duplicate score detected, submission blocked
  });

  test('Score range validation: validateScoreRange enforces strict 1-5 integer scale', () => {
    expect(validateScoreRange(1)).toBe(true);
    expect(validateScoreRange(3)).toBe(true);
    expect(validateScoreRange(5)).toBe(true);

    expect(validateScoreRange(0)).toBe(false);
    expect(validateScoreRange(6)).toBe(false);
    expect(validateScoreRange(-1)).toBe(false);
    expect(validateScoreRange(3.5)).toBe(false); // must be integer
  });
});
