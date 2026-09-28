import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';

/**
 * FB KAMU B7 (TASK-MULRRU63LWC6E) — `declareApplication` writes the declaration and
 * `countApplicationOutcomes` reads it back, summed across tenants, over the real database.
 *
 * Three tenants: A and B are "the agency's members", C is not and carries its own submitted,
 * accepted application — so a count that ignored `tenantIds` would read one too many.
 * `.live`: skips locally when Postgres is unreachable, fails in CI.
 */

const ADMIN_URL = envValue('DATABASE_URL');
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;
const dbReachable =
  admin !== undefined && (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

const SUITE = 'application-outcome live test';
if (dbReachable) await assertAppOwnerRole(prisma, SUITE);
else skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const session = vi.hoisted(() => ({ tenantId: '', userId: 'user-b7-be-fb', role: 'PIPELINE_MANAGER' }));
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: session.userId }, tenantId: session.tenantId, role: session.role }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { declareApplication } = await import('@/app/[locale]/(app)/[workspace]/pipeline/actions');
const { countApplicationOutcomes } = await import('@/lib/k5-pipeline/applicationOutcome');

const RUN = `b7-${Date.now()}`;
const db = () => admin as PrismaClient;

function at(ids: string[], i: number): string {
  const id = ids[i];
  if (!id) throw new Error(`fixture has no opportunity #${i}`);
  return id;
}

async function makeTenant(label: string, opps: number) {
  const tenant = await db().tenant.create({
    data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'PUBLIC' },
  });
  const ws = await db().workspace.create({ data: { tenantId: tenant.id, name: `WS ${label}`, slug: `${RUN}-${label}-ws` } });
  const ids: string[] = [];
  for (let i = 0; i < opps; i++) {
    const o = await db().opportunity.create({
      data: { tenantId: tenant.id, workspaceId: ws.id, title: `Opp ${label}${i} ${RUN}`, stage: 'G3', status: 'ACTIVE' },
    });
    ids.push(o.id);
  }
  return { tenantId: tenant.id, opps: ids };
}

async function declareAs(tenantId: string, opportunityId: string, declaration: 'submitted' | 'accepted' | 'rejected') {
  session.tenantId = tenantId;
  return declareApplication({ opportunityId, declaration });
}

