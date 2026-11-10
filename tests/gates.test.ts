import { describe, test, expect, vi, beforeEach } from 'vitest';
import { evaluateGate, GateOpportunityNotFoundError } from '../src/lib/gates/evaluate';
import { prisma } from '../src/lib/db';
import { clearStoredG0, computeG0FromSnapshot } from '../src/lib/scoring/g0-compute';

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
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    seats: [],
    proposal: null,
    evaluations: [],
  },
  // NG-59 item 3: no evidence today, but a number left in the column by an earlier run (or a seed).
  'opp-stale-unscored': {
    id: 'opp-stale-unscored',
    tenantId: 'tenant-2',
    topicId: null,
    title: 'Scored once, no evidence now',
    stage: 'G0',
    status: 'ACTIVE',
    intendedRole: 'coordinator',
    g0Score: 63,
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    seats: [],
    proposal: null,
    evaluations: [],
  },
};

/**
 * G1 fixtures. `opp-g1-ready` fills both critical roles and has a backup for each; every other
 * fixture breaks exactly one thing about it, so a failure names the condition that caught it.
 */
const SEATED = 'org-seated';
/**
 * A G0 decision per G1 fixture: the fixtures below measure the seat conditions, so all of them have
 * passed G0. The `opp-g1-g0-*` ones and `opp-g1-no-g0` break this condition instead.
 */
type G0DecisionRow = { id: string; tenantId: string; opportunityId: string; passed: boolean; decidedAt: number; deletedAt: Date | null };
const g0Row = (opportunityId: string, passed: boolean, decidedAt = 1, over: Partial<G0DecisionRow> = {}): G0DecisionRow => ({
  id: `${opportunityId}-${decidedAt}`,
  tenantId: 'tenant-1',
  opportunityId,
  passed,
  decidedAt,
  deletedAt: null,
  ...over,
});
const G0_DECISIONS: G0DecisionRow[] = [
  ...[
    'opp-g1-ready',
    'opp-g1-no-seats',
    'opp-g1-no-required',
    'opp-g1-open',
    'opp-g1-invited',
    'opp-g1-nobody',
    'opp-g1-no-backup',
    'opp-g1-only-occupant',
    'opp-g1-foreign-backup',
    'opp-g1-optional-open',
    'opp-g1-two-faults',
  ].map((id) => g0Row(id, true)),
  g0Row('opp-g1-g0-failed', false),
  g0Row('opp-g1-g0-pass-then-fail', true, 1),
  g0Row('opp-g1-g0-pass-then-fail', false, 2),
  g0Row('opp-g1-g0-fail-then-pass', false, 1),
  g0Row('opp-g1-g0-fail-then-pass', true, 2),
  g0Row('opp-g1-g0-erased-pass', true, 1, { deletedAt: new Date(0) }),
  g0Row('opp-g1-g0-foreign-pass', true, 1, { tenantId: 'tenant-2' }),
];
const seatRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  roleKey: 'research',
  required: true,
  status: 'CONFIRMED',
  organizationId: `${SEATED}-${id}`,
  partnerOrgId: null,
  ...over,
});
const g1Opportunity = (id: string, seats: unknown[], intendedRole = 'partner') => ({
  id,
  tenantId: 'tenant-1',
  topicId: null,
  title: id,
  stage: 'G0',
  status: 'ACTIVE',
  intendedRole,
  g0Score: null,
  seats,
  proposal: null,
  evaluations: [],
});
Object.assign(OPPORTUNITIES, {
  'opp-g1-ready': g1Opportunity(
    'opp-g1-ready',
    [seatRow('s-coord', { roleKey: 'coordinator' }), seatRow('s-research')],
    'coordinator',
  ),
  ...Object.fromEntries(
    [
      'opp-g1-no-g0',
      'opp-g1-g0-failed',
      'opp-g1-g0-pass-then-fail',
      'opp-g1-g0-fail-then-pass',
      'opp-g1-g0-erased-pass',
      'opp-g1-g0-foreign-pass',
    ].map((id) => [id, g1Opportunity(id, [seatRow('s-research')])]),
  ),
  'opp-g1-no-seats': g1Opportunity('opp-g1-no-seats', [], 'coordinator'),
  'opp-g1-no-required': g1Opportunity('opp-g1-no-required', [seatRow('s-optional-only', { required: false })]),
  'opp-g1-open': g1Opportunity('opp-g1-open', [seatRow('s-open', { status: 'OPEN', organizationId: null })]),
  'opp-g1-invited': g1Opportunity('opp-g1-invited', [seatRow('s-invited', { status: 'INVITED' })]),
  'opp-g1-nobody': g1Opportunity('opp-g1-nobody', [seatRow('s-nobody', { organizationId: null })]),
  'opp-g1-no-backup': g1Opportunity('opp-g1-no-backup', [seatRow('s-no-backup')]),
  'opp-g1-only-occupant': g1Opportunity('opp-g1-only-occupant', [seatRow('s-only-occupant')]),
  'opp-g1-foreign-backup': g1Opportunity('opp-g1-foreign-backup', [seatRow('s-foreign-backup')]),
  'opp-g1-optional-open': g1Opportunity('opp-g1-optional-open', [
    seatRow('s-research'),
    seatRow('s-optional-open', { required: false, status: 'OPEN', organizationId: null }),
  ]),
  'opp-g1-two-faults': g1Opportunity('opp-g1-two-faults', [
    seatRow('s-open', { status: 'OPEN', organizationId: null }),
    seatRow('s-no-backup', { roleKey: 'end_user' }),
  ]),
});

