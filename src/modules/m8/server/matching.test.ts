import { describe, it, expect } from 'vitest';

import { MATCH_MAX_TOTAL, matchSeatScore, runSeatMatch, scoreCandidate, topicPrefix, totalScore } from './matching';
import { SeatNotFoundError } from './errors';
import type { TenantTx } from '@/lib/db';

/**
 * The previous version of this file mocked `@/lib/db` wholesale and handed the
 * mock delegates named `organization`, `orgTopicStat` and `collab`. None of
 * those models exist, so the test asserted the behaviour of its own fixture
 * while the feature returned a 500 on every click.
 *
 * What replaces it:
 *  - the scoring rule is a pure function, tested directly;
 *  - `runSeatMatch` takes the transaction as an argument, so it is driven here
 *    by a double that records the queries instead of by a replaced module;
 *  - `./schema-contract.test.ts` checks every query in M8 against
 *    prisma/schema.prisma, which is the only thing that can catch a model or
 *    column that is not there.
 */

const NO_COUNTRIES: ReadonlySet<string> = new Set();

describe('topicPrefix', () => {
  it('reduces a topic identifier to its call prefix', () => {
    expect(topicPrefix('HORIZON-CL5-2026-D4-01')).toBe('HORIZON-CL5-2026');
  });

  it('keeps a short identifier as-is', () => {
    expect(topicPrefix('EIC-2026')).toBe('EIC-2026');
  });

  it('is empty for a missing topic, so matching cannot fall back to every project', () => {
    expect(topicPrefix(null)).toBe('');
    expect(topicPrefix(undefined)).toBe('');
  });
});

describe('scoreCandidate (K-578751: experience 34, country balance 33, collaboration 33, rival -10)', () => {
  const base = {
    participationCount: 0,
    coordinatorCount: 0,
    country: null,
    takenCountries: NO_COUNTRIES,
    sharedProjects: 0,
    isRival: false,
  };
  const noCountryPoints = { ...base, country: 'FR', takenCountries: new Set(['FR']) };

  it('experience: 5 per participation, 10 per coordination, saturating at 34', () => {
    expect(scoreCandidate({ ...base, participationCount: 2, coordinatorCount: 1 }).topicExperience).toBe(20);
    expect(scoreCandidate({ ...base, participationCount: 6 }).topicExperience).toBe(30);
    // The seventh participation is where the old 35 cap was reached too.
    expect(scoreCandidate({ ...base, participationCount: 7 }).topicExperience).toBe(34);
    expect(scoreCandidate({ ...base, participationCount: 5, coordinatorCount: 2 }).topicExperience).toBe(34);
  });

  it('country balance: 33 for a country not on the consortium, otherwise 0', () => {
    const taken = new Set(['FR']);
    expect(scoreCandidate({ ...base, country: 'FR', takenCountries: taken }).geographicBalance).toBe(0);
    expect(scoreCandidate({ ...base, country: 'TR', takenCountries: taken }).geographicBalance).toBe(33);
  });

  it.each([
    ['null', null],
    ['empty', ''],
  ])('country balance: a candidate whose country is %s earns 0, whether or not there are partners', (_label, country) => {
    expect(scoreCandidate({ ...base, country, takenCountries: NO_COUNTRIES }).geographicBalance).toBe(0);
    expect(scoreCandidate({ ...base, country, takenCountries: new Set(['FR']) }).geographicBalance).toBe(0);
  });

  it('country balance: a recorded country earns 33 when there are no partners yet', () => {
    expect(scoreCandidate({ ...base, country: 'TR', takenCountries: NO_COUNTRIES }).geographicBalance).toBe(33);
  });

  it('collaboration: 11 per shared project, saturating at 33 on the third', () => {
    expect(scoreCandidate({ ...base, sharedProjects: 0 }).collabHistory).toBe(0);
    expect(scoreCandidate({ ...base, sharedProjects: 1 }).collabHistory).toBe(11);
    expect(scoreCandidate({ ...base, sharedProjects: 2 }).collabHistory).toBe(22);
    expect(scoreCandidate({ ...base, sharedProjects: 3 }).collabHistory).toBe(33);
    expect(scoreCandidate({ ...base, sharedProjects: 9 }).collabHistory).toBe(33);
  });

  it('rival penalty: -10 for a rival, and it moves no other criterion', () => {
    const rival = scoreCandidate({ ...base, country: 'TR', participationCount: 2, sharedProjects: 1, isRival: true });
    const clean = scoreCandidate({ ...base, country: 'TR', participationCount: 2, sharedProjects: 1, isRival: false });
    expect(rival.rivalRisk).toBe(-10);
    expect(clean.rivalRisk).toBe(0);
    expect({ ...rival, rivalRisk: 0 }).toEqual(clean);
    expect(totalScore(rival)).toBe(totalScore(clean) - 10);
  });

  it('writes exactly the three criteria and the penalty', () => {
    expect(Object.keys(scoreCandidate(base)).sort()).toEqual([
      'collabHistory',
      'geographicBalance',
      'rivalRisk',
      'topicExperience',
    ]);
  });

  it('the total tops out at 100, and that is the seat score of 100', () => {
    const best = scoreCandidate({ ...base, country: 'TR', participationCount: 10, coordinatorCount: 5, sharedProjects: 10 });
    expect(best).toEqual({ topicExperience: 34, geographicBalance: 33, collabHistory: 33, rivalRisk: 0 });
    expect(MATCH_MAX_TOTAL).toBe(100);
    expect(totalScore(best)).toBe(100);
    expect(matchSeatScore(best)).toBe(100);
  });

  it('a candidate at every cap who is also a rival scores 90', () => {
    const rival = scoreCandidate({ ...base, country: 'TR', participationCount: 10, sharedProjects: 10, isRival: true });
    expect(totalScore(rival)).toBe(90);
    expect(matchSeatScore(rival)).toBe(90);
  });

  it('a penalty below zero is clamped to a seat score of 0', () => {
    const rival = scoreCandidate({ ...noCountryPoints, isRival: true });
    expect(totalScore(rival)).toBe(-10);
    expect(matchSeatScore(rival)).toBe(0);
  });
});