describe.skipIf(!dbReachable)('B7 application declaration → countApplicationOutcomes', () => {
  let a: Awaited<ReturnType<typeof makeTenant>>;
  let b: Awaited<ReturnType<typeof makeTenant>>;
  let c: Awaited<ReturnType<typeof makeTenant>>;

  beforeAll(async () => {
    a = await makeTenant('a', 3);
    b = await makeTenant('b', 1);
    c = await makeTenant('c', 1);
  });

  afterAll(async () => {
    if (!dbReachable) return;
    const tenants = [a, b, c].filter(Boolean).map((t) => t.tenantId);
    await db().auditEvent.deleteMany({ where: { tenantId: { in: tenants } } });
    await db().proposal.deleteMany({ where: { tenantId: { in: tenants } } });
    await db().opportunity.deleteMany({ where: { tenantId: { in: tenants } } });
    await db().workspace.deleteMany({ where: { tenantId: { in: tenants } } });
    await db().tenant.deleteMany({ where: { slug: { startsWith: RUN } } });
    await db().$disconnect();
  });

  it('starts at zero', async () => {
    expect(await countApplicationOutcomes([a.tenantId, b.tenantId])).toEqual({ submitted: 0, accepted: 0, rejected: 0 });
  });

  it('a result before a submission is refused and writes nothing', async () => {
    expect(await declareAs(a.tenantId, at(a.opps, 0), 'accepted')).toEqual({ success: false, error: 'NOT_SUBMITTED' });
    expect(await countApplicationOutcomes([a.tenantId])).toEqual({ submitted: 0, accepted: 0, rejected: 0 });
  });

  it('counts declarations summed across the given tenants only', async () => {
    expect(await declareAs(a.tenantId, at(a.opps, 0), 'submitted')).toEqual({ success: true, status: 'SUBMITTED' });
    expect(await declareAs(a.tenantId, at(a.opps, 0), 'accepted')).toEqual({ success: true, status: 'FUNDED' });
    expect(await declareAs(a.tenantId, at(a.opps, 1), 'submitted')).toMatchObject({ success: true });
    expect(await declareAs(a.tenantId, at(a.opps, 1), 'rejected')).toEqual({ success: true, status: 'REJECTED' });
    expect(await declareAs(a.tenantId, at(a.opps, 2), 'submitted')).toMatchObject({ success: true });
    expect(await declareAs(b.tenantId, at(b.opps, 0), 'submitted')).toMatchObject({ success: true });
    // Outside the agency: must not appear in the A+B total.
    expect(await declareAs(c.tenantId, at(c.opps, 0), 'submitted')).toMatchObject({ success: true });
    expect(await declareAs(c.tenantId, at(c.opps, 0), 'accepted')).toMatchObject({ success: true });

    expect(await countApplicationOutcomes([a.tenantId, b.tenantId])).toEqual({ submitted: 4, accepted: 1, rejected: 1 });
    // Duplicates count once.
    expect(await countApplicationOutcomes([a.tenantId, a.tenantId, b.tenantId])).toEqual({ submitted: 4, accepted: 1, rejected: 1 });
    expect(await countApplicationOutcomes([])).toEqual({ submitted: 0, accepted: 0, rejected: 0 });
  });

  it('declaring submitted twice keeps the first submission date', async () => {
    const before = await db().proposal.findUniqueOrThrow({ where: { opportunityId: at(a.opps, 2) } });
    expect(await declareAs(a.tenantId, at(a.opps, 2), 'submitted')).toMatchObject({ success: true });
    const after = await db().proposal.findUniqueOrThrow({ where: { opportunityId: at(a.opps, 2) } });
    expect(after.submittedAt).toEqual(before.submittedAt);
  });

  it('another tenant cannot declare on this tenant\'s opportunity', async () => {
    expect(await declareAs(c.tenantId, at(a.opps, 2), 'accepted')).toEqual({ success: false, error: 'OPPORTUNITY_NOT_FOUND' });
  });

  it('a GUEST_PARTNER who does not own the card cannot declare', async () => {
    session.role = 'GUEST_PARTNER';
    try {
      expect(await declareAs(a.tenantId, at(a.opps, 2), 'accepted')).toEqual({ success: false, error: 'DECLARE_FORBIDDEN' });
    } finally {
      session.role = 'PIPELINE_MANAGER';
    }
  });

  it('`since` filters on the submission date', async () => {
    expect(await countApplicationOutcomes([a.tenantId, b.tenantId], new Date(Date.now() + 60_000))).toEqual({
      submitted: 0,
      accepted: 0,
      rejected: 0,
    });
    await db().proposal.updateMany({ where: { opportunityId: at(a.opps, 0) }, data: { submittedAt: new Date('2020-01-01') } });
    expect(await countApplicationOutcomes([a.tenantId, b.tenantId], new Date('2021-01-01'))).toEqual({
      submitted: 3,
      accepted: 0,
      rejected: 1,
    });
  });

  it('archived opportunities drop out of every count', async () => {
    await db().opportunity.update({ where: { id: at(a.opps, 1) }, data: { deletedAt: new Date() } });
    expect(await countApplicationOutcomes([a.tenantId, b.tenantId])).toEqual({ submitted: 3, accepted: 1, rejected: 0 });
  });

  it('writes one audit row per state change', async () => {
    const rows = await db().auditEvent.count({
      where: { tenantId: a.tenantId, type: 'opportunity.application_declared' },
    });
    // a0: submitted, accepted · a1: submitted, rejected · a2: submitted (the repeat is a no-op)
    expect(rows).toBe(5);
  });
});
