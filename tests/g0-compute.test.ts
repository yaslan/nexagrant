import { describe, it, expect, vi } from 'vitest';
import type { TenantTx } from '../src/lib/db';
import {
  computeG0FromSnapshot,
  computeG0ForOpportunity,
  g0EvidencePayload,
  loadG0Snapshot,
  persistG0,
  resolveWeights,
  G0_SCORING_VERSION,
  G0_FIT_SCORE_PLACEHOLDER,
  type G0Computation,
} from '../src/lib/scoring/g0-compute';
import { scoreG0 } from '../src/lib/scoring/g0-canonical';
import { DEFAULT_SCORING_WEIGHTS } from '../src/lib/scoring/defaults';
import type { G0Snapshot } from '../src/lib/scoring/g0-features';

// ───────────────────────── fixtures ─────────────────────────

function snapshotWithEvidence(overrides: Partial<G0Snapshot> = {}): G0Snapshot {
  return {
    tenant: { country: 'DE', pic: 'PIC-1' },
    profile: { keywords: ['hydrogen'] },
    topic: {
      id: 'topic-1',
      identifier: 'HORIZON-CL5-2026-09-D4-01',
      keywords: ['hydrogen'],
      isLumpSum: true,
      isTwoStage: true,
      budgetPerProjectCents: 5_000_000_00,
      eligibility: null,
    },
    topicFitScore: 90,
    baseRatePct: 14,
    intendedRole: 'coordinator',
    seats: [{ roleKey: 'research', status: 'CONFIRMED' }],
    cordis: { coordinationsInTopicFamily: 1, coordinationsOverall: 2, distinctCollaborators: 10, participationsOverall: 3 },
    ...overrides,
  };
}

function emptySnapshot(): G0Snapshot {
  return {
    tenant: { country: null, pic: null },
    profile: null,
    topic: null,
    topicFitScore: null,
    baseRatePct: null,
    intendedRole: null,
    seats: [],
    cordis: null,
  };
}

interface FakeDb {
  tenant?: { country?: string | null; pic?: string | null; settings?: unknown } | null;
  profileKeywords?: string[] | null;
  topics?: { id: string; identifier: string; keywords?: string[]; isLumpSum?: boolean; isTwoStage?: boolean; budgetPerProjectCents?: number | null; eligibility?: unknown }[];
  topicMatch?: { fitScore: number; breakdown?: unknown } | null;
  topicStats?: { country: string | null; successRate: number | null; topicId: string | null }[];
  participations?: { role: string; projectId: string; project: { masterCall: string | null } | null }[];
  collaborators?: { organisationId: string }[];
  opportunities?: { id: string; tenantId: string; topicId: string | null; intendedRole: string | null }[];
  seats?: { roleKey: string; status: string }[];
  /** `true` simulates a CORDIS table with no rows at all (not imported yet). */
  cordisTableEmpty?: boolean;
}

/**
 * A hand-written stand-in for the Prisma delegates this module touches.
 *
 * The generated client is not available in this repo (see src/types/prisma-override.d.ts), so a
 * fake is the only way to exercise the loader. It records its writes, which is what the persistence
 * tests assert on.
 */
