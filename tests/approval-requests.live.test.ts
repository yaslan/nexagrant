import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * AKTAR-MURBCJ0A-1 (cae-fb K-2) — the approvals screen (Onay Merkezi) writes to
 * `ApprovalRequest`, and its four-eyes rules are the server's, measured in the
 * table.
 *
 * Before this card `createApprovalRequest` returned `{ id: 'req-<now>' }` and
 * wrote nothing, and approve / reject / cancel answered `success: true` for any
 * id, any caller, any tenant. Every case below reads the row back from Postgres:
 * a refusal must leave it untouched, an acceptance must have written it.
 *
 * Only `auth()` is faked — it is the session a JWT would produce. The role gate
 * in `requireTenantAction`, the pilot gate, `withTenant`, Prisma and the action
 * bodies are real. Runs as the app's own BYPASSRLS role (`assertAppOwnerRole`):
 * the guard under test is the action's own `tenantId` filter; the RLS policy
 * behind it is measured by `pnpm rls:verify`.
 */

const s = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => s.session) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const approvals = await import('@/app/[locale]/(app)/[workspace]/approvals/actions');

const dbReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

if (dbReachable) await assertAppOwnerRole(prisma, 'approval requests live test');
else skipOrFailInCi('approval requests live test', 'Postgres is unreachable (`docker compose up -d`)');

const TAG = `aprq-${Date.now()}`;

type Who = 'requester' | 'admin' | 'owner1' | 'owner2' | 'otherAdmin';
const ROLE_OF: Record<Who, string> = {
  requester: 'WRITER',
  admin: 'TENANT_ADMIN',
  owner1: 'TENANT_OWNER',
  owner2: 'TENANT_OWNER',
  otherAdmin: 'TENANT_ADMIN',
};
const fx: { tenantId?: string; otherTenantId?: string; users: Partial<Record<Who, string>> } = { users: {} };

function as(who: Who) {
  const id = requireId(fx.users[who], who);
  const tenantId = who === 'otherAdmin' ? fx.otherTenantId : fx.tenantId;
  s.session = { user: { id, name: `${TAG} ${who}`, email: `${who}@${TAG}.test` }, tenantId, role: ROLE_OF[who] };
}

/** The row as Postgres has it. */
async function row(id: string) {
  return prisma.approvalRequest.findUnique({
    where: { id },
    select: { status: true, approverId: true, rejectionReason: true, requesterId: true, tenantId: true },
  });
}

const auditOf = (target: string) =>
  prisma.auditEvent.findMany({ where: { target }, select: { type: true, actorId: true, tenantId: true }, orderBy: { createdAt: 'asc' } });

const tenantRowCount = () => prisma.approvalRequest.count({ where: { tenantId: requireId(fx.tenantId, 'tenantId') } });

/** A request opened through the real action, as `who`. */
async function open(who: Who = 'requester', actionType: 'BUDGET_ALLOCATION' | 'LEGAL_COMMITMENT' = 'BUDGET_ALLOCATION') {
  as(who);
  const res = (await approvals.submitApprovalRequestAction({
    actionType,
    title: `${TAG} ${actionType}`,
    description: 'canlı test',
    payload: { amount: 1000 },
  })) as { ok?: boolean; request?: { id: string } };
  expect(res.ok).toBe(true);
  return requireId(res.request?.id, 'request id');
}

