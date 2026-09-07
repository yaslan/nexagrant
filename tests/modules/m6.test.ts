import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateAiEvaluation,
  calibrateESR,
  saveEvaluation,
  saveHumanEvaluation,
} from '../../src/modules/m6/server/actions';

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

  class ModuleAccessError extends Error {
    readonly code = 'MODULE_ACCESS_DENIED';
    constructor(readonly moduleId: string, readonly status: string, readonly reason: string) {
      super(`Module ${moduleId} is not available (${status}/${reason}).`);
      this.name = 'ModuleAccessError';
    }
  }

  return {
    scope,
    TenantScopeError,
    ModuleAccessError,
    state: { currentScope: scope as typeof scope | null, moduleOpen: true },
    opportunityFindFirst: vi.fn(),
    creditLedgerCreate: vi.fn(),
    evaluationCreate: vi.fn(),
    evaluationFindFirst: vi.fn(),
    evaluationUpdate: vi.fn(),
    scoreUpsert: vi.fn(),
    scoreFindMany: vi.fn(),
    reviewerUpdate: vi.fn(),
    reviewerCount: vi.fn(),
    generateText: vi.fn(),
  };
});

/**
 * The module gate. `assertModuleAccess` is the first statement of every action in this
 * file, and importing it for real pulls in next-auth (which does not resolve under the
 * vitest node environment) — so it is replaced here, with `moduleOpen` steering it, and
 * the closed case is asserted below.
 */
vi.mock('../../src/lib/modules/access', () => ({
  ModuleAccessError: h.ModuleAccessError,
  assertModuleAccess: vi.fn(async (moduleId: string) => {
    if (!h.state.moduleOpen) throw new h.ModuleAccessError(moduleId, 'OFF', 'MODULE_OFF');
  }),
}));

vi.mock('../../src/lib/tenant', () => ({
  TenantScopeError: h.TenantScopeError,
  requireTenantAction: vi.fn(async () => {
    if (!h.state.currentScope) throw new h.TenantScopeError();
    return h.state.currentScope;
  }),
}));

vi.mock('../../src/lib/db', () => ({
  prisma: {},
  // The fake client is built inline below; `as never` hands it to a callback
  // typed against the real TenantTx without widening either side to `any`.
  withTenant: vi.fn(async <T,>(_tenantId: string, cb: (t: never) => Promise<T>) =>
    cb({
      opportunity: { findFirst: h.opportunityFindFirst },
      creditLedger: { create: h.creditLedgerCreate },
      evaluation: {
        create: h.evaluationCreate,
        findFirst: h.evaluationFindFirst,
        update: h.evaluationUpdate,
      },
      score: { upsert: h.scoreUpsert, findMany: h.scoreFindMany },
      reviewer: { update: h.reviewerUpdate, count: h.reviewerCount },
    } as never)
  ),
}));

vi.mock('../../src/lib/ai/llm', () => ({ generateText: h.generateText }));

const AI_JSON = JSON.stringify({
  excellence: 4.5,
  impact: 4.2,
  implementation: 3.8,
  strengths: ['Clear TRL roadmap'],
  weaknesses: ['Risk mitigation matrix lacks specific contingency measures'],
  recommendations: ['Detail quantifiable KPIs'],
});

