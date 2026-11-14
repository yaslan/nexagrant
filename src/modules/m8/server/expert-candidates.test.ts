import { describe, it, expect } from 'vitest';

import type { ExpertPoolEntry } from '@/core/contracts/expert-pool';
import type { TenantTx } from '@/lib/db';
import { expertCandidatesForOpportunity, expertProgrammeForTopic, matchExpertsToSeat } from './expert-candidates';
import { minimumPartnerState } from './minimum-partners';

/**
 * NG-52 (TASK-MW2SU1H9BLCGV) — the free expert pre-registrations as M8 seat
 * candidates. Before this file no M8 query read them: 0 matches.
 */

function expert(overrides: Partial<ExpertPoolEntry> = {}): ExpertPoolEntry {
  return {
    id: 'epr-1',
    founderNumber: 7,
    province: '06',
    country: 'TR',
    isFreelancer: true,
    roles: ['researcher'],
    programmes: ['horizon-europe-h2020'],
    expertiseAreas: ['energy'],
    languages: ['tr', 'en'],
    ...overrides,
  };
}

const HORIZON = 'HORIZON-CL5-2026-D4-01';

describe('expertProgrammeForTopic', () => {
  it('maps the programme prefix of a topic to the slug the expert form stores', () => {
    expect(expertProgrammeForTopic(HORIZON)).toBe('horizon-europe-h2020');
    expect(expertProgrammeForTopic('ERASMUS-EDU-2026-PI-ALL-INNO')).toBe('erasmus-plus');
    expect(expertProgrammeForTopic('LIFE-2026-SAP-ENV')).toBe('life');
    expect(expertProgrammeForTopic('DIGITAL-2026-AI-01')).toBe('digital-europe');
  });

  it('is null for a programme the form does not list, and for no topic', () => {
    expect(expertProgrammeForTopic('EUROSTARS-2026')).toBeNull();
    expect(expertProgrammeForTopic(null)).toBeNull();
  });
});

describe('matchExpertsToSeat', () => {
  it('matches a verified expert on the topic programme and the seat role', () => {
    const result = matchExpertsToSeat([expert()], { topicIdentifier: HORIZON, seatRoleKey: 'research', minimumPartners: null });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ matchedProgramme: 'horizon-europe-h2020', matchedRoles: ['researcher'] });
  });

  it('does not match an expert of another programme', () => {
    const result = matchExpertsToSeat([expert({ programmes: ['erasmus-plus'] })], {
      topicIdentifier: HORIZON,
      seatRoleKey: 'research',
      minimumPartners: null,
    });
    expect(result.matches).toHaveLength(0);
  });

  it('does not match an expert whose roles do not fill the seat', () => {
    const result = matchExpertsToSeat([expert({ roles: ['trainer'] })], {
      topicIdentifier: HORIZON,
      seatRoleKey: 'coordinator',
      minimumPartners: null,
    });
    expect(result.matches).toHaveLength(0);
  });

  it('offers no expert for an organisation-type seat (industry, end user, widening)', () => {
    for (const seatRoleKey of ['industry', 'end_user', 'widening']) {
      const result = matchExpertsToSeat([expert({ roles: ['coordinator', 'researcher'] })], {
        topicIdentifier: HORIZON,
        seatRoleKey,
        minimumPartners: null,
      });
      expect(result.matches, seatRoleKey).toHaveLength(0);
    }
  });

  it('drops the experts the minimum-partner filter rules out, and counts them', () => {
    // 3 countries required, TR already held by a confirmed partner, 1 seat left:
    // a Turkish expert cannot bring the missing country.
    const minimumPartners = minimumPartnerState({ minPartners: 3, minCountries: 3 }, ['CONFIRMED', 'CONFIRMED', 'OPEN'], new Set(['TR', 'DE']));
    const blocked = matchExpertsToSeat([expert()], { topicIdentifier: HORIZON, seatRoleKey: 'research', minimumPartners });
    expect(blocked.matches).toHaveLength(0);
    expect(blocked.excludedByMinimumPartners).toBe(1);

    const open = minimumPartnerState({ minPartners: 3, minCountries: 3 }, ['CONFIRMED', 'CONFIRMED', 'OPEN'], new Set(['FR', 'DE']));
    const passed = matchExpertsToSeat([expert()], { topicIdentifier: HORIZON, seatRoleKey: 'research', minimumPartners: open });
    expect(passed.matches).toHaveLength(1);
    expect(passed.excludedByMinimumPartners).toBe(0);
  });

  it('ranks more matched roles first, then the founder number, and keeps the limit', () => {
    const experts = [
      expert({ id: 'a', founderNumber: 3, roles: ['coordinator'] }),
      expert({ id: 'b', founderNumber: null, roles: ['coordinator', 'project-manager'] }),
      expert({ id: 'c', founderNumber: 1, roles: ['project-manager'] }),
    ];
    const result = matchExpertsToSeat(experts, { topicIdentifier: HORIZON, seatRoleKey: 'coordinator', minimumPartners: null, limit: 2 });
    expect(result.matches.map((m) => m.expert.id)).toEqual(['b', 'c']);
  });
});

