import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateAiEvaluation, calibrateESR } from '../../src/modules/m6/server/actions';

/**
 * `tenantId`/`userId` are no longer arguments — the actions read them from the
 * session — so the scope is stubbed here. `@/lib/tenant` is replaced outright
 * rather than partially mocked: importing it for real pulls in next-auth,
 * which does not resolve under the vitest node environment.
 */
const h = vi.hoisted(() => {
  const scope = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'TENANT_OWNER',
    workspaceIds: [] as string[],
    isPlatformAdmin: false,
  };

  class TenantScopeError extends Error {
    readonly code = 'TENANT_SCOPE_REQUIRED';
    constructor() {
      super('Request has no tenant scope; refusing to query tenant data.');
      this.name = 'TenantScopeError';
    }
  }

  return {
    scope,
    TenantScopeError,
    state: { currentScope: scope as typeof scope | null },
    opportunityFindFirst: vi.fn(),
    creditLedgerCreate: vi.fn(),
    evaluationCreate: vi.fn(),
    evaluationFindFirst: vi.fn(),
    evaluationUpdate: vi.fn(),
  };
});

vi.mock('../../src/lib/tenant', () => ({
  TenantScopeError: h.TenantScopeError,
  requireTenantAction: vi.fn(async () => {
    if (!h.state.currentScope) throw new h.TenantScopeError();
    return h.state.currentScope;
  }),
}));

vi.mock('../../src/lib/db', () => ({
  prisma: {},
  withTenant: vi.fn(async (_tenantId: string, cb: (t: any) => Promise<any>) =>
    cb({
      opportunity: { findFirst: h.opportunityFindFirst },
      creditLedger: { create: h.creditLedgerCreate },
      evaluation: {
        create: h.evaluationCreate,
        findFirst: h.evaluationFindFirst,
        update: h.evaluationUpdate,
      },
    })
  ),
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
  beforeEach(() => {
    h.state.currentScope = h.scope;
    vi.clearAllMocks();
    h.opportunityFindFirst.mockResolvedValue({ id: 'opp-1' });
    h.creditLedgerCreate.mockResolvedValue({ id: 'ledger-1' });
    h.evaluationCreate.mockResolvedValue({
      id: 'ev-1',
      tenantId: 'tenant-1',
      opportunityId: 'opp-1',
      readerType: 'AI',
      excellence: 4.5,
      impact: 4.2,
      implementation: 3.8,
      weaknesses: { strengths: ['Good TRL'], weaknesses: ['Risk matrix lacking'] }
    });
    h.evaluationFindFirst.mockResolvedValue({
      id: 'ev-1',
      excellence: 4.5,
      impact: 4.0,
      implementation: 4.0
    });
    h.evaluationUpdate.mockResolvedValue({ id: 'ev-1', calibration: -0.5 });
  });

  test('generateAiEvaluation produces structured EU evaluation with 3 criteria', async () => {
    const result = await generateAiEvaluation('opp-1');
    expect(result.excellence).toBe(4.5);
    expect(result.impact).toBe(4.2);
    expect(result.implementation).toBe(3.8);
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });

  test('generateAiEvaluation charges credits to the session tenant only', async () => {
    await generateAiEvaluation('opp-1');

    expect(h.opportunityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'opp-1', tenantId: 'tenant-1' } })
    );
    expect(h.creditLedgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1' }) })
    );
  });

  test('generateAiEvaluation writes nothing for an opportunity outside the tenant', async () => {
    h.opportunityFindFirst.mockResolvedValue(null);

    await generateAiEvaluation('opp-from-other-tenant');

    expect(h.creditLedgerCreate).not.toHaveBeenCalled();
    expect(h.evaluationCreate).not.toHaveBeenCalled();
  });

  test('calibrateESR computes score variance between predicted total and actual ESR', async () => {
    const result = await calibrateESR('ev-1', 13.0);
    // Predicted total = 4.5 + 4.0 + 4.0 = 12.5. Actual = 13.0. Variance = 12.5 - 13.0 = -0.5
    expect(result.calibration).toBe(-0.5);
    expect(h.evaluationFindFirst).toHaveBeenCalledWith({
      where: { id: 'ev-1', tenantId: 'tenant-1' },
    });
  });

  test('calibrateESR leaves another tenant\'s evaluation untouched', async () => {
    h.evaluationFindFirst.mockResolvedValue(null);

    const result = await calibrateESR('ev-from-other-tenant', 13.0);

    expect(result.calibration).toBe(0);
    expect(h.evaluationUpdate).not.toHaveBeenCalled();
  });
});
