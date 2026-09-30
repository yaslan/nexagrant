import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { DUAL_APPROVAL_DOCUMENT_KINDS } from '@/lib/rbac';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUNRAQA3OEZ83 — İNCELEME-59 Y-4 and Ö-5, measured in the table.
 *
 * A WRITER called `signDocument` on an NDA and `FollowupDoc.signedAt` was
 * written with no finance or legal sign-off at all (se-fb H6, live). The owner
 * decided on 30.09.2026: a kind in `DUAL_APPROVAL_DOCUMENT_KINDS` is signed by
 * the dual approval flow only. Every refusal here is checked against the row,
 * not just the return value, and the two counterfactual arms (a finished flow,
 * a kind without dual approval) keep an action that signs nothing from passing.
 *
 * Only `auth()` is faked — it is the session a JWT would produce. The role gate
 * in `requireTenantAction`, the pilot gate, `withTenant`, Prisma and the action
 * bodies are real. Runs as the app's own BYPASSRLS role: the check under test is
 * the action's, and RLS has nothing to say about a same-tenant signature.
 */

const s = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => s.session) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const m10 = await import('@/modules/m10/server/actions');

const dbReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

if (dbReachable) await assertAppOwnerRole(prisma, 'm10 signDocument dual approval live test');
else skipOrFailInCi('m10 signDocument dual approval live test', 'Postgres is unreachable (`docker compose up -d`)');

const TAG = `m10sign-${Date.now()}`;
const fx: { tenantId?: string; otherTenantId?: string; opportunityId?: string; otherOpportunityId?: string } = {};

function actingAs(role: string, userId: string, tenantId = fx.tenantId) {
  s.session = { user: { id: userId, name: `${TAG} ${role}`, email: `${role.toLowerCase()}@${TAG}.test` }, tenantId, role };
}
const asWriter = () => actingAs('WRITER', `${TAG}-writer`);

async function newDoc(kind: string, opportunityId = fx.opportunityId, tenantId = fx.tenantId) {
  return prisma.followupDoc.create({
    data: { tenantId: requireId(tenantId, 'tenantId'), opportunityId: requireId(opportunityId, 'opportunityId'), kind },
  });
}

/** The row as Postgres has it — what the refusal must leave untouched. */
async function row(id: string) {
  return prisma.followupDoc.findUnique({
    where: { id },
    select: { signedAt: true, version: true, approvalSubmittedAt: true, approvalSteps: { select: { id: true } } },
  });
}

async function createTenant(suffix: string) {
  const tenant = await prisma.tenant.create({ data: { name: `${TAG} ${suffix}`, slug: `${TAG}-${suffix}`, country: 'TR' } });
  const ws = await prisma.workspace.create({ data: { tenantId: tenant.id, name: `${TAG} ws`, slug: `${TAG}-ws-${suffix}` } });
  const opp = await prisma.opportunity.create({ data: { tenantId: tenant.id, workspaceId: ws.id, title: `${TAG} opp` } });
  return { tenantId: tenant.id, opportunityId: opp.id };
}

describe.skipIf(!dbReachable)('signDocument and the dual approval flow, live DB', () => {
  beforeAll(async () => {
    const a = await createTenant('a');
    const b = await createTenant('b');
    fx.tenantId = a.tenantId;
    fx.opportunityId = a.opportunityId;
    fx.otherTenantId = b.tenantId;
    fx.otherOpportunityId = b.opportunityId;
  });

  afterAll(async () => {
    // One id per delete; the tenant cascade takes its workspace, opportunity and docs.
    for (const id of [fx.tenantId, fx.otherTenantId]) {
      if (id) await prisma.tenant.delete({ where: { id: requireId(id, 'tenantId') } });
    }
  });

  test.each([...DUAL_APPROVAL_DOCUMENT_KINDS])(
    'WRITER cannot sign a %s that never entered the flow; the row is unchanged',
    async (kind) => {
      const doc = await newDoc(kind);
      const before = await row(doc.id);

      asWriter();
      const res = await m10.signDocument(doc.id);

      expect(res).toEqual({ success: false, signedAt: null, refusal: 'DUAL_APPROVAL_REQUIRED' });
      expect(await row(doc.id)).toEqual(before);
      expect(before?.signedAt).toBeNull();
    }
  );

  test('WRITER cannot sign an NDA whose flow stopped after finance; the row is unchanged', async () => {
    const doc = await newDoc('NDA');
    actingAs('WRITER', `${TAG}-writer`);
    expect((await m10.submitDualApprovalAction(doc.id)).success).toBe(true);
    actingAs('TENANT_ADMIN', `${TAG}-finance`);
    const fin = await m10.departmentApproveAction(doc.id, 'FINANCE');
    expect(fin.success && fin.approvalState.stage).toBe('PENDING_LEGAL_APPROVAL');
    const before = await row(doc.id);

    asWriter();
    const res = await m10.signDocument(doc.id);

    expect(res).toEqual({ success: false, signedAt: null, refusal: 'DUAL_APPROVAL_REQUIRED' });
    expect(await row(doc.id)).toEqual(before);
    expect(before?.signedAt).toBeNull();
    expect(before?.approvalSteps).toHaveLength(1);
  });

  test('once the flow is APPROVED_AND_SIGNED the signature goes through and keeps the flow timestamp', async () => {
    const doc = await newDoc('NDA');
    asWriter();
    await m10.submitDualApprovalAction(doc.id);
    actingAs('TENANT_ADMIN', `${TAG}-finance`);
    await m10.departmentApproveAction(doc.id, 'FINANCE');
    actingAs('TENANT_OWNER', `${TAG}-legal`);
    const legal = await m10.departmentApproveAction(doc.id, 'LEGAL');
    expect(legal.success && legal.approvalState.stage).toBe('APPROVED_AND_SIGNED');
    const flowSignedAt = (await row(doc.id))?.signedAt;
    expect(flowSignedAt).toBeInstanceOf(Date);

    asWriter();
    const res = await m10.signDocument(doc.id);

    expect(res.success).toBe(true);
    expect(res.signedAt?.getTime()).toBe(flowSignedAt!.getTime());
    expect((await row(doc.id))?.signedAt?.getTime()).toBe(flowSignedAt!.getTime());
  });

  test('a kind without dual approval (ESR_DEBRIEF) is signed directly, as before', async () => {
    const doc = await newDoc('ESR_DEBRIEF');
    expect((await row(doc.id))?.signedAt).toBeNull();

    asWriter();
    const res = await m10.signDocument(doc.id);

    expect(res.success).toBe(true);
    const stored = (await row(doc.id))?.signedAt;
    expect(stored).toBeInstanceOf(Date);
    expect(res.signedAt?.getTime()).toBe(stored!.getTime());
  });

  test("a refusal carries no timestamp (Ö-5): another tenant's doc id is not found and not signed", async () => {
    const foreign = await newDoc('ESR_DEBRIEF', fx.otherOpportunityId, fx.otherTenantId);

    asWriter();
    const res = await m10.signDocument(foreign.id);

    expect(res).toEqual({ success: false, signedAt: null, refusal: 'DOC_NOT_FOUND' });
    expect((await row(foreign.id))?.signedAt).toBeNull();
  });
});
