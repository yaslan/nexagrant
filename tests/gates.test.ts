import { describe, test, expect, vi, beforeEach } from 'vitest';
import { evaluateGate, GateOpportunityNotFoundError } from '../src/lib/gates/evaluate';
import { prisma } from '../src/lib/db';

/**
 * G0 gate fixtures.
 *
 * These tests used to hand `evaluateGate` an opportunity with a `g0Score` already in the column and
 * check that the gate compared it against 70. That is the bug this suite now guards against:
 * nothing ever computed that column — it came from a seed literal or from
 * `Math.random() * 15 + 80` — so the gate was deciding on an invented number. The gate now derives
 * the score from stored evidence, and the fixtures below deliberately carry a *stale* `g0Score`
 * that disagrees with the evidence, so a regression that starts trusting the column again fails.
 *
 *   opp-pass  → stored 12, evidence scores 93 → passes
 *   opp-fail  → stored 99, evidence scores 31 → fails
 *   opp-unscored → tenant with nothing on file, no topic → no score at all
 */

const TOPIC_HIGH = {
  id: 'topic-high',
  identifier: 'HORIZON-CL5-2026-09-D4-01',
  keywords: ['hydrogen'],
  isLumpSum: true,
  isTwoStage: true,
  budgetPerProjectCents: 5_000_000_00,
  eligibility: null,
};

const TOPIC_LOW = {
  id: 'topic-low',
  identifier: 'HORIZON-CL6-2026-01-D1-01',
  keywords: ['textiles'],
  isLumpSum: false,
  isTwoStage: false,
  budgetPerProjectCents: null,
  eligibility: null,
};

const OPPORTUNITIES: Record<string, Record<string, unknown>> = {
  'opp-pass': {
    id: 'opp-pass',
    tenantId: 'tenant-1',
    topicId: 'topic-high',
    title: 'Sample Opportunity',
    stage: 'G0',
    status: 'ACTIVE',
    intendedRole: 'coordinator',
    g0Score: 12, // stale on purpose — the gate must recompute
    seats: [{ id: 'seat-1', status: 'CONFIRMED' }],
    proposal: null,
    evaluations: [{ excellence: 4.5, impact: 4.5, implementation: 4.0 }],
  },
  'opp-fail': {
    id: 'opp-fail',
    tenantId: 'tenant-1',
    topicId: 'topic-low',
    title: 'Low Score Opportunity',
    stage: 'G0',
    status: 'ACTIVE',
    intendedRole: 'partner',
    g0Score: 99, // stale on purpose
    seats: [{ id: 'seat-1', status: 'OPEN' }],
    proposal: null,
    evaluations: [{ excellence: 2.0, impact: 3.0, implementation: 2.5 }],
  },
  'opp-unscored': {
    id: 'opp-unscored',
    tenantId: 'tenant-2',
    topicId: null,
    title: 'Never scored',
    stage: 'G0',
    status: 'ACTIVE',
    intendedRole: 'partner',
    g0Score: null,
    seats: [],
    proposal: null,
    evaluations: [],
  },
};

const TENANTS: Record<string, { country: string | null; pic: string | null; settings: unknown }> = {
  // A tenant with a CORDIS record: three coordinations in the HORIZON-CL5-2026-09-D4 family and
  // 25 distinct collaborators.
  'tenant-1': { country: 'DE', pic: 'PIC-1', settings: {} },
  // A tenant with nothing on file at all.
  'tenant-2': { country: null, pic: null, settings: {} },
};

vi.mock('../src/lib/db', () => {
  // `findUnique` is kept on the mock deliberately, with NO tenant clause honoured, so that a
  // regression which goes back to `findUnique({ where: { id } })` reads another tenant's row here
  // exactly as it would in production — and the cross-tenant tests below fail instead of passing
  // on a mock that is safer than the database.
  const findUnique = vi.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(OPPORTUNITIES[where.id] ?? null),
  );
  const prisma = {
      opportunity: {
        findUnique,
        findFirst: vi.fn(({ where }: { where: { id: string; tenantId: string } }) => {
          const opp = OPPORTUNITIES[where.id];
          return Promise.resolve(opp && opp.tenantId === where.tenantId ? opp : null);
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tenant: {
        findUnique: vi.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(TENANTS[where.id] ?? null),
        ),
      },
      tenantProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      topic: {
        findUnique: vi.fn(({ where }: { where: { id?: string; identifier?: string } }) => {
          const rows = [TOPIC_HIGH, TOPIC_LOW];
          const hit = where.id
            ? rows.find((t) => t.id === where.id)
            : rows.find((t) => t.identifier === where.identifier);
          return Promise.resolve(hit ?? null);
        }),
      },
      topicMatch: {
        // The K1 alignment row is the one with no opportunity on it; the loader reads it with
        // findFirst because Prisma cannot put `null` in a compound-unique where.
        findFirst: vi.fn(({ where }: { where: { topicId: string } }) =>
          Promise.resolve({ fitScore: where.topicId === 'topic-high' ? 95 : 20 }),
        ),
        upsert: vi.fn().mockResolvedValue({}),
      },
      topicStat: {
        findMany: vi.fn(({ where }: { where: { OR: { topicId?: string }[] } }) =>
          Promise.resolve(
            where.OR.some((c) => c.topicId === 'topic-high')
              ? [{ country: null, successRate: 16, topicId: 'topic-high' }]
              : [],
          ),
        ),
      },
      cordisParticipation: {
        findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          if ('projectId' in where) {
            return Promise.resolve(Array.from({ length: 25 }, (_, i) => ({ organisationId: `org-${i}` })));
          }
          return Promise.resolve(
            Array.from({ length: 3 }, (_, i) => ({
              role: 'coordinator',
              projectId: `p${i}`,
              project: { masterCall: 'HORIZON-CL5-2026-09-D4' },
            })),
          );
        }),
      },
      consortiumSeat: {
        findMany: vi.fn(({ where }: { where: { opportunityId: string } }) =>
          Promise.resolve(
            where.opportunityId === 'opp-pass'
              ? [
                  { roleKey: 'research', status: 'CONFIRMED' },
                  { roleKey: 'end_user', status: 'CONFIRMED' },
                ]
              : [],
          ),
        ),
      },
      gateDecision: { create: vi.fn().mockResolvedValue({ id: 'decision-1' }) },
  };
  return {
    prisma,
    // The engine now runs inside the tenant's RLS context; the mock just hands the callback the
    // same client, so the per-statement `tenantId` clauses are what the tests actually measure.
    withTenant: vi.fn((_tenantId: string, cb: (tx: unknown) => unknown) => cb(prisma)),
  };
});

