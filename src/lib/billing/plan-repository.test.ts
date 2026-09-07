import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import {
  getPublishedVersion,
  listPublicPlans,
  plansVisibleToTenant,
  getVersionById,
} from './plan-repository';

describe('Plan Repository', () => {
  let testTenantId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Plan Test Tenant',
        slug: `plan-test-${Date.now()}`,
        country: 'TR',
        orgType: 'SME',
      },
    });
    testTenantId = tenant.id;

    // Create test plan
    const plan = await prisma.plan.create({
      data: {
        id: `plan-test-${Date.now()}`,
        name: 'Test Plan',
        monthlyCents: 9900,
        yearlyCents: 99000,
        currency: 'USD',
        seats: 5,
        workspaces: 2,
        aiCreditsMonthly: 100,
        modules: ['M1', 'M3'],
        visibility: 'public',
      },
    });
    testPlanId = plan.id;
  });

  afterEach(async () => {
    // This suite writes into the dev database. Left uncleaned, its rows show up
    // as real plans on the admin plan screen — 60 of them after a dozen runs.
    // The prefixes are every `id:` literal the cases below create.
    const PLAN_PREFIXES = ['plan-test-', 'private-', 'assigned-', 'other-', 'pub-', 'fetch-'];
    for (const prefix of PLAN_PREFIXES) {
      await prisma.planAssignment.deleteMany({ where: { planId: { startsWith: prefix } } });
      await prisma.planVersion.deleteMany({ where: { planId: { startsWith: prefix } } });
      await prisma.plan.deleteMany({ where: { id: { startsWith: prefix } } });
    }
    await prisma.planAssignment.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  });

  describe('getPublishedVersion', () => {
    it('should fetch the published version of a plan', async () => {
      const version = await prisma.planVersion.create({
        data: {
          id: `version-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'published',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1', 'M3'],
          publishedAt: new Date(),
        },
      });

      const result = await getPublishedVersion(testPlanId);
      expect(result.id).toBe(version.id);
      expect(result.version).toBe(1);
      expect(result.version).toBe(1);
    });

    it('should return highest version when multiple published versions exist', async () => {
      await prisma.planVersion.create({
        data: {
          id: `v1-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'published',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      const v2 = await prisma.planVersion.create({
        data: {
          id: `v2-${Date.now()}`,
          planId: testPlanId,
          version: 2,
          status: 'published',
          monthlyCents: 12900,
          yearlyCents: 129000,
          currency: 'USD',
          seats: 10,
          workspaces: 3,
          aiCreditsMonthly: 200,
          modules: ['M1', 'M3'],
          publishedAt: new Date(),
        },
      });

      const result = await getPublishedVersion(testPlanId);
      expect(result.version).toBe(2);
      expect(result.id).toBe(v2.id);
    });

    it('should throw if no published version exists', async () => {
      await prisma.planVersion.create({
        data: {
          id: `draft-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'draft',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1'],
        },
      });

      await expect(getPublishedVersion(testPlanId)).rejects.toThrow();
    });
  });

  describe('listPublicPlans', () => {
    it('should list only public plans', async () => {
      await prisma.planVersion.create({
        data: {
          id: `pub-version-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'published',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      const result = await listPublicPlans();
      const found = result.find((p) => p.plan.id === testPlanId);
      expect(found).toBeDefined();
      expect(found?.plan.visibility).toBe('public');
    });

    it('should exclude private plans', async () => {
      const privatePlan = await prisma.plan.create({
        data: {
          id: `private-${Date.now()}`,
          name: 'Private Plan',
          monthlyCents: 19900,
          yearlyCents: 199000,
          currency: 'USD',
          seats: 10,
          workspaces: 5,
          aiCreditsMonthly: 500,
          modules: ['M1', 'M8'],
          visibility: 'private',
        },
      });

      await prisma.planVersion.create({
        data: {
          id: `priv-version-${Date.now()}`,
          planId: privatePlan.id,
          version: 1,
          status: 'published',
          monthlyCents: 19900,
          yearlyCents: 199000,
          currency: 'USD',
          seats: 10,
          workspaces: 5,
          aiCreditsMonthly: 500,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      const result = await listPublicPlans();
      const found = result.find((p) => p.plan.id === privatePlan.id);
      expect(found).toBeUndefined();
    });
  });

  describe('plansVisibleToTenant', () => {
    it('should return public plans to all tenants', async () => {
      await prisma.planVersion.create({
        data: {
          id: `pub-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'published',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      const result = await plansVisibleToTenant(testTenantId);
      const found = result.find((p) => p.plan.id === testPlanId);
      expect(found).toBeDefined();
    });

    it('should return assigned private plans to tenant', async () => {
      const privatePlan = await prisma.plan.create({
        data: {
          id: `assigned-${Date.now()}`,
          name: 'Assigned Plan',
          monthlyCents: 15000,
          yearlyCents: 150000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 200,
          modules: ['M1'],
          visibility: 'private',
        },
      });

      await prisma.planVersion.create({
        data: {
          id: `assigned-version-${Date.now()}`,
          planId: privatePlan.id,
          version: 1,
          status: 'published',
          monthlyCents: 15000,
          yearlyCents: 150000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 200,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      await prisma.planAssignment.create({
        data: {
          id: `assign-${Date.now()}`,
          planId: privatePlan.id,
          tenantId: testTenantId,
        },
      });

      const result = await plansVisibleToTenant(testTenantId);
      const found = result.find((p) => p.plan.id === privatePlan.id);
      expect(found).toBeDefined();
      expect(found?.plan.visibility).toBe('private');
    });

    it('should not return unassigned private plans', async () => {
      const otherPlan = await prisma.plan.create({
        data: {
          id: `other-${Date.now()}`,
          name: 'Other Private Plan',
          monthlyCents: 25000,
          yearlyCents: 250000,
          currency: 'USD',
          seats: 10,
          workspaces: 5,
          aiCreditsMonthly: 500,
          modules: ['M1', 'M8'],
          visibility: 'private',
        },
      });

      await prisma.planVersion.create({
        data: {
          id: `other-version-${Date.now()}`,
          planId: otherPlan.id,
          version: 1,
          status: 'published',
          monthlyCents: 25000,
          yearlyCents: 250000,
          currency: 'USD',
          seats: 10,
          workspaces: 5,
          aiCreditsMonthly: 500,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      const result = await plansVisibleToTenant(testTenantId);
      const found = result.find((p) => p.plan.id === otherPlan.id);
      expect(found).toBeUndefined();
    });
  });

  describe('getVersionById', () => {
    it('should fetch a specific version by ID', async () => {
      const version = await prisma.planVersion.create({
        data: {
          id: `fetch-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'published',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1'],
          publishedAt: new Date(),
        },
      });

      const result = await getVersionById(version.id);
      expect(result?.id).toBe(version.id);
      expect(result?.status).toBe('published');
    });

    it('should return null for draft versions', async () => {
      const version = await prisma.planVersion.create({
        data: {
          id: `draft-fetch-${Date.now()}`,
          planId: testPlanId,
          version: 1,
          status: 'draft',
          monthlyCents: 9900,
          yearlyCents: 99000,
          currency: 'USD',
          seats: 5,
          workspaces: 2,
          aiCreditsMonthly: 100,
          modules: ['M1'],
        },
      });

      const result = await getVersionById(version.id);
      expect(result).toBeNull();
    });
  });
});
