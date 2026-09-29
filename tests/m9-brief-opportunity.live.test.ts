import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenant } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertAppOwnerRole, skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MULQLQIE3ES6G — ROADMAP open decision #14: a MeetingBrief knows the
 * opportunity it was prepared for, and /opportunities/[id]/briefs lists that
 * opportunity's briefs, plus the tenant's unlinked ones under their own heading,
 * instead of every brief of the tenant.
 *
 * Runs over the real `@/lib/db` singleton (the BYPASSRLS app role), so the only
 * thing between a tenant and another tenant's opportunity is the action's own
 * check — the FK alone would accept any existing id. Needs the column from
 * prisma/migrations/add-meeting-brief-opportunity.sql.
 */

const ADMIN_URL = envValue('DATABASE_URL');
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;
const dbReachable =
  admin !== undefined && (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

const SUITE = 'm9 brief ↔ opportunity test';
if (dbReachable) await assertAppOwnerRole(prisma, SUITE);
else skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const h = vi.hoisted(() => ({ tenantId: '', generateText: vi.fn(async () => '### brief') }));

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: h.tenantId, userId: 'user-be-fb' }),
}));
vi.mock('@/lib/modules/access', () => ({ assertModuleAccess: async () => undefined }));
vi.mock('@/lib/llm', () => ({ generateText: h.generateText }));
vi.mock('@/lib/calendar/sync', () => ({ syncMeetingBriefToCalendar: async () => undefined }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { generateMeetingBrief } = await import('@/modules/m9/server/actions');
const { listBriefsForOpportunity } = await import('@/modules/m9/server/brief-lists');

const RUN = `mulqlq-${Date.now()}`;
const db = (): PrismaClient => admin!;

async function makeTenant(label: string) {
  const tenant = await db().tenant.create({
    data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'SME' },
  });
  const ws = await db().workspace.create({
    data: { tenantId: tenant.id, name: `WS ${label}`, slug: `${RUN}-${label}-ws` },
  });
  const opp = (title: string) =>
    db().opportunity.create({ data: { tenantId: tenant.id, workspaceId: ws.id, title: `${title} ${RUN}` } });
  return { tenantId: tenant.id, opp1: await opp('one'), opp2: await opp('two') };
}

const brief = (tenantId: string, tag: string, opportunityId: string | null) =>
  db().meetingBrief.create({
    data: { tenantId, interactionId: `${RUN}-${tag}`, content: tag, partnerName: tag, opportunityId },
  });

describe.skipIf(!dbReachable)('MeetingBrief is linked to its opportunity', () => {
  let a: Awaited<ReturnType<typeof makeTenant>>;
  let b: Awaited<ReturnType<typeof makeTenant>>;

  beforeAll(async () => {
    a = await makeTenant('a');
    b = await makeTenant('b');
  });

  afterAll(async () => {
    if (!dbReachable) return;
    const tenants = { in: [a.tenantId, b.tenantId] };
    await db().meetingBrief.deleteMany({ where: { tenantId: tenants } });
    await db().opportunity.deleteMany({ where: { tenantId: tenants } });
    await db().workspace.deleteMany({ where: { tenantId: tenants } });
    await db().tenant.deleteMany({ where: { slug: { startsWith: RUN } } });
    await admin?.$disconnect();
  });

  it('stores the opportunity the brief was generated for', async () => {
    h.tenantId = a.tenantId;
    const res = await generateMeetingBrief({
      interactionId: `${RUN}-gen`,
      partnerName: 'Partner',
      callTopic: a.opp1.title,
      opportunityId: a.opp1.id,
    });
    expect(res.success).toBe(true);
    const row = await db().meetingBrief.findFirst({ where: { interactionId: `${RUN}-gen` } });
    expect(row?.opportunityId).toBe(a.opp1.id);
    expect(row?.tenantId).toBe(a.tenantId);
  });

  it("refuses another tenant's opportunity before the model is called or a row is written", async () => {
    h.tenantId = a.tenantId;
    h.generateText.mockClear();
    await expect(
      generateMeetingBrief({
        interactionId: `${RUN}-cross`,
        partnerName: 'Partner',
        callTopic: 'x',
        opportunityId: b.opp1.id,
      })
    ).rejects.toThrow('not found in this workspace');
    expect(h.generateText).not.toHaveBeenCalled();
    expect(await db().meetingBrief.count({ where: { interactionId: `${RUN}-cross` } })).toBe(0);
  });

  it("lists this opportunity's briefs, and the tenant's unlinked ones separately — nothing else", async () => {
    await brief(a.tenantId, 'a-opp1', a.opp1.id);
    await brief(a.tenantId, 'a-opp2', a.opp2.id);
    await brief(a.tenantId, 'a-legacy', null);
    await brief(b.tenantId, 'b-legacy', null);
    await brief(b.tenantId, 'b-opp1', b.opp1.id);

    const { linked, unlinked } = await withTenant(a.tenantId, (tx) =>
      listBriefsForOpportunity(tx, a.tenantId, a.opp1.id)
    );
    expect(linked.map((r) => r.partnerName).sort()).toEqual(['Partner', 'a-opp1']);
    expect(unlinked.map((r) => r.partnerName)).toEqual(['a-legacy']);

    const other = await withTenant(a.tenantId, (tx) => listBriefsForOpportunity(tx, a.tenantId, a.opp2.id));
    expect(other.linked.map((r) => r.partnerName)).toEqual(['a-opp2']);

    // A's opportunity id asked for under B's scope reads nothing of A's.
    const crossed = await withTenant(b.tenantId, (tx) => listBriefsForOpportunity(tx, b.tenantId, a.opp1.id));
    expect(crossed.linked).toHaveLength(0);
    expect(crossed.unlinked.map((r) => r.partnerName)).toEqual(['b-legacy']);
  });

  it('a hard-deleted opportunity leaves its briefs in place, unlinked (ON DELETE SET NULL)', async () => {
    const kept = await brief(a.tenantId, 'a-orphan', a.opp2.id);
    await db().opportunity.delete({ where: { id: a.opp2.id } });
    const row = await db().meetingBrief.findUnique({ where: { id: kept.id } });
    expect(row).not.toBeNull();
    expect(row?.opportunityId).toBeNull();
  });
});
