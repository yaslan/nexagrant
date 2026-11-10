/**
 * NG-100 / Bulgu A — the consortium page's live-demand badge is behind the M8 module.
 *
 * `moduleGate('M8')` already closes the whole page for a viewer without M8. This test
 * isolates the badge block itself: with the gate passed, the live-demand query must
 * still run only when `checkModuleAccess('M8')` allows it, and the badge list handed to
 * the builder must be empty otherwise.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  moduleGate: vi.fn(),
  checkModuleAccess: vi.fn(),
  findOpportunityTopic: vi.fn(),
  tx: {
    opportunity: { findFirst: vi.fn() },
    consortiumSeat: { findMany: vi.fn() },
    seatCandidate: { findMany: vi.fn() },
    cordisOrganization: { findMany: vi.fn() },
    partnerSearchAnnouncement: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({
  withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(h.tx),
}));
vi.mock('@/lib/page-role', () => ({
  requireTenantPageRole: async () => ({ tenantId: 't-1', role: 'OWNER' }),
}));
vi.mock('@/modules/m8/server/seat-transitions', () => ({ canConfirmSeat: () => true }));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: h.moduleGate }));
vi.mock('@/lib/modules/access', () => ({ checkModuleAccess: h.checkModuleAccess }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: vi.fn() }));
vi.mock('@/modules/m8/server/matching', () => ({ findOpportunityTopic: h.findOpportunityTopic }));
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager', () => ({
  default: () => null,
}));

import ConsortiumPage from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page';

const MATCH_BREAKDOWN = { topicExperience: 20, geographicBalance: 15, collabHistory: 10, rivalRisk: 0 };

/** Finds the first React element with the given props in a rendered element tree. */
function findManagerProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findManagerProps(child);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as { props?: Record<string, unknown> };
  if (el.props && 'liveDemandOrgIds' in el.props) return el.props;
  return findManagerProps(el.props?.children);
}

async function renderPage(m8Allowed: boolean) {
  h.moduleGate.mockResolvedValue(null); // page gate passed; the badge block is under test
  h.checkModuleAccess.mockResolvedValue({ allowed: m8Allowed });
  const tree = await ConsortiumPage({
    params: Promise.resolve({ id: 'o-1', locale: 'tr', workspace: 'w-1' }),
  });
  return findManagerProps(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.tx.opportunity.findFirst.mockResolvedValue({
    id: 'o-1',
    title: 'Opp',
    stage: 'S1',
    status: 'OPEN',
    topicId: 'topic-1',
    intendedRole: null,
  });
  h.tx.consortiumSeat.findMany.mockResolvedValue([
    { id: 's-1', opportunityId: 'o-1', organizationId: null, roleKey: 'research', required: true, status: 'OPEN' },
  ]);
  h.tx.seatCandidate.findMany.mockResolvedValue([
    { id: 'c-1', seatId: 's-1', organizationId: 'org-demand', rank: 1, score: 45, breakdown: MATCH_BREAKDOWN },
  ]);
  h.tx.cordisOrganization.findMany.mockResolvedValue([]);
  h.tx.partnerSearchAnnouncement.findMany.mockResolvedValue([{ organizationPic: 'org-demand' }]);
  h.findOpportunityTopic.mockResolvedValue({ identifier: 'TOPIC-1' });
});

describe('consortium page — live-demand badge is behind M8 (NG-100 Bulgu A)', () => {
  it('M8 kapalı: canlı talep sorgusu çağrılmaz, rozet listesi boş', async () => {
    const props = await renderPage(false);

    expect(h.tx.partnerSearchAnnouncement.findMany).not.toHaveBeenCalled();
    expect(props?.liveDemandOrgIds).toEqual([]);
  });

  it('M8 açık: canlı talep sorgusu çalışır ve rozet verilir', async () => {
    const props = await renderPage(true);

    expect(h.tx.partnerSearchAnnouncement.findMany).toHaveBeenCalledTimes(1);
    expect(props?.liveDemandOrgIds).toEqual(['org-demand']);
  });
});