function fakeClient(db: FakeDb) {
  const writes = {
    opportunityUpdateMany: vi.fn(),
    topicMatchUpsert: vi.fn(),
  };
  const client = {
    tenant: {
      findUnique: vi.fn(async () => db.tenant ?? null),
    },
    tenantProfile: {
      findUnique: vi.fn(async () => (db.profileKeywords ? { keywords: db.profileKeywords } : null)),
    },
    topic: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; identifier?: string } }) => {
        const rows = db.topics ?? [];
        const hit = where.id
          ? rows.find((t) => t.id === where.id)
          : rows.find((t) => t.identifier === where.identifier);
        return hit ?? null;
      }),
    },
    topicMatch: {
      // The K1 row is looked up with findFirst (`opportunityId: null` cannot go into a
      // compound-unique where), so the fake answers the same call the loader makes.
      findFirst: vi.fn(async ({ where }: { where: { opportunityId?: string | null } }) =>
        where.opportunityId === null ? (db.topicMatch ?? null) : null,
      ),
      upsert: writes.topicMatchUpsert,
    },
    topicStat: {
      findMany: vi.fn(async () => db.topicStats ?? []),
    },
    cordisParticipation: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        'projectId' in where ? (db.collaborators ?? []) : (db.participations ?? []),
      ),
      findFirst: vi.fn(async () => (db.cordisTableEmpty ? null : { projectId: 'any' })),
    },
    opportunity: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) =>
        (db.opportunities ?? []).find((o) => o.id === where.id && o.tenantId === where.tenantId) ?? null,
      ),
      updateMany: writes.opportunityUpdateMany,
    },
    consortiumSeat: {
      findMany: vi.fn(async () => db.seats ?? []),
    },
  };
  return { client: client as unknown as TenantTx, writes };
}

// ───────────────────────── weights ─────────────────────────

describe('resolveWeights()', () => {
  it('falls back to the documented defaults when the tenant has no settings', () => {
    expect(resolveWeights(null)).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(resolveWeights({})).toEqual(DEFAULT_SCORING_WEIGHTS);
  });

  it('takes a tenant override', () => {
    const weights = resolveWeights({ scoringWeights: { alignment: 50 } });
    expect(weights.alignment).toBe(50);
    expect(weights.baseRate).toBe(DEFAULT_SCORING_WEIGHTS.baseRate);
  });

  it('ignores a non-numeric or negative weight instead of producing NaN', () => {
    const weights = resolveWeights({ scoringWeights: { alignment: 'lots', baseRate: -4 } });
    expect(weights.alignment).toBe(DEFAULT_SCORING_WEIGHTS.alignment);
    expect(weights.baseRate).toBe(DEFAULT_SCORING_WEIGHTS.baseRate);
  });
});

// ───────────────────────── scoring ─────────────────────────

