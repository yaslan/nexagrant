/**
 * FO-384 — a PIC change moves the G0 score stored for that tenant's opportunities.
 *
 * Runs the real actions on a real database. Every assertion on a score compares what is stored with
 * what the canonical scorer says at that moment, so no scoring rule is written down here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  scope: null as Record<string, unknown> | null,
  failFor: new Set<string>(),
  rescoreCalls: [] as string[],
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ requireTenantAction: vi.fn(async () => h.scope) }));
vi.mock('@/lib/scoring/g0-compute', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/scoring/g0-compute')>();
  return {
    ...actual,
    rescoreOpportunityG0: vi.fn(async (tenantId: string, opportunityId: string) => {
      h.rescoreCalls.push(opportunityId);
      if (h.failFor.has(opportunityId)) throw new Error('injected rescore failure');
      return actual.rescoreOpportunityG0(tenantId, opportunityId);
    }),
  };
});

import { updateTenantProfile } from '@/app/[locale]/(app)/[workspace]/settings/profile/actions';
import { prisma, withTenant } from '@/lib/db';
import { computeG0ForOpportunity, type G0Computation } from '@/lib/scoring/g0-compute';
import {
  G0_RESCORE_ALERT_SOURCE,
  rescoreTenantG0AfterPicChange,
  type PicChange,
} from '@/lib/scoring/g0-rescore-tenant';
import { removeTenantPic } from '@/lib/tenant-pic-removal';
import { presentIds, requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const newPic = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999));
const profile = { capabilities: 'Grid flexibility pilots', keywords: 'grid flexibility', trlMin: 4, trlMax: 7 };

describe('FO-384: stored G0 scores follow a PIC change', () => {
  let key: string;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let topicId: string;
  let pic: string;
  let oppId: string;
  let secondOppId: string;
  let archivedOppId: string;
  let otherTenantOppId: string;

  /** Stored on both records the product reads: the board reads TopicMatch, the rest the column. */
  const stored = async (opportunityId: string) => {
    const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { g0Score: true } });
    const match = await prisma.topicMatch.findFirst({ where: { opportunityId }, select: { g0Score: true } });
    return { opportunity: opp?.g0Score ?? null, topicMatch: match?.g0Score ?? null };
  };
  const fresh = async (id: string, owner = tenantId) =>
    (await withTenant(owner, (tx) => computeG0ForOpportunity(tx, owner, id)))?.score ?? null;
  const expectStoredIsFresh = async (id: string) => {
    const score = await fresh(id);
    expect(score).not.toBeNull();
    expect(await stored(id)).toEqual({ opportunity: score, topicMatch: score });
    return score;
  };
  const storeCurrentScore = async (id: string) => {
    const { rescoreOpportunityG0 } = await import('@/lib/scoring/g0-compute');
    await rescoreOpportunityG0(tenantId, id);
    h.rescoreCalls.length = 0;
  };
  const alertsFor = async (auditEventId: string) => {
    const rows = await prisma.systemAlert.findMany({ where: { source: G0_RESCORE_ALERT_SOURCE } });
    return rows.filter((r) => (r.meta as Record<string, unknown> | null)?.auditEventId === auditEventId);
  };
  const latestAuditId = async (type: string) =>
    (await prisma.auditEvent.findFirst({ where: { tenantId, type }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id ?? '';
  const change = (auditEventId: string): PicChange => ({ trigger: 'tenant_saved', auditEventId });

  beforeEach(async () => {
    h.failFor.clear();
    h.rescoreCalls.length = 0;
    key = `fo384-${suffix()}`;
    tenantId = `${key}-t`;
    otherTenantId = `${key}-o`;
    userId = `${key}-u`;
    topicId = `${key}-topic`;
    pic = newPic();
    oppId = `${key}-opp`;
    secondOppId = `${key}-opp2`;
    archivedOppId = `${key}-archived`;
    otherTenantOppId = `${key}-other-opp`;

    for (const id of [tenantId, otherTenantId]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id, country: 'TR', orgType: 'SME' } });
      await prisma.workspace.create({ data: { id: `${id}-w`, tenantId: id, name: id, slug: id } });
      await prisma.tenantProfile.create({
        data: { tenantId: id, capabilities: 'Grid', keywords: ['grid flexibility'], trlRange: [4, 7], naceCodes: [], preferredRoles: [] },
      });
    }
    await prisma.user.create({ data: { id: userId, email: `${key}@test.local`, name: 'Owner' } });
    await prisma.membership.create({ data: { tenantId, userId, role: 'TENANT_OWNER' } });
    h.scope = { tenantId, userId, role: 'TENANT_OWNER' };

    await prisma.cordisOrganization.create({ data: { organisationId: pic, name: `Org ${key}`, country: 'TR' } });
    await prisma.cordisProject.create({ data: { id: `${key}-p`, title: 'P', framework: 'HORIZON', masterCall: 'HORIZON-FO384-2026-01' } });
    await prisma.cordisParticipation.create({ data: { projectId: `${key}-p`, organisationId: pic, role: 'coordinator' } });
    await prisma.programme.create({ data: { id: `${key}-pr`, name: key, sourceKey: key } });
    await prisma.call.create({ data: { id: `${key}-c`, programmeId: `${key}-pr`, callIdentifier: `${key}-c`, title: 'C', currency: 'EUR' } });
    await prisma.topic.create({
      data: {
        id: topicId,
        callId: `${key}-c`,
        identifier: `HORIZON-FO384-2026-01-D1-${key}`,
        title: 'T',
        typeOfAction: 'IA',
        isLumpSum: false,
        isTwoStage: false,
        budgetPerProjectCents: BigInt(400_000_000),
        deadlines: [{ stage: 1, at: '2027-12-15T17:00:00Z', tz: 'Europe/Brussels' }],
        eligibility: {},
        keywords: ['grid flexibility'],
      },
    });

    const opportunity = (id: string, owner: string, deletedAt: Date | null = null) =>
      prisma.opportunity.create({
        data: { id, tenantId: owner, workspaceId: `${owner}-w`, title: id, topicId, stage: 'G0', status: 'ACTIVE', intendedRole: 'coordinator', deletedAt },
      });
    await opportunity(oppId, tenantId);
    await opportunity(secondOppId, tenantId);
    await opportunity(archivedOppId, tenantId, new Date());
    await opportunity(otherTenantOppId, otherTenantId);
  });

  afterEach(async () => {
    const tenants = [requireId(tenantId, 'tenantId'), requireId(otherTenantId, 'otherTenantId')];
    const auditIds = (
      await prisma.auditEvent.findMany({ where: { tenantId: { in: tenants } }, select: { id: true } })
    ).map((a) => a.id);
    const alerts = await prisma.systemAlert.findMany({ where: { source: G0_RESCORE_ALERT_SOURCE } });
    const ours = alerts.filter((a) => {
      const meta = a.meta as Record<string, unknown> | null;
      return auditIds.includes(String(meta?.auditEventId)) || String(meta?.auditEventId).startsWith(key);
    });
    await prisma.systemAlert.deleteMany({ where: { id: { in: presentIds(ours.map((a) => a.id)) } } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.topicMatch.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.opportunity.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.topic.deleteMany({ where: { id: requireId(topicId, 'topicId') } });
    await prisma.call.deleteMany({ where: { id: requireId(`${key}-c`, 'call') } });
    await prisma.programme.deleteMany({ where: { id: requireId(`${key}-pr`, 'programme') } });
    await prisma.cordisParticipation.deleteMany({ where: { projectId: requireId(`${key}-p`, 'project') } });
    await prisma.cordisProject.deleteMany({ where: { id: requireId(`${key}-p`, 'project') } });
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: requireId(pic, 'pic') } });
    await prisma.membership.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.workspace.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { id: requireId(userId, 'userId') } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  });

  describe('the three PIC paths', () => {
    it('tenant saves a PIC: every live opportunity of that tenant is stored at the new score', async () => {
      await storeCurrentScore(oppId);
      await storeCurrentScore(secondOppId);
      const before = await stored(oppId);

      const result = await updateTenantProfile({ ...profile, pic, confirmedPic: pic });
      expect(result).toMatchObject({ ok: true, pic: { status: 'matched', value: pic } });

      const after = await expectStoredIsFresh(oppId);
      await expectStoredIsFresh(secondOppId);
      expect(after).not.toBe(before.opportunity);
    });

    it('tenant clears the PIC: the score that counted the history is replaced', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      await storeCurrentScore(oppId);
      const before = await stored(oppId);

      expect(await updateTenantProfile({ ...profile, pic: '' })).toEqual({ ok: true, pic: { status: 'cleared' } });

      const after = await expectStoredIsFresh(oppId);
      expect(after).not.toBe(before.opportunity);
    });

    it('admin removes the PIC: the same', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      await storeCurrentScore(oppId);
      const before = await stored(oppId);

      await removeTenantPic(tenantId, pic, userId, 'owner disputed');

      const after = await expectStoredIsFresh(oppId);
      expect(after).not.toBe(before.opportunity);
    });
  });

  describe('what it leaves alone', () => {
    it('touches neither an archived opportunity nor another tenant', async () => {
      await prisma.opportunity.update({ where: { id: archivedOppId }, data: { g0Score: 11 } });
      await prisma.opportunity.update({ where: { id: otherTenantOppId }, data: { g0Score: 22 } });

      await updateTenantProfile({ ...profile, pic, confirmedPic: pic });

      expect(h.rescoreCalls.sort()).toEqual([oppId, secondOppId].sort());
      expect((await stored(archivedOppId)).opportunity).toBe(11);
      expect((await stored(otherTenantOppId)).opportunity).toBe(22);
    });

    it('does not rescore when the save did not change the PIC', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      expect(await updateTenantProfile({ ...profile })).toEqual({ ok: true });
      expect(await updateTenantProfile({ ...profile, pic })).toEqual({ ok: true });
      expect(h.rescoreCalls).toEqual([]);
    });

    it('does not rescore when the PIC was refused', async () => {
      await prisma.tenant.update({ where: { id: otherTenantId }, data: { pic } });
      expect(await updateTenantProfile({ ...profile, pic, confirmedPic: pic })).toEqual({ ok: false, error: 'picTaken' });
      expect(await updateTenantProfile({ ...profile, pic: '12345' })).toEqual({ ok: false, error: 'picInvalid' });
      expect(h.rescoreCalls).toEqual([]);
    });

    it('does not rescore when staff tried to remove a PIC the tenant no longer holds', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      await expect(removeTenantPic(tenantId, newPic(), userId, 'stale')).rejects.toThrow();
      expect(h.rescoreCalls).toEqual([]);
    });
  });

  describe('when a rescore fails', () => {
    it('tenant save: the PIC stays, the other opportunities are rescored, an alert is raised without a tenant id', async () => {
      await storeCurrentScore(oppId);
      await storeCurrentScore(secondOppId);
      const staleScore = await stored(secondOppId);
      h.failFor.add(secondOppId);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await updateTenantProfile({ ...profile, pic, confirmedPic: pic });

      consoleError.mockRestore();
      expect(result).toMatchObject({ ok: true, pic: { status: 'matched' } });
      expect((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } }))?.pic).toBe(pic);
      await expectStoredIsFresh(oppId);
      expect(await stored(secondOppId)).toEqual(staleScore);

      const auditEventId = await latestAuditId('tenant.pic.updated');
      const alerts = await alertsFor(auditEventId);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ level: 'error', resolvedAt: null });
      expect(alerts[0]?.meta).toEqual({
        trigger: 'tenant_saved',
        auditEventId,
        total: 2,
        rescored: 1,
        cleared: 0,
        failed: 1,
        skipped: 0,
        opportunityIds: [secondOppId],
      });
      const row = JSON.stringify(alerts[0]);
      expect(row).not.toContain(tenantId);
      expect(row).not.toContain(pic);
    });

    it('admin removal: the same, and the promise does not reject', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      await storeCurrentScore(oppId);
      h.failFor.add(oppId);
      h.failFor.add(secondOppId);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(removeTenantPic(tenantId, pic, userId, 'owner disputed')).resolves.toBeUndefined();

      consoleError.mockRestore();
      expect((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pic: true } }))?.pic).toBeNull();
      const auditEventId = await latestAuditId('tenant.pic.removed');
      expect(await alertsFor(auditEventId)).toHaveLength(1);
      expect((await alertsFor(auditEventId))[0]?.meta).toMatchObject({ trigger: 'admin_removed', failed: 2, rescored: 0 });
    });

    it('raises no alert when everything worked', async () => {
      await updateTenantProfile({ ...profile, pic, confirmedPic: pic });
      expect(await alertsFor(await latestAuditId('tenant.pic.updated'))).toEqual([]);
    });

    it('a failed listing is an alert, not a throw', async () => {
      const auditEventId = `${key}-list`;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
        listOpportunityIds: async () => {
          throw new Error('injected listing failure');
        },
      });
      consoleError.mockRestore();
      expect(summary).toEqual({ total: null, rescored: 0, cleared: 0, failed: 0, skipped: 0 });
      expect((await alertsFor(auditEventId))[0]?.meta).toMatchObject({ total: null, opportunityIds: [] });
    });
  });

  it('stops at the time budget and says how many it did not reach', async () => {
    const auditEventId = `${key}-budget`;
    let clock = 0;
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      budgetMs: 100,
      now: () => clock,
      listOpportunityIds: async () => ['a', 'b', 'c'],
      rescore: async () => {
        clock += 100;
        return { score: 50 } as G0Computation;
      },
    });
    expect(summary).toEqual({ total: 3, rescored: 1, cleared: 0, failed: 0, skipped: 2 });
    expect((await alertsFor(auditEventId))[0]?.meta).toMatchObject({ skipped: 2, opportunityIds: ['b', 'c'] });
  });

  it('lists an alert\'s opportunity ids up to a limit, the counts stay whole', async () => {
    const auditEventId = `${key}-many`;
    const ids = Array.from({ length: 30 }, (_, i) => `opp-${i}`);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      listOpportunityIds: async () => ids,
      rescore: async () => {
        throw new Error('injected');
      },
    });
    consoleError.mockRestore();
    expect(summary.failed).toBe(30);
    const meta = (await alertsFor(auditEventId))[0]?.meta as { failed: number; opportunityIds: string[] };
    expect(meta.failed).toBe(30);
    expect(meta.opportunityIds).toHaveLength(10);
  });

  it('a score that can no longer be computed is cleared, not left at its old value', async () => {
    await storeCurrentScore(oppId);
    const before = await stored(oppId);
    expect(before.opportunity).not.toBeNull();
    const real = await withTenant(tenantId, (tx) => computeG0ForOpportunity(tx, tenantId, oppId));

    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(`${key}-null`), {
      listOpportunityIds: async () => [oppId],
      // What the scorer returns with no evidence at all (`coverage === 0`).
      rescore: async () => ({ ...real!, score: null, decision: null, coverage: 0 }),
    });

    expect(summary).toEqual({ total: 1, rescored: 0, cleared: 1, failed: 0, skipped: 0 });
    expect(await stored(oppId)).toEqual({ opportunity: null, topicMatch: null });
    const row = await prisma.topicMatch.findFirst({ where: { opportunityId: oppId }, select: { breakdown: true } });
    expect(row?.breakdown).toMatchObject({ score: null, coverage: 0, g0ScorerPlaceholderFitScore: true });
    expect(await alertsFor(`${key}-null`)).toEqual([]);
  });

  it('never rejects, whatever fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      rescoreTenantG0AfterPicChange(tenantId, change(`${key}-never`), {
        now: () => {
          throw new Error('injected clock failure');
        },
      }),
    ).resolves.toBeDefined();
    consoleError.mockRestore();
  });
});
