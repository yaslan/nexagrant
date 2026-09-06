import { describe, test, expect, vi } from 'vitest';
import { generateAiEvaluation, calibrateESR } from '../../src/modules/m6/server/actions';

vi.mock('../../src/lib/db', () => ({
  prisma: {
    creditLedger: {
      create: vi.fn().mockResolvedValue({ id: 'ledger-1' })
    },
    evaluation: {
      create: vi.fn().mockResolvedValue({
        id: 'ev-1',
        tenantId: 'tenant-1',
        opportunityId: 'opp-1',
        readerType: 'AI',
        excellence: 4.5,
        impact: 4.2,
        implementation: 3.8,
        weaknesses: { strengths: ['Good TRL'], weaknesses: ['Risk matrix lacking'] }
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'ev-1',
        excellence: 4.5,
        impact: 4.0,
        implementation: 4.0
      }),
      update: vi.fn().mockResolvedValue({
        id: 'ev-1',
        calibration: -0.5
      })
    }
  }
}));

vi.mock('../../src/lib/ai/llm', () => ({
  generateText: vi.fn().mockResolvedValue(JSON.stringify({
    excellence: 4.5,
    impact: 4.2,
    implementation: 3.8,
    strengths: ['Clear TRL roadmap'],
    weaknesses: ['Risk mitigation matrix lacks specific contingency measures'],
    recommendations: ['Detail quantifiable KPIs']
  }))
}));

describe('M6 Evaluator Lens Module', () => {
  test('generateAiEvaluation produces structured EU evaluation with 3 criteria', async () => {
    const result = await generateAiEvaluation('opp-1', 'tenant-1', 'user-1');
    expect(result.excellence).toBe(4.5);
    expect(result.impact).toBe(4.2);
    expect(result.implementation).toBe(3.8);
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });

  test('calibrateESR computes score variance between predicted total and actual ESR', async () => {
    const result = await calibrateESR('ev-1', 13.0);
    // Predicted total = 4.5 + 4.0 + 4.0 = 12.5. Actual = 13.0. Variance = 12.5 - 13.0 = -0.5
    expect(result.calibration).toBe(-0.5);
  });
});