describe('Gate Evaluation Engine (M5)', () => {
  test('G0 gate passes when the evidence scores >= 70', async () => {
    const result = await evaluateGate('opp-pass', 'G0', 'tenant-1');
    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  test('G0 gate fails when the evidence scores < 70', async () => {
    const result = await evaluateGate('opp-fail', 'G0', 'tenant-1');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('below minimum threshold');
  });

  test('G0 gate ignores a stale g0Score column and uses the computed score', async () => {
    // Regression for the core defect: `opp-pass` carries a stored 12 (would fail) and `opp-fail` a
    // stored 99 (would pass). Both decisions must come out the other way round.
    const pass = await evaluateGate('opp-pass', 'G0', 'tenant-1');
    const fail = await evaluateGate('opp-fail', 'G0', 'tenant-1');
    expect(pass.passed).toBe(true);
    expect(fail.passed).toBe(false);

    const createCalls = vi.mocked(prisma.gateDecision.create).mock.calls as {
      data: { inputs: Record<string, unknown> };
    }[][];
    const decisions = createCalls.map((call) => call[0]!.data.inputs);
    const passInputs = decisions.find((i: Record<string, unknown>) => i.opportunityId === 'opp-pass')!;
    expect(passInputs.calculatedG0Score).toBe(93);
    expect(passInputs.g0Score).toBe(12); // the stale column, recorded but not used
  });

  test('G0 gate writes the score breakdown into the decision record', async () => {
    await evaluateGate('opp-pass', 'G0', 'tenant-1');
    const calls = vi.mocked(prisma.gateDecision.create).mock.calls as {
      data: { inputs: Record<string, unknown> };
    }[][];
    const last = calls[calls.length - 1]![0]!;
    const evidence = last.data.inputs.g0Evidence as Record<string, unknown>;
    expect(evidence).toBeTruthy();
    expect(evidence.contributions).toBeTruthy();
    expect(Array.isArray(evidence.sources)).toBe(true);
    expect(evidence.assessment).toBe('internal-pre-assessment');
  });

  test('G0 gate persists the computed score instead of leaving the invented one', async () => {
    await evaluateGate('opp-pass', 'G0', 'tenant-1');
    expect(prisma.opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: 'opp-pass', tenantId: 'tenant-1' },
      data: { g0Score: 93 },
    });
  });

  test('G0 gate says so when there is no evidence to score the opportunity on', async () => {
    // Not a failure on merit: a tenant with no profile, no PIC and an opportunity with no topic has
    // nothing to be assessed against, and the gate must say that rather than report a number.
    const result = await evaluateGate('opp-unscored', 'G0', 'tenant-2');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('no scoring evidence');
  });

  test('G2 gate fails when seats are still OPEN', async () => {
    const result = await evaluateGate('opp-fail', 'G2', 'tenant-1');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('Consortium lock failed');
  });
});

/**
 * Cross-tenant isolation (CLAUDE.md §1).
 *
 * The engine used to read the opportunity with `findUnique({ where: { id } })` — no tenant clause —
 * and then write the `GateDecision` and the stage update under whatever `tenantId` it was handed.
 * Nothing in the engine stopped tenant B from evaluating, filing a decision on and *advancing the
 * stage of* tenant A's opportunity; the only thing that did was the one caller remembering to check
 * ownership first. `opp-pass` belongs to `tenant-1`, so every call below uses `tenant-2`'s id.
 */
