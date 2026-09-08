import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
} from './subscription-sync';
import type {
  AuditEvent,
  CreditLedger,
  ModuleCatalog,
  ModuleState,
  Plan,
  Subscription,
  Tenant,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { getActiveTier } from '@/lib/billing/active-tier';
import { findTierByCode, NO_DISCOUNT_TIER } from '@/lib/billing/catalog';
import { partialRow, partialRows } from '../../../tests/helpers/partial-row';

// The campaign running "now" is a deployment setting; the tests choose it
// directly so the price lock can be watched across one, rather than through
// process.env. What the tier *means* for a price is covered by
// price-lock.test.ts and catalog.test.ts; here the question is only whether the
// sync persists it.
vi.mock('@/lib/billing/active-tier', () => ({ getActiveTier: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn(), findFirst: vi.fn() },
    planVersion: { findFirst: vi.fn() },
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
    vi.mocked(getActiveTier).mockReturnValue(NO_DISCOUNT_TIER);
  });

  describe('syncStripeSubscription', () => {
    it('should sync a new active subscription and grant credits', async () => {
      const tenantId = 'tenant_test_123';
      const eventId = 'evt_test_456';

      const mockTenant: Partial<Tenant> = { id: tenantId, name: 'Test Tenant' };
      const mockPlan: Partial<Plan> = {
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
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(partialRow<Tenant>(mockTenant));
      vi.mocked(prisma.plan.findFirst).mockResolvedValue(
        partialRow<Plan>({ id: 'team' })
      );
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(partialRow<Plan>(mockPlan));
      vi.mocked(prisma.addOnCatalog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.addOn.findMany).mockResolvedValue([]);
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.subscription.upsert).mockResolvedValue(
        partialRow<Subscription>({
          tenantId,
          planId: 'team',
          status: 'ACTIVE',
        })
      );
      vi.mocked(prisma.creditLedger.create).mockResolvedValue(partialRow<CreditLedger>({}));
      vi.mocked(prisma.auditEvent.create).mockResolvedValue(partialRow<AuditEvent>({}));

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

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(partialRow<AuditEvent>({}));

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

      const freePlan: Partial<Plan> = {
        id: 'free',
        modules: ['M3'],
      };

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.subscription.update).mockResolvedValue(partialRow<Subscription>({}));
      vi.mocked(prisma.addOn.updateMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(partialRow<Plan>(freePlan));
      vi.mocked(prisma.moduleCatalog.findMany).mockResolvedValue(
        partialRows<ModuleCatalog>([{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }])
      );
      vi.mocked(prisma.moduleState.upsert).mockResolvedValue(partialRow<ModuleState>({}));
      vi.mocked(prisma.auditEvent.create).mockResolvedValue(partialRow<AuditEvent>({}));

      const result = await handleSubscriptionCancellation(mockSubscription, eventId);

      expect(result.status).toBe('CANCELED');
      expect(result.planId).toBe('free');
      // The cancellation also drops the price lock: the locked rate belongs to
      // the subscription that just ended, so coming back means joining again at
      // whatever campaign is running then (TASK-MTR882HVZ8BG7).
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          data: {
            status: 'CANCELED',
            lockedTierCode: null,
            lockedPercentOff: null,
            lockedAmountMinor: null,
            lockedCurrency: null,
            priceLockedAt: null,
          },
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

      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(partialRow<AuditEvent>({}));

      const result = await handleSubscriptionCancellation(mockSubscription, eventId);

      expect(result.status).toBe('skipped');
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });
  /**
   * TASK-MTR882HVZ8BG7 — the price a tenant joined at has to survive the
   * campaign it joined under. The rule lives in `src/lib/billing/price-lock.ts`
   * and is unit-tested there; these check that the Stripe sync actually writes
   * and preserves it.
   */
  describe('price lock', () => {
    const tenantId = 'tenant_lock';

    function stripeSubscription(unitAmount: number | null = 2_610) {
      return {
        id: 'sub_lock_1',
        customer: 'cus_lock_1',
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30,
        billing_cycle_anchor: null,
        items: {
          data: [
            {
              id: 'si_lock_1',
              price: { id: 'price_pro_monthly', unit_amount: unitAmount, currency: 'usd' },
              quantity: 1,
            },
          ],
        },
        metadata: { tenantId },
      } as unknown as Stripe.Subscription;
    }

    function mockDb(existing: Partial<Subscription> | null) {
      vi.mocked(prisma.auditEvent.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(
        partialRow<Tenant>({ id: tenantId, name: 'Lock Co' })
      );
      vi.mocked(prisma.plan.findFirst).mockResolvedValue(partialRow<Plan>({ id: 'pro' }));
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(
        partialRow<Plan>({
          id: 'pro',
          aiCreditsMonthly: 500,
          modules: ['M1'],
        })
      );
      vi.mocked(prisma.addOnCatalog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.addOn.findMany).mockResolvedValue([]);
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
        existing === null ? null : partialRow<Subscription>(existing)
      );
      vi.mocked(prisma.subscription.upsert).mockResolvedValue(
        partialRow<Subscription>({ tenantId, planId: 'pro' })
      );
      vi.mocked(prisma.creditLedger.create).mockResolvedValue(partialRow<CreditLedger>({}));
      vi.mocked(prisma.auditEvent.create).mockResolvedValue(partialRow<AuditEvent>({}));
    }

    /** The `data` a single upsert call carried, create side and update side. */
    function upsertArgs() {
      const call = vi.mocked(prisma.subscription.upsert).mock.calls[0]?.[0] as {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      };
      return call;
    }

    it('locks a first subscription at the running campaign, with the amount Stripe will charge', async () => {
      vi.mocked(getActiveTier).mockReturnValue(findTierByCode('ILK5')!);
      mockDb(null);

      await syncStripeSubscription(stripeSubscription(2_610), 'evt_lock_1');

      const { create, update } = upsertArgs();
      expect(create.lockedTierCode).toBe('ILK5');
      expect(create.lockedPercentOff).toBe(70);
      expect(create.lockedAmountMinor).toBe(2_610);
      expect(create.lockedCurrency).toBe('USD');
      expect(create.priceLockedAt).toBeInstanceOf(Date);
      // The same columns go on the update side, so the row is locked whichever
      // branch of the upsert wins the race.
      expect(update.lockedTierCode).toBe('ILK5');
    });

    it('does not touch the lock when a later event arrives under a worse campaign', async () => {
      vi.mocked(getActiveTier).mockReturnValue(NO_DISCOUNT_TIER);
      mockDb({
        tenantId,
        planId: 'pro',
        status: 'ACTIVE',
        lockedTierCode: 'ILK5',
        lockedPercentOff: 70,
        lockedAmountMinor: 2_610,
        lockedCurrency: 'USD',
        priceLockedAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      await syncStripeSubscription(stripeSubscription(8_700), 'evt_lock_2');

      const { update } = upsertArgs();
      expect(update).not.toHaveProperty('lockedTierCode');
      expect(update).not.toHaveProperty('lockedPercentOff');
      expect(update).not.toHaveProperty('priceLockedAt');
    });

    it('leaves a subscription sold before the lock existed unlocked, rather than stamping today on it', async () => {
      vi.mocked(getActiveTier).mockReturnValue(NO_DISCOUNT_TIER);
      mockDb({
        tenantId,
        planId: 'pro',
        status: 'ACTIVE',
        lockedTierCode: null,
        lockedPercentOff: null,
        lockedAmountMinor: null,
        lockedCurrency: null,
        priceLockedAt: null,
      });

      await syncStripeSubscription(stripeSubscription(8_700), 'evt_lock_3');

      const { update } = upsertArgs();
      expect(update).not.toHaveProperty('lockedTierCode');
    });

    it('re-locks at today’s campaign when a cancelled subscription comes back', async () => {
      vi.mocked(getActiveTier).mockReturnValue(findTierByCode('PROMO10')!);
      mockDb({
        tenantId,
        planId: 'pro',
        status: 'CANCELED',
        lockedTierCode: null,
        lockedPercentOff: null,
        lockedAmountMinor: null,
        lockedCurrency: null,
        priceLockedAt: null,
      });

      await syncStripeSubscription(stripeSubscription(7_830), 'evt_lock_4');

      const { update } = upsertArgs();
      expect(update.lockedTierCode).toBe('PROMO10');
      expect(update.lockedPercentOff).toBe(10);
      expect(update.lockedAmountMinor).toBe(7_830);
    });

    it('falls back to the catalogue when Stripe carries no unit amount', async () => {
      vi.mocked(getActiveTier).mockReturnValue(findTierByCode('LANSMAN50')!);
      mockDb(null);

      await syncStripeSubscription(stripeSubscription(null), 'evt_lock_5');

      const { create } = upsertArgs();
      // Pro monthly, $87.00 list, 50% off.
      expect(create.lockedAmountMinor).toBe(4_350);
      expect(create.lockedCurrency).toBe('USD');
    });

    it('records the lock it wrote in the audit trail, so the column can be overwritten later', async () => {
      vi.mocked(getActiveTier).mockReturnValue(findTierByCode('ILK5')!);
      mockDb(null);

      await syncStripeSubscription(stripeSubscription(2_610), 'evt_lock_6');

      const audit = vi.mocked(prisma.auditEvent.create).mock.calls[0]?.[0] as {
        data: { data: { priceLock: { tierCode: string; percentOff: number } } };
      };
      expect(audit.data.data.priceLock.tierCode).toBe('ILK5');
      expect(audit.data.data.priceLock.percentOff).toBe(70);
    });
  });
});
