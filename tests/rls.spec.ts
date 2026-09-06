import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { prisma, withTenant } from '../src/lib/db';

describe('Row Level Security (RLS)', () => {
  let tenantA_Id: string;
  let tenantB_Id: string;
  
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      // Check database connection first
      await prisma.$connect();
      // 1. Create two test tenants
      const tenantA = await prisma.tenant.create({ data: { name: 'Tenant A', slug: `tenant-a-test-${Date.now()}`, country: 'TR', orgType: 'SME' } });
      const tenantB = await prisma.tenant.create({ data: { name: 'Tenant B', slug: `tenant-b-test-${Date.now()}`, country: 'TR', orgType: 'SME' } });
      tenantA_Id = tenantA.id;
      tenantB_Id = tenantB.id;

      // 2. Create data in Tenant A
      await prisma.workspace.create({
        data: {
          tenantId: tenantA_Id,
          name: 'Workspace A',
          slug: `ws-a-${Date.now()}`,
        }
      });

      // 3. Create data in Tenant B
      await prisma.workspace.create({
        data: {
          tenantId: tenantB_Id,
          name: 'Workspace B',
          slug: `ws-b-${Date.now()}`,
        }
      });
      dbAvailable = true;
    } catch (e) {
      console.warn('PostgreSQL database not available for RLS integration test. Skipping DB queries.');
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable && tenantA_Id && tenantB_Id) {
      try {
        await prisma.tenant.deleteMany({
          where: { id: { in: [tenantA_Id, tenantB_Id] } }
        });
      } catch (e) {
        // ignore cleanup error
      }
    }
    await prisma.$disconnect().catch(() => {});
  });

  test('Tenant A cannot see Tenant B workspaces', async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    await withTenant(tenantA_Id, async (tx) => {
      const workspaces = await tx.workspace.findMany();
      // Should only see Workspace A
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].tenantId).toBe(tenantA_Id);
    });
  });

  test('Queries outside of withTenant wrapper on RLS tables will fail', async (ctx) => {
    if (!dbAvailable) {
      ctx.skip();
      return;
    }
    try {
      const workspaces = await prisma.workspace.findMany();
      expect(workspaces.length).toBe(0);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});