/**
 * A transaction double. It answers by delegate name and records what it was
 * asked, so the test can assert the query *shape* — which is what the old mock
 * silently got wrong.
 */
function fakeTx(overrides: Record<string, unknown> = {}) {
  const calls: { delegate: string; method: string; args: unknown }[] = [];
  const created: Record<string, unknown>[] = [];

  const answers: Record<string, unknown> = {
    'opportunity.findFirst': {
      id: 'opp-1',
      topicId: 'topic-1',
      seats: [{ status: 'CONFIRMED', organizationId: 'org-confirmed' }],
    },
    'consortiumSeat.findFirst': { id: 'seat-1', roleKey: 'research' },
    'consortiumSeat.findMany': [],
    'topic.findFirst': { identifier: 'HORIZON-CL5-2026-D4-01', callId: 'call-1' },
    'topic.findMany': [{ id: 'topic-1' }, { id: 'topic-2' }],
    'cordisProjectTopic.findMany': [{ projectId: 'p1' }, { projectId: 'p2' }],
    'cordisParticipation.findMany': [
      { organisationId: 'org-a', role: 'coordinator' },
      { organisationId: 'org-a', role: 'participant' },
      { organisationId: 'org-b', role: 'participant' },
      { organisationId: 'org-confirmed', role: 'participant' },
    ],
    // Answered from the ids the query asks for, so the pool lookup and the
    // confirmed-partner lookup cannot silently return the same rows.
    'cordisOrganization.findMany': (args: { where: { organisationId: { in: string[] } } }) =>
      [
        { organisationId: 'org-a', country: 'FR' },
        { organisationId: 'org-b', country: 'TR' },
        { organisationId: 'org-confirmed', country: 'DE' },
      ].filter((o) => args.where.organisationId.in.includes(o.organisationId)),
    'cordisCoParticipation.findMany': [
      { orgA: 'org-a', orgB: 'org-confirmed', sharedProjectCount: 2 },
      { orgA: 'org-a', orgB: 'org-z', sharedProjectCount: 1 },
    ],
    'seatCandidate.deleteMany': { count: 0 },
    ...overrides,
  };

  const delegate = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          calls.push({ delegate: name, method, args });
          if (name === 'seatCandidate' && method === 'create') {
            const data = (args as { data: Record<string, unknown> }).data;
            created.push(data);
            return Promise.resolve({ id: `sc-${created.length}`, ...data });
          }
          const key = `${name}.${method}`;
          // `in`, not `??` — an override of `null` is an answer, not a gap.
          if (!(key in answers)) return Promise.resolve([]);
          const answer = answers[key];
          return Promise.resolve(typeof answer === 'function' ? answer(args) : answer);
        },
      }
    );

  const tx = new Proxy({}, { get: (_t, name: string) => delegate(name) }) as unknown as TenantTx;
  return { tx, calls, created };
}