const SEAT_CANDIDATES = [
  { tenantId: 'tenant-1', seatId: 's-coord', organizationId: 'org-backup', partnerOrgId: null },
  { tenantId: 'tenant-1', seatId: 's-research', organizationId: `${SEATED}-s-research`, partnerOrgId: null },
  { tenantId: 'tenant-1', seatId: 's-research', organizationId: null, partnerOrgId: 'partner-backup' },
  { tenantId: 'tenant-1', seatId: 's-optional-only', organizationId: 'org-backup', partnerOrgId: null },
  { tenantId: 'tenant-1', seatId: 's-open', organizationId: 'org-backup', partnerOrgId: null },
  { tenantId: 'tenant-1', seatId: 's-invited', organizationId: 'org-backup', partnerOrgId: null },
  { tenantId: 'tenant-1', seatId: 's-nobody', organizationId: 'org-backup', partnerOrgId: null },
  { tenantId: 'tenant-1', seatId: 's-only-occupant', organizationId: `${SEATED}-s-only-occupant`, partnerOrgId: null },
  { tenantId: 'tenant-2', seatId: 's-foreign-backup', organizationId: 'org-backup', partnerOrgId: null },
];

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
        // CORDIS is loaded (a row exists), so "no PIC" is a measured "no record" (FO-382).
        findFirst: vi.fn(() => Promise.resolve({ projectId: 'p0' })),
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
      seatCandidate: {
        // Honours the clauses it is given, so a query that drops `tenantId` picks up the other
        // tenant's row in `SEAT_CANDIDATES` here exactly as it would on an RLS-exempt role.
        findMany: vi.fn(({ where }: { where: { tenantId?: string; seatId: { in: string[] } } }) =>
          Promise.resolve(
            SEAT_CANDIDATES.filter(
              (c) => (!where.tenantId || c.tenantId === where.tenantId) && where.seatId.in.includes(c.seatId),
            ),
          ),
        ),
      },
      gateDecision: {
        create: vi.fn().mockResolvedValue({ id: 'decision-1' }),
        // Honours the clauses it is given and picks the first row of the ordering, so a query that
        // drops `tenantId` or `deletedAt` picks up the wrong row here as it would in Postgres.
        findFirst: vi.fn(
          ({ where }: { where: { tenantId?: string; opportunityId: string; gate: string; deletedAt?: null } }) => {
            const rows = G0_DECISIONS.filter(
              (d) =>
                (!where.tenantId || d.tenantId === where.tenantId) &&
                d.opportunityId === where.opportunityId &&
                where.gate === 'G0' &&
                (where.deletedAt !== null || d.deletedAt === null),
            ).sort((a, b) => b.decidedAt - a.decidedAt);
            return Promise.resolve(rows[0] ?? null);
          },
        ),
      },
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
    // FO-382: `g0Score` now carries the score the gate used, so it cannot disagree with the
    // evidence on the same record. The stale column value is kept under `g0ScoreStored`.
    expect(passInputs.g0Score).toBe(93);
    expect(passInputs.g0ScoreStored).toBe(12);
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

  test('G0 with no evidence files a record that says so throughout: no score, the old value kept apart (NG-59)', async () => {
    vi.mocked(prisma.gateDecision.create).mockClear();
    vi.mocked(prisma.opportunity.updateMany).mockClear();
    const result = await evaluateGate('opp-stale-unscored', 'G0', 'tenant-2');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('no scoring evidence');

    const call = vi.mocked(prisma.gateDecision.create).mock.calls.at(-1) as unknown as [{ data: { inputs: Record<string, unknown> } }];
    const inputs = call[0].data.inputs;
    expect(inputs.calculatedG0Score).toBeNull();
    expect((inputs.g0Evidence as Record<string, unknown>).score).toBeNull();
    // The score the decision shows must agree with "no evidence"; the stale 63 is only the audit trail.
    expect(inputs.g0Score).toBeNull();
    expect(inputs.g0ScoreStored).toBe(63);
    // And the column is emptied, as a rescore does (FO-384), so the board stops drawing the 63.
    // A rescore is not an edit (FO-384 B1): `updatedAt` stays what it was, guarded on the value read.
    expect(prisma.opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: 'opp-stale-unscored', tenantId: 'tenant-2', updatedAt: new Date('2026-01-02T03:04:05.000Z') },
      data: { g0Score: null, updatedAt: new Date('2026-01-02T03:04:05.000Z') },
    });
  });

  test('G0 with no evidence and nothing stored writes no score at all', async () => {
    vi.mocked(prisma.opportunity.updateMany).mockClear();
    await evaluateGate('opp-unscored', 'G0', 'tenant-2');
    const call = vi.mocked(prisma.gateDecision.create).mock.calls.at(-1) as unknown as [{ data: { inputs: Record<string, unknown> } }];
    expect(call[0].data.inputs.g0Score).toBeNull();
    expect(call[0].data.inputs.g0ScoreStored).toBeNull();
    // Column already null: nothing to clear, so `@updatedAt` must not move (NG-59 review, finding 1).
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
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

describe('G1 gate: G0 has to be passed first (NG-26)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('no G0 decision: refused, filed, the stage stays, and the other faults are still reported', async () => {
    const result = await evaluateGate('opp-g1-no-g0', 'G1', 'tenant-1');

    expect(result).toEqual({
      passed: false,
      reasons: ['G0 has not been passed: no G0 decision is on file'],
      reasonDetails: [{ code: 'G1_G0_NOT_DECIDED' }],
    });
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
    expect(prisma.gateDecision.create).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['opp-g1-g0-failed', 'G1_G0_LAST_FAILED'],
    ['opp-g1-g0-pass-then-fail', 'G1_G0_LAST_FAILED'],
    ['opp-g1-g0-erased-pass', 'G1_G0_NOT_DECIDED'],
    ['opp-g1-g0-foreign-pass', 'G1_G0_NOT_DECIDED'],
  ])('%s → %s', async (id, code) => {
    const result = await evaluateGate(id, 'G1', 'tenant-1');

    expect(result.passed).toBe(false);
    expect(result.reasonDetails).toEqual([{ code }]);
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
  });

  test('failed, then passed: the latest decision counts', async () => {
    expect(await evaluateGate('opp-g1-g0-fail-then-pass', 'G1', 'tenant-1')).toEqual({ passed: true, reasons: [] });
  });

  test('the decision is read in the tenant, for this opportunity and gate, newest first, skipping erased rows', async () => {
    await evaluateGate('opp-g1-ready', 'G1', 'tenant-1');
    expect(prisma.gateDecision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', opportunityId: 'opp-g1-ready', gate: 'G0', deletedAt: null },
        orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  test('the other gates do not read it', async () => {
    await evaluateGate('opp-pass', 'G2', 'tenant-1');
    expect(prisma.gateDecision.findFirst).not.toHaveBeenCalled();
  });
});

describe('G1 gate: critical roles and their backups', () => {
  beforeEach(() => vi.clearAllMocks());

  const filed = () =>
    (prisma.gateDecision.create as unknown as { mock: { calls: [{ data: { passed: boolean; inputs: Record<string, unknown> } }][] } })
      .mock.calls[0]![0].data;

  test.each([
    ['opp-g1-no-seats', /no critical seat/i],
    ['opp-g1-no-required', /no critical seat/i],
    ['opp-g1-open', /research.*not filled.*OPEN/i],
    ['opp-g1-invited', /research.*not filled.*INVITED/i],
    ['opp-g1-nobody', /research.*not filled.*names no organisation/i],
    ['opp-g1-no-backup', /research.*no backup candidate/i],
    ['opp-g1-only-occupant', /research.*no backup candidate/i],
    ['opp-g1-foreign-backup', /research.*no backup candidate/i],
  ])('%s is refused, files the refusal and does not move the stage', async (id, reason) => {
    const result = await evaluateGate(id, 'G1', 'tenant-1');

    expect(result.passed).toBe(false);
    expect(result.reasons.join(' | ')).toMatch(reason);
    expect(filed().passed).toBe(false);
    expect(prisma.opportunity.updateMany).not.toHaveBeenCalled();
  });

  test('every fault is reported at once, not just the first', async () => {
    const result = await evaluateGate('opp-g1-two-faults', 'G1', 'tenant-1');

    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.join(' | ')).toMatch(/research.*not filled/i);
    expect(result.reasons.join(' | ')).toMatch(/end_user.*no backup candidate/i);
  });

  test('filled critical roles with a backup each pass and advance the stage', async () => {
    const result = await evaluateGate('opp-g1-ready', 'G1', 'tenant-1');

    expect(result).toEqual({ passed: true, reasons: [] });
    expect(prisma.opportunity.updateMany).toHaveBeenCalledWith({
      where: { id: 'opp-g1-ready', tenantId: 'tenant-1' },
      data: { stage: 'G1' },
    });
  });

  test('an optional seat neither blocks the gate nor stands in for a critical one', async () => {
    expect((await evaluateGate('opp-g1-optional-open', 'G1', 'tenant-1')).passed).toBe(true);
  });

  test('the checked values are filed as inputs and the coordinator check is kept', async () => {
    await evaluateGate('opp-g1-ready', 'G1', 'tenant-1');
    expect(filed().inputs).toMatchObject({
      coordinatorRoleCheck: true,
      criticalSeatsCount: 2,
      unfilledCriticalRoles: [],
      criticalRolesWithoutBackup: [],
    });

    vi.clearAllMocks();
    await evaluateGate('opp-g1-no-seats', 'G1', 'tenant-1');
    expect(filed().inputs).toMatchObject({ coordinatorRoleCheck: true, criticalSeatsCount: 0 });
  });

  test('a partner-role opportunity still does not get the coordinator marker', async () => {
    await evaluateGate('opp-g1-no-backup', 'G1', 'tenant-1');
    expect(filed().inputs).not.toHaveProperty('coordinatorRoleCheck');
  });

  test('backups are read inside the tenant', async () => {
    await evaluateGate('opp-g1-ready', 'G1', 'tenant-1');
    expect(prisma.seatCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }),
    );
  });

  test('the other gates never read candidates', async () => {
    await evaluateGate('opp-pass', 'G2', 'tenant-1');
    expect(prisma.seatCandidate.findMany).not.toHaveBeenCalled();
  });
});

