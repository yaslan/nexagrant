import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import enMessages from '../messages/en.json';
import trMessages from '../messages/tr.json';
import { scoreCandidatesForSeat } from '@/lib/scoring/consortium';

/**
 * FO-146 / Ö1 — the candidate pool also takes the organisations that published a
 * live request on the topic, even when their track record is outside the top 50.
 * The transaction is a stub: the query shape, not the database, is under test here.
 */

const NOW = Date.now();
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000);

// Fifty well-established partners, the weakest of them at 40 projects.
const TOP_PROFILES = Array.from({ length: 50 }, (_, i) => ({
  organisationId: `TOP-${i}`,
  country: `C${i}`,
  sme: false,
  totalProjects: 40 + i,
}));
// The small partner with a request on the topic: 3 projects, outside the top 50.
const SMALL_PIC = { organisationId: 'SMALL-PIC', country: 'XX', sme: true, totalProjects: 3 };

const { txStub } = vi.hoisted(() => {
  const txStub = {
    consortiumSeat: { findMany: vi.fn(async () => []) },
    cordisOrganization: { findMany: vi.fn(async () => []) },
    relationship: { findMany: vi.fn(async () => []) },
    cordisPartnerProfile: { findMany: vi.fn() },
    topic: { findUnique: vi.fn(async () => ({ identifier: 'HORIZON-CL5-2026-D4-01' })) },
    cordisProjectTopic: { findMany: vi.fn(async () => []) },
    cordisParticipation: { findMany: vi.fn(async () => []) },
    partnerSearchAnnouncement: {
      findMany: vi.fn(async (): Promise<{ organizationPic: string | null; publishedAt: Date | null }[]> => []),
    },
    seatCandidate: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({})),
    },
  };
  return { txStub };
});

vi.mock('@/lib/db', () => ({
  withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(txStub),
}));
vi.mock('@/lib/env', () => ({ consortiumLiveDemandWeight: undefined }));
vi.mock('@/modules/m8/server/matching', () => ({
  topicPrefix: (identifier: string | null | undefined) =>
    identifier ? identifier.split('-').slice(0, 3).join('-') : '',
}));

/** Profiles answer the top-50 query (no `in`) and the PIC lookup (`in`) separately. */
function wirePartnerProfiles() {
  txStub.cordisPartnerProfile.findMany.mockImplementation(async (args: unknown) => {
    const where = (args as { where: { organisationId?: { in?: string[] } } }).where;
    const wanted = where.organisationId?.in;
    if (wanted) return [SMALL_PIC].filter((p) => wanted.includes(p.organisationId));
    return [...TOP_PROFILES];
  });
}

function wireRequests(requests: { organizationPic: string | null; publishedAt: Date | null }[]) {
  txStub.partnerSearchAnnouncement.findMany.mockResolvedValue(requests);
}

describe('scoreCandidatesForSeat — live-demand candidate pool (Ö1)', () => {
  it('adds an announcement owner outside the top 50 to the scored pool', async () => {
    wirePartnerProfiles();
    wireRequests([{ organizationPic: 'SMALL-PIC', publishedAt: daysAgo(2) }]);

    // limit above the pool size, so every scored candidate is returned.
    const results = await scoreCandidatesForSeat('t1', 'seat1', 'opp1', 'topic1', 60, {
      liveDemandVisible: true,
    });

    const ids = results.map((r) => r.organizationId);
    expect(ids).toContain('SMALL-PIC');
    expect(ids).toHaveLength(51);
    const small = results.find((r) => r.organizationId === 'SMALL-PIC');
    expect(small?.score.liveDemandReason).toEqual({ days: 2 });
  });

  it('does not duplicate an owner already in the top 50', async () => {
    wirePartnerProfiles();
    wireRequests([{ organizationPic: 'TOP-7', publishedAt: daysAgo(2) }]);

    const results = await scoreCandidatesForSeat('t1', 'seat1', 'opp1', 'topic1', 60);

    expect(results.filter((r) => r.organizationId === 'TOP-7')).toHaveLength(1);
    expect(results).toHaveLength(50);
  });

  it('keeps the pool at the top 50 when there is no request on the topic', async () => {
    wirePartnerProfiles();
    wireRequests([]);

    const results = await scoreCandidatesForSeat('t1', 'seat1', 'opp1', 'topic1', 60);

    expect(results).toHaveLength(50);
    expect(results.map((r) => r.organizationId)).not.toContain('SMALL-PIC');
  });
});

describe('liveDemandReason plural (Ö3)', () => {
  const cases: [number, string, string][] = [
    [0, 'today', 'bugün'],
    [1, '1 day ago', '1 gün önce'],
    [5, '5 days ago', '5 gün önce'],
  ];

  it.each(cases)('renders %i day(s) in EN and TR', (days, en, tr) => {
    const enT = createTranslator({ locale: 'en', messages: enMessages, namespace: 'Consortium' });
    const trT = createTranslator({ locale: 'tr', messages: trMessages, namespace: 'Consortium' });
    expect(enT('liveDemandReason', { days })).toContain(`topic ${en}.`);
    expect(trT('liveDemandReason', { days })).toContain(`için ${tr} partner`);
  });
});
