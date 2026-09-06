import { describe, it, expect, vi } from 'vitest';
import { generateSeatCandidates } from './matching';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    opportunity: { findUnique: vi.fn() },
    consortiumSeat: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    orgTopicStat: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    relationship: { findMany: vi.fn() },
    collab: { findMany: vi.fn() },
    $transaction: vi.fn((cb) => cb({ seatCandidate: { deleteMany: vi.fn(), create: vi.fn((args: any) => args.data) } })),
  }
}));

describe('generateSeatCandidates', () => {
  it('computes score within 3 seconds', async () => {
    // Setup basic mock returns
    vi.mocked(prisma.opportunity.findUnique).mockResolvedValue({
      id: 'opp-1',
      title: 'Opp 1',
      tenantId: 'tenant-1',
      workspaceId: 'ws-1',
      stage: 'G0',
      status: 'ACTIVE',
      seats: [],
      topic: { id: 't-1', identifier: 'HORIZON-CL5-2026-09-01', callId: 'c-1', title: 'T' }
    } as any);

    vi.mocked(prisma.consortiumSeat.findUnique).mockResolvedValue({
      id: 'seat-1', roleKey: 'partner', status: 'OPEN', organizationId: null
    } as any);

    // Mock 100 stats
    const mockStats = Array.from({ length: 100 }).map((_, i) => ({
      organizationId: `org-${i}`,
      coordinatorCount: 2,
      participationCount: 5,
      organization: { id: `org-${i}`, country: 'FR', degree: 50, eigenvector: 0.1 }
    }));
    vi.mocked(prisma.orgTopicStat.findMany).mockResolvedValue(mockStats as any);

    vi.mocked(prisma.organization.findMany).mockResolvedValue([]);
    vi.mocked(prisma.relationship.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collab.findMany).mockResolvedValue([]);
    vi.mocked(prisma.consortiumSeat.findFirst).mockResolvedValue(null);

    const start = Date.now();
    const candidates = await generateSeatCandidates('opp-1', 'seat-1', 'tenant-1', 5);
    const end = Date.now();

    expect(candidates).toHaveLength(5);
    expect(end - start).toBeLessThan(3000); // Must run under 3 seconds per requirements
    expect(candidates[0].score).toBeGreaterThan(0);
    // Topic Experience (35 max): 2*10 + 5*5 = 45 -> cap 35
    // Geo Balance (15): 15 (no conflicts)
    // Centrality (10 max): 50 / 10 = 5
    // Total = 35 + 15 + 5 = 55
    expect(candidates[0].score).toBe(55);
  });
});