describe('runSeatMatch', () => {
  const params = { opportunityId: 'opp-1', seatId: 'seat-1', tenantId: 'tenant-1', limit: 5 };

  it('ranks the CORDIS organisations that worked under the topic prefix', async () => {
    const { tx, created } = fakeTx();
    const result = await runSeatMatch(tx, params);

    // org-confirmed already holds a seat and must not be offered again.
    expect(created.map((c) => c.organizationId)).toEqual(['org-a', 'org-b']);
    expect(result).toHaveLength(2);

    // org-a: 2 participations of which 1 a coordination (20) + free country FR
    // (33) + 2 shared projects with the confirmed partner (22) = 75 of 100.
    expect(created[0]?.score).toBe(75);
    // org-b: 1 participation (5) + free country TR (33) = 38 of 100.
    expect(created[1]?.score).toBe(38);
    expect(created.map((c) => c.rank)).toEqual([1, 2]);
  });

  it('persists the three criteria and the penalty, and no longer reads relationships', async () => {
    const { tx, calls, created } = fakeTx();
    await runSeatMatch(tx, params);
    expect(created[0]?.breakdown).toEqual({
      topicExperience: 20,
      geographicBalance: 33,
      collabHistory: 22,
      rivalRisk: 0,
    });
    expect(calls.some((c) => c.delegate === 'relationship')).toBe(false);
  });

  it('asks only for the edges between the pool and the confirmed partners', async () => {
    const { tx, calls } = fakeTx();
    await runSeatMatch(tx, params);
    const edges = calls.find((c) => c.delegate === 'cordisCoParticipation');
    expect((edges?.args as { where: unknown }).where).toEqual({
      OR: [
        { orgA: { in: ['org-a', 'org-b'] }, orgB: { in: ['org-confirmed'] } },
        { orgB: { in: ['org-a', 'org-b'] }, orgA: { in: ['org-confirmed'] } },
      ],
    });
  });

  it('skips the edge query when no partner is confirmed yet', async () => {
    const { tx, calls, created } = fakeTx({
      'opportunity.findFirst': { id: 'opp-1', topicId: 'topic-1', seats: [] },
    });
    await runSeatMatch(tx, params);
    expect(calls.some((c) => c.delegate === 'cordisCoParticipation')).toBe(false);
    expect(created.length).toBeGreaterThan(0);
  });

  it('carries the tenant into every write', async () => {
    const { tx, calls, created } = fakeTx();
    await runSeatMatch(tx, params);

    const del = calls.find((c) => c.delegate === 'seatCandidate' && c.method === 'deleteMany');
    expect((del?.args as { where: Record<string, unknown> }).where).toMatchObject({
      tenantId: 'tenant-1',
      seatId: 'seat-1',
    });
    for (const row of created) expect(row.tenantId).toBe('tenant-1');
  });

  it('asks for candidates only under the opportunity topic prefix', async () => {
    const { tx, calls } = fakeTx();
    await runSeatMatch(tx, params);

    const topicQuery = calls.find((c) => c.delegate === 'cordisProjectTopic');
    expect((topicQuery?.args as { where: { topicCode: { startsWith: string } } }).where.topicCode.startsWith)
      .toBe('HORIZON-CL5-2026');
  });

  it('resolves a form-created opportunity whose topicId is the topic identifier', async () => {
    const { tx, calls } = fakeTx({
      'opportunity.findFirst': { id: 'opp-1', topicId: 'HORIZON-CL5-2026-D4-01', seats: [] },
    });
    await runSeatMatch(tx, params);

    const topicQuery = calls.find((c) => c.delegate === 'topic');
    expect(topicQuery?.args).toEqual({
      where: { OR: [{ id: 'HORIZON-CL5-2026-D4-01' }, { identifier: 'HORIZON-CL5-2026-D4-01' }] },
      select: { identifier: true, callId: true },
    });
  });

  it('produces nothing — rather than everything — when the opportunity has no topic', async () => {
    const { tx, calls, created } = fakeTx({
      'opportunity.findFirst': { id: 'opp-1', topicId: null, seats: [] },
    });
    await runSeatMatch(tx, params);

    expect(created).toHaveLength(0);
    // An empty prefix would have matched every project ever imported.
    expect(calls.some((c) => c.delegate === 'cordisProjectTopic')).toBe(false);
    // The stale candidates are still cleared.
    expect(calls.some((c) => c.delegate === 'seatCandidate' && c.method === 'deleteMany')).toBe(true);
  });

  it('offers only past coordinators for a coordinator seat', async () => {
    const { tx, created } = fakeTx({
      'consortiumSeat.findFirst': { id: 'seat-1', roleKey: 'coordinator' },
    });
    await runSeatMatch(tx, params);

    // org-b has never coordinated; org-a has.
    expect(created.map((c) => c.organizationId)).toEqual(['org-a']);
  });

  it('refuses a seat that is not in this tenant', async () => {
    const { tx } = fakeTx({ 'consortiumSeat.findFirst': null });
    await expect(runSeatMatch(tx, params)).rejects.toThrow(/Seat seat-1 not found/);
  });

  // The "Aday Bul" form tells these apart from every other failure by class
  // alone, and says "not in this workspace" for them (TASK-MUNZ7N9IT8VPY).
  it.each([
    ['a missing seat', { 'consortiumSeat.findFirst': null }, params],
    ['a missing opportunity', { 'opportunity.findFirst': null }, params],
    ['an empty seat id', {}, { ...params, seatId: '' }],
  ])('refuses %s with SeatNotFoundError', async (_name, overrides, p) => {
    const { tx } = fakeTx(overrides);
    await expect(runSeatMatch(tx, p)).rejects.toBeInstanceOf(SeatNotFoundError);
  });
});