describe('Gate Evaluation Engine — tenant isolation', () => {
  beforeEach(() => {
    vi.mocked(prisma.gateDecision.create).mockClear();
    vi.mocked(prisma.opportunity.updateMany).mockClear();
  });

  test('refuses an opportunity id belonging to another tenant', async () => {
    await expect(evaluateGate('opp-pass', 'G0', 'tenant-2')).rejects.toBeInstanceOf(
      GateOpportunityNotFoundError,
    );
  });

  test('the refusal is an error, never a silent null or a zero score', async () => {
    // A `{ passed: false }` here would read as "assessed and rejected" on screen, which is a
    // different and untrue statement from "not yours to assess".
    const outcome = await evaluateGate('opp-pass', 'G0', 'tenant-2').then(
      (r) => ({ kind: 'resolved' as const, r }),
      (e: unknown) => ({ kind: 'rejected' as const, e }),
    );
    expect(outcome.kind).toBe('rejected');
  });

  test('files no GateDecision and moves no stage on a cross-tenant call', async () => {
    await evaluateGate('opp-pass', 'G0', 'tenant-2').catch(() => {});
    expect(prisma.gateDecision.create).not.toHaveBeenCalled();
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
  });

  test('the error does not disclose that the id exists under another tenant', async () => {
    const err = await evaluateGate('opp-pass', 'G0', 'tenant-2').catch((e: Error) => e);
    const missing = await evaluateGate('no-such-opportunity', 'G0', 'tenant-2').catch(
      (e: Error) => e,
    );
    expect((err as Error).message.replace('opp-pass', 'X')).toBe(
      (missing as Error).message.replace('no-such-opportunity', 'X'),
    );
  });

  test('the passing stage update is tenant-scoped, not update-by-id', async () => {
    await evaluateGate('opp-pass', 'G0', 'tenant-1');
    expect(prisma.opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: 'opp-pass', tenantId: 'tenant-1' },
      data: { stage: 'G0' },
    });
    // `update` by bare id is the shape that could move another tenant's row.
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });
});

/**
 * G3 — evaluation-score gate. CLAUDE.md ("her kapı kuralı ... için birim test zorunlu")
 * asks for a unit test per gate rule and G3 had none.
 *
 * The branch these pin is the empty `evaluations` list. G3 reads the *last* element of
 * that list; under `noUncheckedIndexedAccess` that read is `T | undefined`, and the
 * tempting one-line fix (`evaluations[len - 1]!`) would send an empty list straight into
 * `Math.min(undefined, undefined, undefined)` — NaN, which compares false against every
 * threshold and files a GateDecision reading "Criterion score NaN is below minimum".
 * A proposal nobody has evaluated would be recorded as one that was evaluated and failed.
 * The guard narrows off the element instead, so an empty list keeps taking the
 * `mockEvaluation` branch it always took.
 */
describe('Gate Evaluation Engine — G3 evaluation scores', () => {
  beforeEach(() => {
    vi.mocked(prisma.gateDecision.create).mockClear();
  });

  const lastDecisionInputs = (): Record<string, unknown> => {
    const calls = vi.mocked(prisma.gateDecision.create).mock.calls as {
      data: { inputs: Record<string, unknown> };
    }[][];
    return calls[calls.length - 1]![0]!.data.inputs;
  };

  test('passes when the latest evaluation clears both thresholds', async () => {
    // 4.5 / 4.5 / 4.0 → min 4.0 (≥ 4.0) and total 13.0 (≥ 12.0).
    const result = await evaluateGate('opp-pass', 'G3', 'tenant-1');
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    const inputs = lastDecisionInputs();
    expect(inputs.minCriterionScore).toBe(4.0);
    expect(inputs.totalScore).toBe(13.0);
  });

  test('fails and names both thresholds when the latest evaluation is short', async () => {
    // 2.0 / 3.0 / 2.5 → min 2.0 (< 4.0) and total 7.5 (< 12.0).
    const result = await evaluateGate('opp-fail', 'G3', 'tenant-1');
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('Criterion score 2'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('below minimum required 12'))).toBe(true);
  });

  test('an unevaluated opportunity is not scored at all, not scored as NaN', async () => {
    // `opp-unscored` carries `evaluations: []`. This is the case the guard covers.
    const result = await evaluateGate('opp-unscored', 'G3', 'tenant-2');

    const inputs = lastDecisionInputs();
    expect(inputs.mockEvaluation).toBe(true);
    // Nothing was measured, so no measurement is filed.
    expect(inputs.minCriterionScore).toBeUndefined();
    expect(inputs.totalScore).toBeUndefined();
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test('no gate reason ever reports a NaN score', async () => {
    // The exact string a `!` on the index read would produce.
    for (const [id, tenant] of [
      ['opp-pass', 'tenant-1'],
      ['opp-fail', 'tenant-1'],
      ['opp-unscored', 'tenant-2'],
    ] as const) {
      const result = await evaluateGate(id, 'G3', tenant);
      expect(result.reasons.join(' ')).not.toContain('NaN');
      const inputs = lastDecisionInputs();
      for (const key of ['minCriterionScore', 'totalScore'] as const) {
        if (inputs[key] !== undefined) expect(Number.isNaN(inputs[key] as number)).toBe(false);
      }
    }
  });
});