describe('computeG0FromSnapshot()', () => {
  const subject = { opportunityId: 'opp-1', topicId: 'topic-1' };

  it('produces the canonical score for the extracted features', () => {
    const computation = computeG0FromSnapshot('t1', subject, snapshotWithEvidence());
    expect(computation.score).toBe(scoreG0(computation.features));
    expect(computation.score).not.toBeNull();
    expect(computation.contributions).not.toBeNull();
  });

  it('refuses to invent a score when there is no evidence at all', () => {
    const computation = computeG0FromSnapshot('t1', subject, emptySnapshot());
    expect(computation.score).toBeNull();
    expect(computation.decision).toBeNull();
    expect(computation.coverage).toBe(0);
    expect(computation.reasons.join(' ')).toContain('no scoring evidence');
  });

  // FO-382 review B2: a seat that is only OPEN or DECLINED is not evidence of anything. With no
  // topic and no CORDIS record the only thing left is that seat, so the answer is no evidence, not
  // a measured 0 (which would print a score and count towards coverage).
  it.each(['OPEN', 'DECLINED'])('gives G0_NO_EVIDENCE when the only seat is %s and nothing else is known', (status) => {
    const snapshot = { ...emptySnapshot(), intendedRole: 'coordinator', seats: [{ roleKey: 'research', status }] };
    const c = computeG0FromSnapshot('t1', subject, snapshot);
    expect(c.coverage).toBe(0);
    expect(c.score).toBeNull();
    expect(c.reasonDetails[0]?.code).toBe('G0_NO_EVIDENCE');
  });

  // NG-59, patron K-579082 = A. The examples from NG-67 §4 and the NG-27 chain, as numbers.
  describe('only CONFIRMED seats score (K-579082)', () => {
    /** Coordinator, no CORDIS data: 30 alignment + 15 base rate + 9 budget + 8 lump sum = 62. */
    const base62 = (seats: G0Snapshot['seats']): G0Snapshot => ({
      tenant: { country: 'DE', pic: null },
      profile: null,
      topic: {
        id: 'topic-62',
        identifier: 'HORIZON-CL5-2026-09-D4-01',
        keywords: ['hydrogen'],
        isLumpSum: true,
        isTwoStage: true,
        // 20 % coordinator slice = €1.12m, 90 % of the way from €400k to €1.2m → 9 of 10.
        budgetPerProjectCents: 5_600_000_00,
        eligibility: null,
      },
      topicFitScore: 100,
      baseRatePct: 100,
      intendedRole: 'coordinator',
      seats,
      cordis: null,
    });
    const both = (status: string) => [
      { roleKey: 'research', status },
      { roleKey: 'end_user', status },
    ];

    it('a 62-point opportunity stays at 62 with invited research and end-user seats, not 74', () => {
      expect(computeG0FromSnapshot('t1', subject, base62([])).score).toBeCloseTo(62, 5);
      const invited = computeG0FromSnapshot('t1', subject, base62(both('INVITED')));
      expect(invited.score).toBeCloseTo(62, 5);
      expect(invited.decision).toBe('NO_GO');
    });

    it.each(['CANDIDATE', 'OPEN', 'DECLINED'])('a %s pair leaves the 62 unchanged too', (status) => {
      expect(computeG0FromSnapshot('t1', subject, base62(both(status))).score).toBeCloseTo(62, 5);
    });

    it('confirming the seats raises the score: one +6, both +12', () => {
      const one = computeG0FromSnapshot('t1', subject, base62([
        { roleKey: 'research', status: 'CONFIRMED' },
        { roleKey: 'end_user', status: 'INVITED' },
      ]));
      const two = computeG0FromSnapshot('t1', subject, base62(both('CONFIRMED')));
      expect(one.score).toBeCloseTo(68, 5);
      expect(two.score).toBeCloseTo(74, 5);
      expect(two.decision).toBe('GO');
    });

    it('an opportunity whose only evidence is invited seats has no score (no evidence), not a number', () => {
      const snapshot = { ...emptySnapshot(), intendedRole: 'coordinator', seats: both('INVITED') };
      const c = computeG0FromSnapshot('t1', subject, snapshot);
      expect(c.coverage).toBe(0);
      expect(c.score).toBeNull();
      expect(c.reasonDetails[0]?.code).toBe('G0_NO_EVIDENCE');
    });

    it('a no-history partner with one invited seat still passes the hard rule, scored without the seat', () => {
      const snapshot = snapshotWithEvidence({
        intendedRole: 'partner',
        cordis: { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 },
        seats: [{ roleKey: 'research', status: 'INVITED' }],
      });
      const c = computeG0FromSnapshot('t1', subject, snapshot);
      expect(c.filledSeats).toBe(1);
      expect(c.reasonDetails.map((r) => r.code)).not.toContain('G0_NO_HISTORY_NO_FILLED_SEAT');
      expect(c.features.researchAndEndUser).toBe(0);
      // (30·90 + 15·70 + 12·0 + 10·100 + 8·100) / 75 = 5550 / 75 = 74
      expect(c.score).toBeCloseTo(74, 5);
    });
  });

  it('honours tenant weights', () => {
    const snapshot = snapshotWithEvidence({ topicFitScore: 100, baseRatePct: 0 });
    const withDefaults = computeG0FromSnapshot('t1', subject, snapshot);
    const alignmentHeavy = computeG0FromSnapshot('t1', subject, snapshot, {
      ...DEFAULT_SCORING_WEIGHTS,
      alignment: 90,
    });
    expect(alignmentHeavy.score!).toBeGreaterThan(withDefaults.score!);
  });

  it('scores a no-history partner over the 75-point denominator with default weights (FO-382, Ö1)', () => {
    const snapshot = snapshotWithEvidence({
      intendedRole: 'partner',
      cordis: { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 },
      seats: [{ roleKey: 'research', status: 'CONFIRMED' }],
    });
    const c = computeG0FromSnapshot('t1', subject, snapshot);
    expect(c.scoringBasis).toBe('no_history_evidence');
    expect(c.excludedFeatures).toEqual(['coordinatorHistory', 'networkCentrality']);
    expect(c.denominator).toBe(75);
    // (30·90 + 15·70 + 12·50 + 10·100 + 8·100) / 75 = 6150 / 75 = 82
    expect(c.score).toBeCloseTo(82, 5);
  });

  it('keeps the same score when every weight doubles: denominator 150, score unchanged (FO-382, Ö1)', () => {
    const snapshot = snapshotWithEvidence({
      intendedRole: 'partner',
      cordis: { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 },
      seats: [{ roleKey: 'research', status: 'CONFIRMED' }],
    });
    const doubled = Object.fromEntries(
      Object.entries(DEFAULT_SCORING_WEIGHTS).map(([k, v]) => [k, v * 2]),
    ) as typeof DEFAULT_SCORING_WEIGHTS;
    const c = computeG0FromSnapshot('t1', subject, snapshot, doubled);
    expect(c.denominator).toBe(150);
    // (30·90 + 15·70 + 12·50 + 10·100 + 8·100) / 75 = 6150 / 75 = 82
    expect(c.score).toBeCloseTo(82, 5);
  });

  it('gives 0 over an empty denominator when only the excluded features carry weight (FO-382, Ö1)', () => {
    const snapshot = snapshotWithEvidence({
      intendedRole: 'partner',
      cordis: { coordinationsInTopicFamily: 0, coordinationsOverall: 0, distinctCollaborators: 0, participationsOverall: 0 },
      seats: [{ roleKey: 'research', status: 'CONFIRMED' }],
    });
    const onlyExcluded = { ...DEFAULT_SCORING_WEIGHTS, alignment: 0, baseRate: 0, researchAndEndUser: 0, budgetRoleEconomy: 0, lumpSumTwoStage: 0 };
    const c = computeG0FromSnapshot('t1', subject, snapshot, onlyExcluded);
    expect(c.denominator).toBe(0);
    expect(c.score).toBe(0);
  });

  it('is deterministic across repeated runs', () => {
    const scores = Array.from({ length: 20 }, () =>
      computeG0FromSnapshot('t1', subject, snapshotWithEvidence()).score,
    );
    expect(new Set(scores).size).toBe(1);
  });
});