/**
 * NG-59, PR #325 review finding 1 (TopicMatch half): clearing a stored G0 must not invent a
 * TopicMatch row just to hold a null. It nulls the per-opportunity row only if one exists.
 * The gate fixtures above all resolve to a score or to `topicId: null`, so the topic branch of
 * `clearStoredG0` is exercised here with a no-evidence computation that does carry a topic.
 */
describe('clearStoredG0 — TopicMatch branch (NG-59)', () => {
  const noEvidenceWithTopic = () =>
    computeG0FromSnapshot('tenant-2', { opportunityId: 'opp-1', topicId: 'topic-1' }, {
      tenant: { country: null, pic: null, picRegistryStatus: null },
      profile: null,
      topic: null,
      topicFitScore: null,
      baseRatePct: null,
      intendedRole: null,
      seats: [],
      cordis: null,
    });

  const fakeTx = (existing: { id: string } | null) => ({
    opportunity: {
      findFirst: vi.fn().mockResolvedValue({ updatedAt: new Date('2026-01-02T03:04:05.000Z'), g0Score: 41 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    topicMatch: {
      findFirst: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  });

  test('the fixture is a topic-bearing computation with no score', () => {
    const c = noEvidenceWithTopic();
    expect(c.score).toBeNull();
    expect(c.topicId).toBe('topic-1');
  });

  test('no TopicMatch row yet: nothing is created or upserted', async () => {
    const tx = fakeTx(null);
    const cleared = await clearStoredG0(tx as never, noEvidenceWithTopic());
    expect(cleared).toBe(true);
    expect(tx.opportunity.updateMany).toHaveBeenCalled(); // the column is still emptied
    expect(tx.topicMatch.upsert).not.toHaveBeenCalled();
    expect(tx.topicMatch.create).not.toHaveBeenCalled();
    expect(tx.topicMatch.update).not.toHaveBeenCalled();
    expect(tx.topicMatch.updateMany).not.toHaveBeenCalled();
  });

  test('a TopicMatch row exists: its g0Score is set to null, nothing is created', async () => {
    const tx = fakeTx({ id: 'tm-1' });
    await clearStoredG0(tx as never, noEvidenceWithTopic());
    expect(tx.topicMatch.upsert).not.toHaveBeenCalled();
    expect(tx.topicMatch.create).not.toHaveBeenCalled();
    expect(tx.topicMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-2', topicId: 'topic-1', opportunityId: 'opp-1' } }),
    );
    expect(tx.topicMatch.update).toHaveBeenCalledWith({
      where: { id: 'tm-1' },
      data: expect.objectContaining({ g0Score: null }),
    });
  });
});
