import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenantOn } from '../src/lib/db';
import { envValue } from './helpers/dotenv';

/**
 * Tenant isolation is only observable through a role that is actually subject
 * to the policies. The default `fabrika` role is SUPERUSER + BYPASSRLS, so it
 * sees every row no matter what `app.tenant_id` says — asserting isolation
 * through it proves nothing.
 *
 * So: fixtures are written with the privileged singleton, and every assertion
 * is read back through DATABASE_URL_RLS_TEST (role `fabrika_app`, NOBYPASSRLS).
 * Create that role with `pnpm db:rls-role`.
 */
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');

describe('Row Level Security (RLS)', () => {
  let tenantA_Id: string;
  let tenantB_Id: string;
  let rls: PrismaClient;
  let ready = false;
  let skipReason = '';

  beforeAll(async () => {
    if (!RLS_URL) {
      skipReason =
        'DATABASE_URL_RLS_TEST is not set. Run `pnpm db:rls-role` to create the NOBYPASSRLS role.';
      console.warn(`RLS test skipped: ${skipReason}`);
      return;
    }

    try {
      await prisma.$connect();
      rls = createDbClient(RLS_URL);
      await rls.$connect();

      const tenantA = await prisma.tenant.create({
        data: { name: 'Tenant A', slug: `tenant-a-test-${Date.now()}`, country: 'TR', orgType: 'SME' },
      });
      const tenantB = await prisma.tenant.create({
        data: { name: 'Tenant B', slug: `tenant-b-test-${Date.now()}`, country: 'TR', orgType: 'SME' },
      });
      tenantA_Id = tenantA.id;
      tenantB_Id = tenantB.id;

      await prisma.workspace.create({
        data: { tenantId: tenantA_Id, name: 'Workspace A', slug: `ws-a-${Date.now()}` },
      });
      await prisma.workspace.create({
        data: { tenantId: tenantB_Id, name: 'Workspace B', slug: `ws-b-${Date.now()}` },
      });
      ready = true;
    } catch (e) {
      skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`RLS test skipped: ${skipReason}`);
      ready = false;
    }
  });

  afterAll(async () => {
    if (ready && tenantA_Id && tenantB_Id) {
      try {
        // Cascades to the two fixture workspaces. Only ids created above.
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantA_Id, tenantB_Id] } } });
      } catch {
        // ignore cleanup error
      }
    }
    await rls?.$disconnect().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  test('the test connection is genuinely subject to RLS', async (ctx) => {
    if (!ready) return ctx.skip();

    // Without this, every assertion below would pass vacuously.
    const [role] = await rls.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    expect(role).toBeDefined();
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
  });

  test('Tenant A cannot see Tenant B workspaces', async (ctx) => {
    if (!ready) return ctx.skip();

    await withTenantOn(rls, tenantA_Id, async (tx) => {
      const workspaces = await tx.workspace.findMany();
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]!.tenantId).toBe(tenantA_Id);
    });

    // And symmetrically, so a policy that simply hides everything cannot pass.
    await withTenantOn(rls, tenantB_Id, async (tx) => {
      const workspaces = await tx.workspace.findMany();
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]!.tenantId).toBe(tenantB_Id);
    });
  });

  test('queries outside the withTenant wrapper see no rows at all', async (ctx) => {
    if (!ready) return ctx.skip();

    // app.tenant_id is unset, so `"tenantId" = current_setting(...)` is NULL for
    // every row: the table reads as empty rather than leaking across tenants.
    const workspaces = await rls.workspace.findMany();
    expect(workspaces).toHaveLength(0);
  });

  test('writes are rejected when they target another tenant', async (ctx) => {
    if (!ready) return ctx.skip();

    // WITH CHECK on the tenant_isolation policy: A may not plant rows in B.
    await expect(
      withTenantOn(rls, tenantA_Id, async (tx) => {
        await tx.workspace.create({
          data: { tenantId: tenantB_Id, name: 'Smuggled', slug: `ws-smuggle-${Date.now()}` },
        });
      })
    ).rejects.toThrow();
  });
});