describe('g0EvidencePayload()', () => {
  it('carries the breakdown, the source trail and the pre-assessment label', () => {
    const computation = computeG0FromSnapshot('t1', { opportunityId: 'o', topicId: 't' }, snapshotWithEvidence());
    const payload = g0EvidencePayload(computation);
    expect(payload.scoringVersion).toBe(G0_SCORING_VERSION);
    expect(payload.score).toBe(computation.score);
    expect(payload.contributions).toEqual(computation.contributions);
    expect(Array.isArray(payload.sources)).toBe(true);
    expect((payload.sources as unknown[]).length).toBeGreaterThan(0);
    expect(payload.assessment).toBe('internal-pre-assessment');
  });
});

// ───────────────────────── persistence ─────────────────────────

describe('persistG0()', () => {
  function computationFor(snapshot: G0Snapshot, topicId: string | null = 'topic-1'): G0Computation {
    return computeG0FromSnapshot('tenant-1', { opportunityId: 'opp-1', topicId }, snapshot);
  }

  it('writes nothing when the score could not be computed', async () => {
    const { client, writes } = fakeClient({});
    const stored = await persistG0(client, computationFor(emptySnapshot()));
    expect(stored).toBe(false);
    expect(writes.opportunityUpdateMany).not.toHaveBeenCalled();
    expect(writes.topicMatchUpsert).not.toHaveBeenCalled();
  });

  it('scopes the opportunity write to the tenant', async () => {
    const { client, writes } = fakeClient({});
    const computation = computationFor(snapshotWithEvidence());
    await persistG0(client, computation);
    expect(writes.opportunityUpdateMany).toHaveBeenCalledWith({
      where: { id: 'opp-1', tenantId: 'tenant-1' },
      data: { g0Score: computation.score },
    });
  });

  it('stores the breakdown on TopicMatch so the score can be audited later', async () => {
    const { client, writes } = fakeClient({});
    const computation = computationFor(snapshotWithEvidence());
    await persistG0(client, computation);

    const call = writes.topicMatchUpsert.mock.calls[0]?.[0] as {
      where: {
        tenantId_topicId_opportunityId: { tenantId: string; topicId: string; opportunityId: string };
      };
      update: { g0Score: number; breakdown: Record<string, unknown> };
      create: { fitScore: number; opportunityId: string; breakdown: Record<string, unknown> };
    };
    // Keyed by the opportunity: two opportunities on one topic each keep their own record
    // (TASK-MTQ63RR8Z0G8E — a topic-keyed row put one card's score on the other card).
    expect(call.where.tenantId_topicId_opportunityId).toEqual({
      tenantId: 'tenant-1',
      topicId: 'topic-1',
      opportunityId: 'opp-1',
    });
    expect(call.create.opportunityId).toBe('opp-1');
    expect(call.update.g0Score).toBe(computation.score);
    expect(call.update.breakdown.contributions).toEqual(computation.contributions);
    // An existing K1 row keeps its own fitScore; only a row we create carries a flagged placeholder.
    expect('fitScore' in call.update).toBe(false);
    expect(call.create.fitScore).toBe(0);
    // This snapshot's alignment did come from a K1 match, so nothing is flagged.
    expect(call.create.breakdown[G0_FIT_SCORE_PLACEHOLDER]).toBeUndefined();
    expect(call.update.breakdown[G0_FIT_SCORE_PLACEHOLDER]).toBeUndefined();
  });

  it('keeps the placeholder flag on rewrite when alignment did not come from a K1 match', async () => {
    // Regression: the update branch dropped the flag, so the run after a backfill read the
    // placeholder fitScore back as a measured alignment and the reported coverage jumped by the
    // alignment weight (18% → 48%) without a single new fact being on file.
    const { client, writes } = fakeClient({});
    await persistG0(client, computationFor(snapshotWithEvidence({ topicFitScore: null })));
    const call = writes.topicMatchUpsert.mock.calls[0]?.[0] as {
      update: { breakdown: Record<string, unknown> };
      create: { breakdown: Record<string, unknown> };
    };
    expect(call.update.breakdown[G0_FIT_SCORE_PLACEHOLDER]).toBe(true);
    expect(call.create.breakdown[G0_FIT_SCORE_PLACEHOLDER]).toBe(true);
  });

  it('never reads its own placeholder fit score back as a measured alignment', async () => {
    // Regression: the backfill created a TopicMatch row to hold the breakdown, and the next run
    // read that row's placeholder fitScore as a K1 match — turning an absent signal into a
    // measured 0 and inflating the reported evidence coverage by the alignment weight.
    const base: FakeDb = {
      tenant: { country: 'DE', pic: null },
      topics: [
        {
          id: 'topic-1',
          identifier: 'HORIZON-CL5-2026-09-D4-01',
          keywords: [],
          isLumpSum: true,
          isTwoStage: false,
          budgetPerProjectCents: 4_000_000_00,
          eligibility: null,
        },
      ],
    };
    const subject = { opportunityId: 'opp-1', topicId: 'topic-1', intendedRole: 'coordinator', seats: [] };

    const placeholder = fakeClient({
      ...base,
      topicMatch: { fitScore: 0, breakdown: { [G0_FIT_SCORE_PLACEHOLDER]: true } },
    });
    const real = fakeClient({ ...base, topicMatch: { fitScore: 0, breakdown: { source: 'k1' } } });

    expect((await loadG0Snapshot(placeholder.client, 't1', subject)).topicFitScore).toBeNull();
    expect((await loadG0Snapshot(real.client, 't1', subject)).topicFitScore).toBe(0);
  });

  it('skips the evidence row when the opportunity has no topic', async () => {
    const { client, writes } = fakeClient({});
    await persistG0(client, computationFor(snapshotWithEvidence(), null));
    expect(writes.opportunityUpdateMany).toHaveBeenCalled();
    expect(writes.topicMatchUpsert).not.toHaveBeenCalled();
  });
});

