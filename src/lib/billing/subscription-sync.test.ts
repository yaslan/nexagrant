import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
} from './subscription-sync';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn(), findFirst: vi.fn() },
    addOnCatalog: { findMany: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    addOn: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    creditLedger: { create: vi.fn() },
    moduleState: { upsert: vi.fn() },
    auditEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    moduleCatalog: { findMany: vi.fn() },
  },
}));

describe('subscription-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncStripeSubscription', () => {
    it('should sync a new active subscription and grant credits', async () => {
      const tenantId = 'tenant_test_123';
      const eventId = 'evt_test_456';

      const mockTenant = { id: tenantId, name: 'Test Tenant' };
      const mockPlan = {
        id: 'team',
        monthlyCents: 24900,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M2', 'M3'],
      };

      const mockSubscription = {
        id: 'sub_test_789',
        customer: 'cus_test_123',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        billing_cycle_anchor: null,
        items: {
          data: [
            {
              id: 'si_test_1',
              price: { id: 'price_team_monthly' } as Stripe.Price,
              quantity: 1,
            } as Stripe.SubscriptionItem,
          ],
        } as Stripe.ApiList<Stripe.SubscriptionItem>,
        metadata: { tenantId },
      } as unknown as Stripe.Subscription;

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as any);
      vi.mocked(prisma.plan.findFirst).mockResolvedValue({
        id: 'team',
      } as any);
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(mockPlan as any);
      vi.mocked(prisma.addOnCatalog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.addOn.findMany).mockResolvedValue([]);
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.subscription.upsert).mockResolvedValue({
        tenantId,
        planId: 'team',
        status: 'ACTIVE',
      } as any);
      vi.mocked(prisma.creditLedger.create).mockResolvedValue({} as any);
      vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

      const result = await syncStripeSubscription(
        mockSubscription as unknown as Stripe.Subscription,
        eventId
      );

      expect(result.tenantId).toBe(tenantId);
      expect(result.planId).toBe('team');
      expect(result.status).toBe('ACTIVE');
      expect(result.creditsGranted).toBe(500);
      expect(prisma.subscription.upsert).toHaveBeenCalled();
      expect(vi.mocked(prisma.auditEvent.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            type: 'subscription.updated',
          }),
        })
      );
    });

    it('should skip duplicate events (idempotency)', async () => {
      const eventId = 'evt_already_processed';
      const mockSubscription = {
        id: 'sub_test_789',
        metadata: { tenantId: 'tenant_test' },
      } as unknown as Stripe.Subscription;

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue({} as any);

      const result = await syncStripeSubscription(mockSubscription, eventId);

      expect(result.status).toBe('skipped');
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionCancellation', () => {
    it('should cancel subscription and turn off non-free modules', async () => {
      const tenantId = 'tenant_test_123';
      const eventId = 'evt_cancel_456';

      const mockSubscription = {
        id: 'sub_test_789',
        metadata: { tenantId },
      } as unknown as Stripe.Subscription;

      const freePlan = {
        id: 'free',
        modules: ['M3'],
      };

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.subscription.update).mockResolvedValue({} as any);
      vi.mocked(prisma.addOn.updateMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(freePlan as any);
      vi.mocked(prisma.moduleCatalog.findMany).mockResolvedValue([
        { id: 'M1' },
        { id: 'M2' },
        { id: 'M3' },
      ] as any);
      vi.mocked(prisma.moduleState.upsert).mockResolvedValue({} as any);
      vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

      const result = await handleSubscriptionCancellation(mockSubscription, eventId);

      expect(result.status).toBe('CANCELED');
      expect(result.planId).toBe('free');
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          data: { status: 'CANCELED' },
        })
      );
      expect(prisma.addOn.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, endedAt: null },
        })
      );
    });

    it('should skip duplicate cancellation events', async () => {
      const eventId = 'evt_already_canceled';
      const mockSubscription = {
        id: 'sub_test_789',
        metadata: { tenantId: 'tenant_test' },
      } as unknown as Stripe.Subscription;

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue({} as any);

      const result = await handleSubscriptionCancellation(mockSubscription, eventId);

      expect(result.status).toBe('skipped');
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });
});
