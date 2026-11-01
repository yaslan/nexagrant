import { describe, it, expect } from 'vitest';

import { runSeatMatch, scoreCandidate, topicPrefix, totalScore } from './matching';
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

describe('scoreCandidate', () => {
  const base = {
    participationCount: 0,
    coordinatorCount: 0,
    country: null,
    takenCountries: NO_COUNTRIES,
    sharedProjects: 0,
    warmth: null,
    degree: 0,
    isRival: false,
  };

  it('caps topic experience at 35', () => {
    // 5 participations (25) + 2 coordinations (20) = 45, capped.
    expect(scoreCandidate({ ...base, participationCount: 5, coordinatorCount: 2 }).topicExperience).toBe(35);
  });

  it('gives no geographic bonus for a country already on the consortium', () => {
    const taken = new Set(['FR']);
    expect(scoreCandidate({ ...base, country: 'FR', takenCountries: taken }).geographicBalance).toBe(0);
    expect(scoreCandidate({ ...base, country: 'TR', takenCountries: taken }).geographicBalance).toBe(15);
  });

  it('scores warmth by relationship stage and caps collaboration history', () => {
    expect(scoreCandidate({ ...base, warmth: 'hot' }).relationshipWarmth).toBe(15);
    expect(scoreCandidate({ ...base, warmth: 'warm' }).relationshipWarmth).toBe(10);
    expect(scoreCandidate({ ...base, warmth: 'cold' }).relationshipWarmth).toBe(5);
    expect(scoreCandidate({ ...base, warmth: null }).relationshipWarmth).toBe(0);
    expect(scoreCandidate({ ...base, sharedProjects: 9 }).collabHistory).toBe(15);
  });

  it('penalises an organisation seated on a rival opportunity', () => {
    expect(scoreCandidate({ ...base, isRival: true }).rivalRisk).toBe(-10);
  });

  it('reproduces the reference total the old suite asserted', () => {
    // 5 participations + 2 coordinations (35) + free country (15) + degree 50 (5).
    const breakdown = scoreCandidate({
      ...base,
      participationCount: 5,
      coordinatorCount: 2,
      country: 'FR',
      degree: 50,
    });
    expect(totalScore(breakdown)).toBe(55);
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
    'topic.findUnique': { identifier: 'HORIZON-CL5-2026-D4-01', callId: 'call-1' },
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
    'relationship.findMany': [{ organizationId: 'org-b', warmth: 'hot' }],
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
    // (15) + 2 shared projects with the confirmed partner (10) + degree 2 (0.2)
    // = 45.2 raw points of 90, stored on the 0–100 seat scale (FO-147).
    expect(created[0]?.score).toBe(50.22);
    // org-b: 1 participation (5) + free country TR (15) + hot warmth (15) = 35 of 90.
    expect(created[1]?.score).toBe(38.89);
    expect(created.map((c) => c.rank)).toEqual([1, 2]);
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
