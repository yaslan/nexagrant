import { suiteHasDatabase } from './helpers/database-availability';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenantOn } from '../src/lib/db';
import { envValue } from './helpers/dotenv';
import { requireId } from './helpers/teardown-guard';
import { skipOrFailInCi } from './helpers/live-db-role';

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

const HAS_DB = await suiteHasDatabase('rls.spec');

describe.skipIf(!HAS_DB)('Row Level Security (RLS)', () => {
  let tenantA_Id: string;
  let tenantB_Id: string;
  let workspaceA_Id: string;
  let rls: PrismaClient;
  let ready = false;
  let skipReason = '';

  beforeAll(async () => {
    if (!RLS_URL) {
      skipReason =
        'DATABASE_URL_RLS_TEST is not set. Run `pnpm db:rls-role` to create the NOBYPASSRLS role.';
      skipOrFailInCi('RLS test', skipReason);
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

      const wsA = await prisma.workspace.create({
        data: { tenantId: tenantA_Id, name: 'Workspace A', slug: `ws-a-${Date.now()}` },
      });
      workspaceA_Id = wsA.id;
      await prisma.workspace.create({
        data: { tenantId: tenantB_Id, name: 'Workspace B', slug: `ws-b-${Date.now()}` },
      });
      ready = true;
    } catch (e) {
      skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
      ready = false;
      // In CI this throws: a failed fixture there is a broken setup, not a skip.
      skipOrFailInCi('RLS test', skipReason);
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

  test("tenant B cannot see tenant A's dual approval steps", async (ctx) => {
    if (!ready) return ctx.skip();

    // TASK-MTSAIWF4ENUSL — the M10 approval steps became rows, and a row that
    // names who signed a consortium document is exactly the kind of record that
    // must not cross a tenant boundary. Fixtures are written with the privileged
    // client; both reads go through the NOBYPASSRLS role.
    const oppA = await prisma.opportunity.create({
      data: { tenantId: tenantA_Id, workspaceId: workspaceA_Id, title: 'RLS approval fixture' },
    });
    const docA = await prisma.followupDoc.create({
      data: {
        tenantId: tenantA_Id,
        opportunityId: oppA.id,
        kind: 'NDA',
        approvalSubmittedAt: new Date(),
        approvalSubmittedById: 'rls-user-a',
        approvalSubmittedByName: 'RLS Submitter A',
      },
    });
    await prisma.dualApprovalStep.create({
      data: {
        tenantId: tenantA_Id,
        followupDocId: docA.id,
        department: 'FINANCE',
        actorUserId: 'rls-user-a2',
        actorName: 'RLS Finance A',
      },
    });

    await withTenantOn(rls, tenantA_Id, async (tx) => {
      const steps = await tx.dualApprovalStep.findMany();
      expect(steps).toHaveLength(1);
      expect(steps[0]!.actorName).toBe('RLS Finance A');
    });

    // B holds a valid session for its own tenant and still sees nothing of A's.
    await withTenantOn(rls, tenantB_Id, async (tx) => {
      expect(await tx.dualApprovalStep.findMany()).toHaveLength(0);
      expect(await tx.dualApprovalStep.findMany({ where: { followupDocId: docA.id } })).toHaveLength(
        0
      );
    });
  });

  test('the four-eyes rules are enforced by the database, not only by the app', async (ctx) => {
    if (!ready) return ctx.skip();

    const opp = await prisma.opportunity.create({
      data: { tenantId: tenantA_Id, workspaceId: workspaceA_Id, title: 'Four-eyes fixture' },
    });
    const doc = await prisma.followupDoc.create({
      data: { tenantId: tenantA_Id, opportunityId: opp.id, kind: 'LOI' },
    });
    const step = {
      tenantId: tenantA_Id,
      followupDocId: doc.id,
      actorUserId: 'four-eyes-bob',
      actorName: 'Bob',
    };

    await prisma.dualApprovalStep.create({ data: { ...step, department: 'FINANCE' } });

    // Same person, the other department: the unique index refuses it even if a
    // caller reached the write without going through the action.
    await expect(
      prisma.dualApprovalStep.create({ data: { ...step, department: 'LEGAL' } })
    ).rejects.toThrow();

    // Same department, another person: refused too.
    await expect(
      prisma.dualApprovalStep.create({
        data: { ...step, actorUserId: 'four-eyes-carol', actorName: 'Carol', department: 'FINANCE' },
      })
    ).rejects.toThrow();
  });

  test("tenant B can neither read nor decide tenant A's approval requests", async (ctx) => {
    if (!ready) return ctx.skip();

    // AKTAR-MURBCJ0A-1 — the approvals screen writes ApprovalRequest rows now.
    // The action filters by tenantId; this is the policy behind that filter,
    // measured through the NOBYPASSRLS role.
    const requester = await prisma.user.create({
      data: { email: `rls-approval-${Date.now()}@fabrika.test`, name: 'RLS Requester A' },
    });
    try {
      const req = await prisma.approvalRequest.create({
        data: {
          tenantId: tenantA_Id,
          actionType: 'BUDGET_ALLOCATION',
          title: 'RLS approval request fixture',
          payload: {},
          requesterId: requester.id,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });

      await withTenantOn(rls, tenantA_Id, async (tx) => {
        expect((await tx.approvalRequest.findMany()).map((r) => r.id)).toEqual([req.id]);
      });

      await withTenantOn(rls, tenantB_Id, async (tx) => {
        expect(await tx.approvalRequest.findMany()).toHaveLength(0);
        const { count } = await tx.approvalRequest.updateMany({
          where: { id: requireId(req.id, 'req.id'), status: 'PENDING' },
          data: { status: 'APPROVED' },
        });
        expect(count).toBe(0);
      });
      expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('PENDING');

      // WITH CHECK: B may not plant a request into A.
      await expect(
        withTenantOn(rls, tenantB_Id, async (tx) => {
          await tx.approvalRequest.create({
            data: {
              tenantId: tenantA_Id,
              actionType: 'BUDGET_ALLOCATION',
              title: 'Smuggled request',
              payload: {},
              requesterId: requester.id,
              expiresAt: new Date(Date.now() + 3600_000),
            },
          });
        })
      ).rejects.toThrow();
    } finally {
      // Cascades to the fixture request.
      await prisma.user.delete({ where: { id: requester.id } });
    }
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
