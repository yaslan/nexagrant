import { describe, test, expect, vi } from 'vitest';
import { evaluateGate } from '../src/lib/gates/evaluate';
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
  const findUnique = vi.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(OPPORTUNITIES[where.id] ?? null),
  );
  return {
    prisma: {
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
        findUnique: vi.fn(({ where }: { where: { tenantId_topicId: { topicId: string } } }) =>
          Promise.resolve({ fitScore: where.tenantId_topicId.topicId === 'topic-high' ? 95 : 20 }),
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
    },
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