// ───────────────────────── loading ─────────────────────────

describe('loadG0Snapshot()', () => {
  const topicRow = {
    id: 'topic-1',
    identifier: 'HORIZON-CL5-2026-09-D4-01',
    keywords: ['hydrogen'],
    isLumpSum: true,
    isTwoStage: false,
    budgetPerProjectCents: 4_000_000_00,
    eligibility: { restricted: 'EU_EEA_CH_ONLY' },
  };

  it('resolves a topic held as a portal identifier, not just as a primary key', async () => {
    const { client } = fakeClient({ tenant: { country: 'DE', pic: null }, topics: [topicRow] });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1',
      topicId: 'HORIZON-CL5-2026-09-D4-01',
      intendedRole: 'coordinator',
      seats: [],
    });
    expect(snapshot.topic?.id).toBe('topic-1');
  });

  it('prefers a success rate measured for the tenant country over the global one', async () => {
    const { client } = fakeClient({
      tenant: { country: 'DE', pic: null },
      topics: [topicRow],
      topicStats: [
        { country: null, successRate: 9, topicId: 'topic-1' },
        { country: 'DE', successRate: 17, topicId: 'topic-1' },
      ],
    });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1',
      topicId: 'topic-1',
      intendedRole: 'coordinator',
      seats: [],
    });
    expect(snapshot.baseRatePct).toBe(17);
  });

  it('a PIC with no CORDIS row is a measured "no record" for the partner (FO-382)', async () => {
    const { client } = fakeClient({ tenant: { country: 'DE', pic: 'PIC-NEW' }, topics: [topicRow] });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1',
      topicId: 'topic-1',
      intendedRole: 'partner',
      seats: [],
    });
    expect(snapshot.cordis).toEqual({
      coordinationsInTopicFamily: 0,
      coordinationsOverall: 0,
      distinctCollaborators: 0,
      participationsOverall: 0,
    });
  });

  // Patron 05.11: "PIC boşsa kolaylık yok". Without a PIC there is no organisation to look up, so
  // the record is absent, not empty: every role keeps the standard basis (FO-382 review, PIC rule).
  it.each([['partner'], ['coordinator'], [null]])(
    'no PIC stays missing for intendedRole=%s: cordis is null, never a measured "no record"',
    async (role) => {
      const { client } = fakeClient({ tenant: { country: 'DE', pic: null }, topics: [topicRow] });
      const snapshot = await loadG0Snapshot(client, 'tenant-1', {
        opportunityId: 'opp-1',
        topicId: 'topic-1',
        intendedRole: role,
        seats: [],
      });
      expect(snapshot.cordis).toBeNull();
    },
  );

  it('a PIC with an empty CORDIS table is missing data, not a measured "no record"', async () => {
    const { client } = fakeClient({
      tenant: { country: 'DE', pic: 'PIC-NEW' },
      topics: [topicRow],
      cordisTableEmpty: true,
    });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1',
      topicId: 'topic-1',
      intendedRole: 'partner',
      seats: [],
    });
    expect(snapshot.cordis).toBeNull();
  });

  it('no PIC and an empty CORDIS table is missing data: cordis stays null, the standard basis holds', async () => {
    const { client } = fakeClient({
      tenant: { country: 'DE', pic: null },
      topics: [topicRow],
      cordisTableEmpty: true,
    });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1',
      topicId: 'topic-1',
      intendedRole: 'partner',
      seats: [],
    });
    expect(snapshot.cordis).toBeNull();
  });

  it('counts coordinations inside the topic family separately from the rest', async () => {
    const { client } = fakeClient({
      tenant: { country: 'DE', pic: 'PIC-1' },
      topics: [topicRow],
      participations: [
        { role: 'coordinator', projectId: 'p1', project: { masterCall: 'HORIZON-CL5-2026-09-D4' } },
        { role: 'coordinator', projectId: 'p2', project: { masterCall: 'HORIZON-CL6-2025-01-D1' } },
        { role: 'participant', projectId: 'p3', project: { masterCall: 'HORIZON-CL5-2026-09-D4' } },
      ],
      collaborators: [{ organisationId: 'o1' }, { organisationId: 'o2' }],
    });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1',
      topicId: 'topic-1',
      intendedRole: 'coordinator',
      seats: [],
    });
    expect(snapshot.cordis).toEqual({
      coordinationsInTopicFamily: 1,
      coordinationsOverall: 2,
      distinctCollaborators: 2,
      participationsOverall: 3,
    });
  });

  it('reports missing CORDIS data (null), not a zero history, when the CORDIS table is empty (FO-382)', async () => {
    const { client } = fakeClient({
      tenant: { country: 'DE', pic: 'PIC-1' },
      topics: [topicRow],
      cordisTableEmpty: true,
    });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1', topicId: 'topic-1', intendedRole: 'partner', seats: [],
    });
    expect(snapshot.cordis).toBeNull();
  });

  it('reports a measured empty history for a PIC with no row while the table has data (FO-382)', async () => {
    const { client } = fakeClient({
      tenant: { country: 'DE', pic: 'PIC-NEW' },
      topics: [topicRow],
      participations: [],
      cordisTableEmpty: false,
    });
    const snapshot = await loadG0Snapshot(client, 'tenant-1', {
      opportunityId: 'opp-1', topicId: 'topic-1', intendedRole: 'partner', seats: [],
    });
    expect(snapshot.cordis).toEqual({
      coordinationsInTopicFamily: 0,
      coordinationsOverall: 0,
      distinctCollaborators: 0,
      participationsOverall: 0,
    });
  });
});