/** The same delegate-recording double as matching.test.ts, reduced to what this reads. */
function fakeTx(answers: Record<string, unknown>) {
  const calls: { key: string; args: unknown }[] = [];
  const delegate = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          const key = `${name}.${method}`;
          calls.push({ key, args });
          const answer = key in answers ? answers[key] : [];
          return Promise.resolve(typeof answer === 'function' ? (answer as (a: unknown) => unknown)(args) : answer);
        },
      }
    );
  return { tx: new Proxy({}, { get: (_t, name: string) => delegate(name) }) as unknown as TenantTx, calls };
}

describe('expertCandidatesForOpportunity', () => {
  const base = {
    'opportunity.findFirst': {
      id: 'opp-1',
      topicId: HORIZON,
      seats: [
        { id: 'seat-c', roleKey: 'coordinator', status: 'CONFIRMED', organizationId: 'org-de' },
        { id: 'seat-r', roleKey: 'research', status: 'OPEN', organizationId: null },
      ],
    },
    'topic.findFirst': { identifier: HORIZON, callId: 'call-1', eligibility: { restricted: null, minPartners: 3, minCountries: 3 } },
    'cordisOrganization.findMany': [{ organisationId: 'org-de', country: 'DE' }],
  };

  it('links a pre-registration to the open research seat of the opportunity (match count > 0)', async () => {
    const { tx, calls } = fakeTx(base);
    const bySeat = await expertCandidatesForOpportunity(tx, { opportunityId: 'opp-1', tenantId: 't-1', experts: [expert()] });
    expect(bySeat.get('seat-r')?.matches.map((m) => m.expert.id)).toEqual(['epr-1']);
    // A confirmed seat is not looking for anyone.
    expect(bySeat.has('seat-c')).toBe(false);
    // Tenant-scoped opportunity lookup.
    expect((calls.find((c) => c.key === 'opportunity.findFirst')?.args as { where: unknown }).where).toEqual({ id: 'opp-1', tenantId: 't-1' });
  });

  it('returns no match when the minimum-partner filter needs a country the expert cannot bring', async () => {
    const { tx } = fakeTx({
      ...base,
      // The confirmed partner is Turkish: 3 countries needed, 1 held, 1 seat left.
      'cordisOrganization.findMany': [{ organisationId: 'org-de', country: 'TR' }],
    });
    const bySeat = await expertCandidatesForOpportunity(tx, { opportunityId: 'opp-1', tenantId: 't-1', experts: [expert()] });
    expect(bySeat.get('seat-r')?.matches).toEqual([]);
    expect(bySeat.get('seat-r')?.excludedByMinimumPartners).toBe(1);
  });

  // CRW NG-186 bulgu 3: a seat confirmed with the tenant's own partner record counts its country.
  it('counts the country of a seat confirmed with a PartnerOrg (tenant-scoped lookup)', async () => {
    const { tx, calls } = fakeTx({
      ...base,
      'opportunity.findFirst': {
        id: 'opp-1',
        topicId: HORIZON,
        seats: [
          { id: 'seat-c', roleKey: 'coordinator', status: 'CONFIRMED', organizationId: 'org-de', partnerOrgId: null },
          { id: 'seat-p', roleKey: 'industry', status: 'CONFIRMED', organizationId: null, partnerOrgId: 'po-1' },
          { id: 'seat-r', roleKey: 'research', status: 'OPEN', organizationId: null, partnerOrgId: null },
        ],
      },
      // The partner record is Turkish: DE + TR held, 1 country and 1 seat left, so a TR expert cannot close it.
      'partnerOrg.findMany': [{ country: 'tr ' }],
    });
    const bySeat = await expertCandidatesForOpportunity(tx, { opportunityId: 'opp-1', tenantId: 't-1', experts: [expert()] });
    expect(bySeat.get('seat-r')?.matches).toEqual([]);
    expect(bySeat.get('seat-r')?.excludedByMinimumPartners).toBe(1);
    expect((calls.find((c) => c.key === 'partnerOrg.findMany')?.args as { where: unknown }).where).toEqual({ id: { in: ['po-1'] }, tenantId: 't-1' });
  });

  it('is empty for an opportunity outside the tenant', async () => {
    const { tx } = fakeTx({ ...base, 'opportunity.findFirst': null });
    const bySeat = await expertCandidatesForOpportunity(tx, { opportunityId: 'opp-x', tenantId: 't-1', experts: [expert()] });
    expect(bySeat.size).toBe(0);
  });
});