describe('M6 Evaluator Lens Module', () => {
  beforeEach(() => {
    h.state.currentScope = h.scope;
    h.state.moduleOpen = true;
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
    h.generateText.mockResolvedValue(AI_JSON);
    h.scoreUpsert.mockResolvedValue({ id: 'sc-1' });
    h.scoreFindMany.mockResolvedValue([]);
    h.reviewerUpdate.mockResolvedValue({ id: 'rv-1' });
    h.reviewerCount.mockResolvedValue(0);
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

    // Previously this resolved normally and only logged, so the caller could not tell a
    // no-op from a recorded evaluation. It now rejects, and still writes nothing.
    await expect(generateAiEvaluation('opp-from-other-tenant')).rejects.toThrow(/not found/i);

    expect(h.creditLedgerCreate).not.toHaveBeenCalled();
    expect(h.evaluationCreate).not.toHaveBeenCalled();
  });

  test('generateAiEvaluation records nothing when the model returns unusable output', async () => {
    // The action used to fall back to a literal {4.2, 4.0, 3.8} and persist it as if the
    // model had produced it. A fabricated score must never reach the database (CLAUDE.md §7).
    h.generateText.mockResolvedValue('I am not JSON.');

    await expect(generateAiEvaluation('opp-1')).rejects.toThrow(/valid JSON/i);

    expect(h.evaluationCreate).not.toHaveBeenCalled();
    expect(h.creditLedgerCreate).not.toHaveBeenCalled();
  });

  test('generateAiEvaluation rejects an out-of-range score from the model', async () => {
    h.generateText.mockResolvedValue(
      JSON.stringify({ excellence: 9, impact: 4, implementation: 4, strengths: [], weaknesses: [], recommendations: [] }),
    );

    await expect(generateAiEvaluation('opp-1')).rejects.toThrow();
    expect(h.evaluationCreate).not.toHaveBeenCalled();
  });

  test('calibrateESR computes score variance between predicted total and actual ESR', async () => {
    const result = await calibrateESR('ev-1', 13.0);
    // Predicted total = 4.5 + 4.0 + 4.0 = 12.5. Actual = 13.0. Variance = 12.5 - 13.0 = -0.5
    expect(result.calibration).toBe(-0.5);
    expect(h.evaluationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ev-1', tenantId: 'tenant-1' } }),
    );
  });

  test('calibrateESR leaves another tenant\'s evaluation untouched', async () => {
    h.evaluationFindFirst.mockResolvedValue(null);

    // `{ calibration: 0 }` was indistinguishable from a real, perfectly-calibrated
    // result. Refusing loudly is the only honest answer to a row we cannot see.
    await expect(calibrateESR('ev-from-other-tenant', 13.0)).rejects.toThrow(/not found/i);

    expect(h.evaluationUpdate).not.toHaveBeenCalled();
  });

  test('calibrateESR rejects an ESR total outside the 0-15 panel range', async () => {
    await expect(calibrateESR('ev-1', 42)).rejects.toThrow();
    expect(h.evaluationUpdate).not.toHaveBeenCalled();
  });

  test('saveHumanEvaluation rejects a criterion score above the REA maximum', async () => {
    await expect(
      saveHumanEvaluation({ opportunityId: 'opp-1', excellence: 7, impact: 4, implementation: 4 }),
    ).rejects.toThrow();

    expect(h.evaluationCreate).not.toHaveBeenCalled();
  });

  test('saveEvaluation writes the marks against the signed-in reviewer, not the first seat', async () => {
    // The old code always used `evaluation.reviewers[0]`, so the second reviewer to
    // submit overwrote the first reviewer's marks under the first reviewer's id.
    h.evaluationFindFirst
      .mockResolvedValueOnce({
        id: 'ev-panel',
        reviewers: [
          { id: 'rv-other', userId: 'someone-else', status: 'completed' },
          { id: 'rv-mine', userId: 'user-1', status: 'pending' },
        ],
        criteria: [{ id: 'crit-innovation', name: 'Innovation', weight: 0.3 }],
      })
      .mockResolvedValueOnce({ avgScore: 4 });

    h.scoreFindMany.mockResolvedValue([
      {
        score: 4,
        reviewer: { id: 'rv-mine' },
        criterion: { id: 'crit-innovation', name: 'Innovation', weight: 0.3 },
      },
    ]);

    const result = await saveEvaluation({
      evaluationId: 'ev-panel',
      proposalId: 'prop-1',
      scores: { Innovation: 4 },
    });

    expect(result.avgScore).toBe(4);
    expect(h.scoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reviewerId_criterionId: { reviewerId: 'rv-mine', criterionId: 'crit-innovation' } },
      }),
    );
    expect(h.reviewerUpdate).toHaveBeenCalledWith({
      where: { id: 'rv-mine' },
      data: { status: 'completed' },
    });
  });

  test('saveEvaluation refuses a user who is not seated on the evaluation', async () => {
    h.evaluationFindFirst.mockResolvedValueOnce({
      id: 'ev-panel',
      reviewers: [{ id: 'rv-other', userId: 'someone-else', status: 'pending' }],
      criteria: [{ id: 'crit-innovation', name: 'Innovation', weight: 0.3 }],
    });

    await expect(
      saveEvaluation({ evaluationId: 'ev-panel', proposalId: 'prop-1', scores: { Innovation: 4 } }),
    ).rejects.toThrow(/not seated/i);

    expect(h.scoreUpsert).not.toHaveBeenCalled();
  });

  test('saveEvaluation rejects a mark outside the 1-5 scale before touching the database', async () => {
    await expect(
      saveEvaluation({ evaluationId: 'ev-panel', proposalId: 'prop-1', scores: { Innovation: 9 } }),
    ).rejects.toThrow();

    expect(h.evaluationFindFirst).not.toHaveBeenCalled();
    expect(h.scoreUpsert).not.toHaveBeenCalled();
  });

  /**
   * The gate that TASK-MTQW8188AWOAT added. `generateAiEvaluation` costs 3 credits;
   * the refusal has to land before `generateText`, which itself writes AiUsageLog and
   * debits the ledger as soon as it is called.
   */
  test('a closed module refuses the AI reader before any credit is spent', async () => {
    h.state.moduleOpen = false;

    await expect(generateAiEvaluation('opp-1')).rejects.toThrow(/Module M6 is not available/);

    expect(h.generateText).not.toHaveBeenCalled();
    expect(h.creditLedgerCreate).not.toHaveBeenCalled();
    expect(h.evaluationCreate).not.toHaveBeenCalled();
  });
});
