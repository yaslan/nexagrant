import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { databaseReachable } from './helpers/database-availability';
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
 *
 * TASK-MUNTFQ8Q5Z9UM — İNCELEME-65 B-1/D-1/D-2. `generateStandardDoc` also runs
 * here; for it the module gate and the LLM text are faked too (the tenant has no
 * M10 subscription and there is no model key), and the LLM spy is how "refused
 * before the credit is spent" is measured.
 */

const s = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => s.session) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/modules/access', async (orig) => ({ ...(await orig<object>()), assertModuleAccess: vi.fn(async () => {}) }));
const llm = vi.hoisted(() => ({ generateText: vi.fn(async () => 'GİZLİLİK SÖZLEŞMESİ (NDA) — taraflar …') }));
vi.mock('@/lib/llm', async (orig) => ({ ...(await orig<object>()), generateText: llm.generateText }));

const m10 = await import('@/modules/m10/server/actions');

const dbReachable = await databaseReachable();

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

/** An NDA-family doc taken through finance and legal: APPROVED_AND_SIGNED. */
async function fullyApproved(kind: string) {
  const doc = await newDoc(kind);
  asWriter();
  expect((await m10.submitDualApprovalAction(doc.id)).success).toBe(true);
  actingAs('TENANT_ADMIN', `${TAG}-finance`);
  await m10.departmentApproveAction(doc.id, 'FINANCE');
  actingAs('TENANT_OWNER', `${TAG}-legal`);
  const legal = await m10.departmentApproveAction(doc.id, 'LEGAL');
  expect(legal.success && legal.approvalState.stage).toBe('APPROVED_AND_SIGNED');
  return doc;
}

/** Every doc of the test tenant — what a refused generation must not grow. */
const tenantDocIds = async () =>
  (await prisma.followupDoc.findMany({ where: { tenantId: requireId(fx.tenantId, 'tenantId') }, select: { id: true } })).map((d) => d.id);

// The spellings crw-fb generated and signed with no approval (İNCELEME-65 A1),
// a Cyrillic А (U+0410) homoglyph, and a kind nobody knows.
const NDA_VARIANTS = ['nda', 'Nda', 'NDA ', ' NDA', 'loi', 'Commitment', 'NDA\u200B'];
const STORED_VARIANTS = [...NDA_VARIANTS, 'ND\u0410', 'CONTRACT'];

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

  // Written out, not spread from the module: an emptied list must fail here,
  // not make these cases vanish (İNCELEME-65 D-1, mutant M2 went 33 → 30).
  test('the dual approval kinds are NDA, LOI and COMMITMENT', () => {
    expect(DUAL_APPROVAL_DOCUMENT_KINDS).toEqual(['NDA', 'LOI', 'COMMITMENT']);
  });

  test.each(['NDA', 'LOI', 'COMMITMENT'])(
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
  describe('İNCELEME-65 B-1: the kind is a closed list, and the gate is fail-closed', () => {
    test.each(NDA_VARIANTS)('generateStandardDoc refuses the kind %j before the LLM; no row is written', async (kind) => {
      const before = await tenantDocIds();
      llm.generateText.mockClear();

      asWriter();
      // The type forbids it; a hand-made Next-Action POST does not.
      const err = await m10.generateStandardDoc(requireId(fx.opportunityId, 'opportunityId'), kind as 'NDA').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/Unknown document kind/);
      expect(llm.generateText).not.toHaveBeenCalled();
      expect(await tenantDocIds()).toEqual(before);
    });

    test('counterfactual: generateStandardDoc still writes an exact NDA, which then needs the flow', async () => {
      llm.generateText.mockClear();
      asWriter();
      const gen = await m10.generateStandardDoc(requireId(fx.opportunityId, 'opportunityId'), 'NDA');

      expect(llm.generateText).toHaveBeenCalledTimes(1);
      expect(gen.kind).toBe('NDA');
      expect(await m10.signDocument(gen.id)).toEqual({ success: false, signedAt: null, refusal: 'DUAL_APPROVAL_REQUIRED' });
      expect((await row(gen.id))?.signedAt).toBeNull();
    });

    test.each(STORED_VARIANTS)('a row already stored as %j is not signed directly; the row is unchanged', async (kind) => {
      const doc = await newDoc(kind);
      const before = await row(doc.id);

      asWriter();
      const res = await m10.signDocument(doc.id);

      expect(res).toEqual({ success: false, signedAt: null, refusal: 'DUAL_APPROVAL_REQUIRED' });
      expect(await row(doc.id)).toEqual(before);
    });

    test('a variant row taken through the flow is signed with the legal timestamp', async () => {
      const doc = await fullyApproved('nda');
      const legalAt = (await row(doc.id))!.signedAt!.getTime();

      asWriter();
      const res = await m10.signDocument(doc.id);

      expect(res.success).toBe(true);
      expect(res.signedAt?.getTime()).toBe(legalAt);
    });
  });

  // İNCELEME-65 D-2: the `version` pin had only a shape check behind it. This is
  // crw-fb's A2: signDocument reads the approved NDA, then blocks on its UPDATE
  // while another transaction writes what createNewVersion writes. Without the
  // pin the new revision is signed on the old approvals.
  test('a revision committed between the read and the write is not signed on the old approvals', async () => {
    const doc = await fullyApproved('NDA');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FollowupDoc" WHERE id = ${doc.id} FOR UPDATE`;
        locked();
        await gate;
        // What createNewVersion writes (src/modules/m10/server/actions.ts), in the same order.
        await tx.dualApprovalStep.deleteMany({ where: { followupDocId: requireId(doc.id, 'docId'), tenantId: requireId(fx.tenantId, 'tenantId') } });
        await tx.followupDoc.update({
          where: { id: doc.id },
          data: { version: { increment: 1 }, signedAt: null, approvalSubmittedAt: null, approvalSubmittedById: null, approvalSubmittedByName: null },
        });
      },
      { timeout: 20_000 }
    );
    await isLocked;

    asWriter();
    const signing = m10.signDocument(doc.id);
    // Until signDocument is queued behind the lock; else the test proves nothing.
    let waiting = 0;
    for (let i = 0; i < 50 && waiting === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const rows = await prisma.$queryRaw<{ n: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%FollowupDoc%'`
      );
      waiting = Number(rows[0]?.n ?? 0);
    }
    release();
    await holder;
    const res = await signing;

    expect(waiting).toBeGreaterThan(0);
    expect(res).toEqual({ success: false, signedAt: null, refusal: 'DOC_NOT_FOUND' });
    const after = await row(doc.id);
    expect(after?.version).toBe(2);
    expect(after?.signedAt).toBeNull();
    expect(after?.approvalSteps).toEqual([]);
  }, 30_000);
});