describe.skipIf(!dbReachable)('approvals: four-eyes rules against the database', () => {
  beforeAll(async () => {
    const a = await prisma.tenant.create({ data: { name: `${TAG} a`, slug: `${TAG}-a`, country: 'TR' } });
    const b = await prisma.tenant.create({ data: { name: `${TAG} b`, slug: `${TAG}-b`, country: 'TR' } });
    fx.tenantId = a.id;
    fx.otherTenantId = b.id;
    for (const who of Object.keys(ROLE_OF) as Who[]) {
      const u = await prisma.user.create({ data: { email: `${who}@${TAG}.test`, name: `${TAG} ${who}` } });
      fx.users[who] = u.id;
    }
  });

  afterAll(async () => {
    // The tenant cascade takes its requests and audit events; then the users.
    for (const id of presentIds([fx.tenantId, fx.otherTenantId])) await prisma.tenant.delete({ where: { id } });
    for (const id of presentIds(Object.values(fx.users))) await prisma.user.delete({ where: { id } });
  });

  test('create writes exactly one row and one approval.requested audit event; the page lists it', async () => {
    const before = await tenantRowCount();
    const id = await open();

    expect(await tenantRowCount()).toBe(before + 1);
    const stored = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({
      tenantId: fx.tenantId,
      requesterId: fx.users.requester,
      status: 'PENDING',
      requiredRole: 'TENANT_ADMIN',
      actionType: 'BUDGET_ALLOCATION',
      payload: { amount: 1000 },
      approverId: null,
    });
    expect(stored.auditHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(48 * 3600_000);
    expect(await auditOf(id)).toEqual([{ type: 'approval.requested', actorId: fx.users.requester, tenantId: fx.tenantId }]);

    const { listApprovalRequests } = await import('@/lib/approval-requests');
    expect((await listApprovalRequests(requireId(fx.tenantId, 'tenantId'))).map((r) => r.id)).toContain(id);
  });

  test('create refuses bad input on the server and writes nothing', async () => {
    as('requester');
    const before = await tenantRowCount();
    const base = { actionType: 'BUDGET_ALLOCATION' as const, title: 't', payload: {} };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, title: '   ' }, 'titleRequired'],
      [{ ...base, title: 'x'.repeat(201) }, 'titleTooLong'],
      [{ ...base, description: 'x'.repeat(2001) }, 'descriptionTooLong'],
      [{ ...base, payload: [1, 2] }, 'invalidPayload'],
      [{ ...base, payload: { blob: 'x'.repeat(10_001) } }, 'payloadTooLarge'],
      [{ ...base, actionType: 'DROP_TABLES' }, 'invalidActionType'],
      // LEGAL_COMMITMENT needs an owner; the requester may not lower that to an admin.
      [{ ...base, actionType: 'LEGAL_COMMITMENT', requiredRole: 'TENANT_ADMIN' }, 'invalidRequiredRole'],
      [{ ...base, expiresInHours: 0 }, 'invalidExpiry'],
      [{ ...base, expiresInHours: 24 * 31 }, 'invalidExpiry'],
      [{ ...base, workspaceId: 'not-a-workspace' }, 'invalidWorkspace'],
    ];
    for (const [input, error] of cases) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request body is untyped on the wire
      expect(await approvals.submitApprovalRequestAction(input as any), error).toEqual({ ok: false, error });
    }
    expect(await tenantRowCount()).toBe(before);
  });

  test('four eyes: the requester cannot approve or reject their own request; the row is unchanged', async () => {
    const id = await open('owner1');
    as('owner1');
    expect(await approvals.approveRequestAction(id)).toEqual({ ok: false, error: 'selfApproval' });
    expect(await approvals.rejectRequestAction(id, 'kendi talebim')).toEqual({ ok: false, error: 'selfApproval' });
    expect(await row(id)).toMatchObject({ status: 'PENDING', approverId: null, rejectionReason: null });
    expect((await auditOf(id)).map((e) => e.type)).toEqual(['approval.requested']);
  });

  test('required role: an admin cannot approve an owner-level request; an owner can, and it stays APPROVED', async () => {
    const id = await open('requester', 'LEGAL_COMMITMENT');
    expect((await row(id))?.status).toBe('PENDING');

    as('admin');
    expect(await approvals.approveRequestAction(id)).toEqual({ ok: false, error: 'insufficientRole' });
    expect(await approvals.rejectRequestAction(id, 'hayır')).toEqual({ ok: false, error: 'insufficientRole' });
    expect(await row(id)).toMatchObject({ status: 'PENDING', approverId: null });

    as('owner1');
    const res = await approvals.approveRequestAction(id);
    expect(res.ok).toBe(true);
    expect(await row(id)).toMatchObject({ status: 'APPROVED', approverId: fx.users.owner1 });
    expect((await auditOf(id)).map((e) => [e.type, e.actorId])).toEqual([
      ['approval.requested', fx.users.requester],
      ['approval.approved', fx.users.owner1],
    ]);

    // Decided once: a second decision is refused and changes nothing.
    as('owner2');
    expect(await approvals.rejectRequestAction(id, 'geç kaldım')).toEqual({ ok: false, error: 'notPending' });
    expect(await row(id)).toMatchObject({ status: 'APPROVED', approverId: fx.users.owner1, rejectionReason: null });
  });

  test('race: two owners approve at the same moment — exactly one wins, the row names the winner', async () => {
    for (let round = 0; round < 5; round++) {
      const id = await open();
      // auth() is read synchronously at the call, so each promise carries its own session.
      as('owner1');
      const p1 = approvals.approveRequestAction(id);
      as('owner2');
      const p2 = approvals.approveRequestAction(id);
      const results = await Promise.all([p1, p2]);

      const winners = results.filter((r) => r.ok);
      expect(winners, `round ${round}`).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'notPending' }]);
      const winner = results[0]!.ok ? fx.users.owner1 : fx.users.owner2;
      expect(await row(id)).toMatchObject({ status: 'APPROVED', approverId: winner });
      expect((await auditOf(id)).filter((e) => e.type === 'approval.approved')).toHaveLength(1);
    }
  });

  test('race: approve and reject at the same moment — one decision, never both', async () => {
    const id = await open();
    as('owner1');
    const p1 = approvals.approveRequestAction(id);
    as('admin');
    const p2 = approvals.rejectRequestAction(id, 'aynı anda ret');
    const results = await Promise.all([p1, p2]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const stored = await row(id);
    expect(stored?.status).toBe(results[0]!.ok ? 'APPROVED' : 'REJECTED');
    expect(
      (await auditOf(id)).filter((e) => e.type === 'approval.approved' || e.type === 'approval.rejected')
    ).toHaveLength(1);
  });

  test('expired: an approval past expiresAt is refused and the row becomes EXPIRED', async () => {
    const id = await open();
    await prisma.approvalRequest.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    as('owner1');
    expect(await approvals.approveRequestAction(id)).toEqual({ ok: false, error: 'expired' });
    expect(await row(id)).toMatchObject({ status: 'EXPIRED', approverId: null });
    expect((await auditOf(id)).map((e) => e.type)).toEqual(['approval.requested', 'approval.expired']);

    // Expired stays expired: reject and cancel are refused too, no second audit line.
    expect(await approvals.rejectRequestAction(id, 'geç')).toEqual({ ok: false, error: 'expired' });
    as('requester');
    expect(await approvals.cancelRequestAction(id)).toEqual({ ok: false, error: 'expired' });
    expect((await auditOf(id)).map((e) => e.type)).toEqual(['approval.requested', 'approval.expired']);
  });

  test('another tenant cannot see, approve, reject or cancel the request', async () => {
    const id = await open();

    as('otherAdmin');
    expect(await approvals.approveRequestAction(id)).toEqual({ ok: false, error: 'notFound' });
    expect(await approvals.rejectRequestAction(id, 'yabancı')).toEqual({ ok: false, error: 'notFound' });
    expect(await approvals.cancelRequestAction(id)).toEqual({ ok: false, error: 'notFound' });
    expect(await row(id)).toMatchObject({ status: 'PENDING', approverId: null, rejectionReason: null });

    const { listApprovalRequests } = await import('@/lib/approval-requests');
    const otherList = await listApprovalRequests(requireId(fx.otherTenantId, 'otherTenantId'));
    expect(otherList.map((r) => r.id)).not.toContain(id);
    expect(otherList.every((r) => r.tenantId === fx.otherTenantId)).toBe(true);
    expect((await auditOf(id)).map((e) => e.type)).toEqual(['approval.requested']);
  });

  test('cancel: only the requester, only while PENDING', async () => {
    const id = await open();

    as('admin');
    expect(await approvals.cancelRequestAction(id)).toEqual({ ok: false, error: 'notRequester' });
    expect((await row(id))?.status).toBe('PENDING');

    as('requester');
    const res = await approvals.cancelRequestAction(id);
    expect(res.ok).toBe(true);
    expect((await row(id))?.status).toBe('CANCELLED');
    expect(await approvals.cancelRequestAction(id)).toEqual({ ok: false, error: 'notPending' });

    as('owner1');
    expect(await approvals.approveRequestAction(id)).toEqual({ ok: false, error: 'notPending' });
    expect((await row(id))?.status).toBe('CANCELLED');
    expect((await auditOf(id)).map((e) => e.type)).toEqual(['approval.requested', 'approval.cancelled']);
  });

  test('reject: a reason is required and bounded; the stored row carries it', async () => {
    const id = await open();
    as('admin');
    expect(await approvals.rejectRequestAction(id, '   ')).toEqual({ ok: false, error: 'reasonRequired' });
    expect(await approvals.rejectRequestAction(id, 'x'.repeat(1001))).toEqual({ ok: false, error: 'reasonTooLong' });
    expect((await row(id))?.status).toBe('PENDING');

    const res = await approvals.rejectRequestAction(id, '  bütçe kalemi eksik  ');
    expect(res.ok).toBe(true);
    expect(await row(id)).toMatchObject({ status: 'REJECTED', approverId: fx.users.admin, rejectionReason: 'bütçe kalemi eksik' });
    expect((await auditOf(id)).map((e) => e.type)).toEqual(['approval.requested', 'approval.rejected']);
  });

  test('an id that is not a string is not found, not a platform-wide match', async () => {
    as('owner1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request body is untyped on the wire
    expect(await approvals.approveRequestAction(undefined as any)).toEqual({ ok: false, error: 'notFound' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request body is untyped on the wire
    expect(await approvals.cancelRequestAction({ not: 'x' } as any)).toEqual({ ok: false, error: 'notFound' });
  });

  test('a role without the permission is refused before any row is read (FORBIDDEN_ROLE)', async () => {
    const id = await open();
    as('requester'); // WRITER: may request, may not approve
    await expect(approvals.approveRequestAction(id)).rejects.toMatchObject({ digest: 'FORBIDDEN_ROLE' });
    expect((await row(id))?.status).toBe('PENDING');
  });
});