describe('computeG0ForOpportunity()', () => {
  const db: FakeDb = {
    tenant: { country: 'DE', pic: null, settings: {} },
    profileKeywords: ['hydrogen'],
    topics: [
      {
        id: 'topic-1',
        identifier: 'HORIZON-CL5-2026-09-D4-01',
        keywords: ['hydrogen'],
        isLumpSum: true,
        isTwoStage: false,
        budgetPerProjectCents: 4_000_000_00,
        eligibility: null,
      },
    ],
    topicStats: [{ country: null, successRate: 12, topicId: 'topic-1' }],
    opportunities: [{ id: 'opp-1', tenantId: 'tenant-1', topicId: 'topic-1', intendedRole: 'coordinator' }],
    seats: [{ roleKey: 'research', status: 'CONFIRMED' }],
  };

  it('scores an opportunity end to end from stored rows', async () => {
    const { client } = fakeClient(db);
    const computation = await computeG0ForOpportunity(client, 'tenant-1', 'opp-1');
    expect(computation).not.toBeNull();
    expect(computation!.score).toBe(scoreG0(computation!.features));
    expect(computation!.coverage).toBeGreaterThan(0);
    // The evidence row must be filed under the resolved Topic.id.
    expect(computation!.topicId).toBe('topic-1');
  });

  it('returns the same score on every run — nothing random, nothing time-dependent', async () => {
    const scores: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const { client } = fakeClient(db);
      scores.push((await computeG0ForOpportunity(client, 'tenant-1', 'opp-1'))!.score);
    }
    expect(new Set(scores).size).toBe(1);
  });

  it('refuses an opportunity that belongs to another tenant', async () => {
    const { client } = fakeClient(db);
    expect(await computeG0ForOpportunity(client, 'other-tenant', 'opp-1')).toBeNull();
  });
});
