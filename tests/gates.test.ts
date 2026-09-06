import { describe, test, expect, vi } from 'vitest';
import { evaluateGate } from '../src/lib/gates/evaluate';

vi.mock('../src/lib/db', () => ({
  prisma: {
    opportunity: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id === 'opp-pass') {
          return Promise.resolve({
            id: 'opp-pass',
            tenantId: 'tenant-1',
            title: 'Sample Opportunity',
            stage: 'G0',
            status: 'ACTIVE',
            intendedRole: 'coordinator',
            g0Score: 85,
            seats: [{ id: 'seat-1', status: 'CONFIRMED' }],
            proposal: null,
            evaluations: [{ excellence: 4.5, impact: 4.5, implementation: 4.0 }]
          });
        }
        if (where.id === 'opp-fail') {
          return Promise.resolve({
            id: 'opp-fail',
            tenantId: 'tenant-1',
            title: 'Low Score Opportunity',
            stage: 'G0',
            status: 'ACTIVE',
            intendedRole: 'coordinator',
            g0Score: 45, // Below minScore 70
            seats: [{ id: 'seat-1', status: 'OPEN' }],
            proposal: null,
            evaluations: [{ excellence: 2.0, impact: 3.0, implementation: 2.5 }]
          });
        }
        if (where.id === 'opp-unscored') {
          return Promise.resolve({
            id: 'opp-unscored',
            tenantId: 'tenant-1',
            title: 'Never scored',
            stage: 'G0',
            status: 'ACTIVE',
            intendedRole: 'partner',
            g0Score: null,
            seats: [],
            proposal: null,
            evaluations: []
          });
        }
        return Promise.resolve(null);
      }),
      update: vi.fn().mockResolvedValue({})
    },
    gateDecision: {
      create: vi.fn().mockResolvedValue({ id: 'decision-1' })
    }
  }
}));

describe('Gate Evaluation Engine (M5)', () => {
  test('G0 gate passes when score >= 70', async () => {
    const result = await evaluateGate('opp-pass', 'G0', 'tenant-1');
    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  test('G0 gate fails when score < 70', async () => {
    const result = await evaluateGate('opp-fail', 'G0', 'tenant-1');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('below minimum threshold');
  });

  test('G0 gate says so when the opportunity has never been scored', async () => {
    // Regression: the old fallback scored an unscored opportunity on a 0-10 scale and compared it
    // against a 0-100 threshold, reporting "7.5 is below 70" — a number nobody had computed.
    const result = await evaluateGate('opp-unscored', 'G0', 'tenant-1');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('has not been calculated');
  });

  test('G2 gate fails when seats are still OPEN', async () => {
    const result = await evaluateGate('opp-fail', 'G2', 'tenant-1');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('Consortium lock failed');
  });
});
