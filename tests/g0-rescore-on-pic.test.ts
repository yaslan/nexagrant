import { suiteHasDatabase } from './helpers/database-availability';
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
  enqueueJob: vi.fn(async (..._args: unknown[]) => ({ added: true })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ requireTenantAction: vi.fn(async () => h.scope) }));
// The queue is only reached when a run's budget ends first; the worker test below makes it fail.
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (...args: unknown[]) => h.enqueueJob(...args) }));
vi.mock('@/lib/scoring/g0-compute', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/scoring/g0-compute')>();
  return {
    ...actual,
    rescoreOpportunityG0: vi.fn(async (tenantId: string, opportunityId: string, rescoreOptions?: { lockTimeoutMs?: number }) => {
      h.rescoreCalls.push(opportunityId);
      if (h.failFor.has(opportunityId)) throw new Error('injected rescore failure');
      return actual.rescoreOpportunityG0(tenantId, opportunityId, rescoreOptions);
    }),
  };
});

import { updateTenantProfile } from '@/app/[locale]/(app)/[workspace]/settings/profile/actions';
import { prisma, withTenant, type TenantTx } from '@/lib/db';
import {
  computeG0ForOpportunity,
  G0_RESCORE_SCOPE,
  G0ConcurrentEditError,
  G0LeftScopeError,
  type G0Computation,
  persistG0,
} from '@/lib/scoring/g0-compute';
import {
  G0_RESCORE_ALERT_SOURCE,
  rescoreTenantG0AfterPicChange,
  type PicChange,
} from '@/lib/scoring/g0-rescore-tenant';
import { g0RescoreTenantTask } from '@/lib/jobs/tasks/g0-rescore-tenant';
import { removeTenantPic } from '@/lib/tenant-pic-removal';
import { presentIds, requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const newPic = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999));
const profile = { capabilities: 'Grid flexibility pilots', keywords: 'grid flexibility', trlMin: 4, trlMax: 7 };

const HAS_DB = await suiteHasDatabase('g0-rescore-on-pic');

describe.skipIf(!HAS_DB)('FO-384: stored G0 scores follow a PIC change', () => {
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

  describe('K-577267: only G0 active opportunities are rescored', () => {
    /** An opportunity outside the scope, holding a sentinel score on both records and a gate decision. */
    const parked = async (id: string, data: { stage: 'G0' | 'G1'; status?: 'ACTIVE' | 'FUNDED' | 'WITHDRAWN' }) => {
      await prisma.opportunity.create({
        data: { id, tenantId, workspaceId: `${tenantId}-w`, title: id, topicId, intendedRole: 'coordinator', g0Score: 1.25, ...data },
      });
      await prisma.topicMatch.create({ data: { tenantId, topicId, opportunityId: id, fitScore: 0, g0Score: 1.25, breakdown: {} } });
      await prisma.gateDecision.create({
        data: { tenantId, opportunityId: id, gate: 'G0', passed: false, inputs: {}, ruleVersion: 'fo384-k577267', decidedBy: userId },
      });
    };
    /** Everything a rescore could touch on a row. Stage and status are read to show the row did not move. */
    const snapshot = async (id: string) => {
      const opp = await prisma.opportunity.findUniqueOrThrow({
        where: { id },
        select: { stage: true, status: true, g0Score: true, updatedAt: true },
      });
      const match = await prisma.topicMatch.findFirst({ where: { opportunityId: id }, select: { g0Score: true, breakdown: true } });
      const decisions = await prisma.gateDecision.findMany({
        where: { opportunityId: id },
        orderBy: { id: 'asc' },
        select: { gate: true, passed: true, ruleVersion: true, decidedAt: true },
      });
      return { ...opp, updatedAt: opp.updatedAt.toISOString(), topicMatch: match ?? null, decisions };
    };

    it('the save rescores the G0 active opportunities and leaves every other row exactly as it was', async () => {
      await parked(`${key}-opp1`, { stage: 'G1' });
      await parked(`${key}-fund`, { stage: 'G0', status: 'FUNDED' });
      await parked(`${key}-wd`, { stage: 'G0', status: 'WITHDRAWN' });
      await prisma.opportunity.update({ where: { id: archivedOppId }, data: { g0Score: 1.25 } });
      const untouched = [`${key}-opp1`, `${key}-fund`, `${key}-wd`, archivedOppId];
      const before: Record<string, Awaited<ReturnType<typeof snapshot>>> = {};
      for (const id of untouched) before[id] = await snapshot(id);

      await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
      const auditEventId = `${key}-scope`;
      const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId));

      expect(summary).toMatchObject({ total: 2, rescored: 2, failed: 0, skipped: 0, archived: 0, queued: false });
      await expectStoredIsFresh(oppId);
      await expectStoredIsFresh(secondOppId);
      for (const id of untouched) expect(await snapshot(id)).toEqual(before[id]);
      expect(await alertsFor(auditEventId)).toEqual([]);
    });

    it('a resumed page keeps the filter: a G1 opportunity between the cursor and the end is not rescored', async () => {
      await prisma.opportunity.create({
        data: { id: `${key}-opp0`, tenantId, workspaceId: `${tenantId}-w`, title: 'between', topicId, stage: 'G0', status: 'ACTIVE', intendedRole: 'coordinator' },
      });
      await parked(`${key}-opp1`, { stage: 'G1' });
      const rescored: string[] = [];
      const summary = await rescoreTenantG0AfterPicChange(tenantId, { ...change(`${key}-page`), afterId: oppId }, {
        rescore: async (_tenant, id) => {
          rescored.push(id);
          return { score: 50 } as G0Computation;
        },
        enqueueContinuation: async () => {
          throw new Error('must not queue a finished run');
        },
      });
      expect(rescored).toEqual([`${key}-opp0`, secondOppId]);
      expect(summary).toMatchObject({ total: 2, queued: false });
    });

    it('an opportunity that left G0 after the listing is archived, not failed, and raises no alert', async () => {
      const auditEventId = `${key}-stale-list`;
      const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
        listOpportunityIds: async () => {
          await prisma.opportunity.update({ where: { id: secondOppId }, data: { stage: 'G1' } });
          return [oppId, secondOppId];
        },
      });
      expect(summary).toMatchObject({ total: 2, failed: 0, skipped: 0, archived: 1, queued: false });
      expect(summary.rescored + summary.cleared).toBe(1);
      expect(await alertsFor(auditEventId)).toEqual([]);
    });

    it('a stage change between the read and the write writes nothing, the TopicMatch included', async () => {
      await prisma.opportunity.update({ where: { id: oppId }, data: { g0Score: 1.25 } });
      const computation = await withTenant(tenantId, (tx) => computeG0ForOpportunity(tx, tenantId, oppId, { scope: G0_RESCORE_SCOPE }));
      expect(computation?.score).not.toBeNull();
      const before = await snapshot(oppId);

      // The stage moves right after the write's first read, on a second connection so this transaction
      // holds no lock. It is a raw UPDATE, so `updatedAt` does not move: only the scope can stop the
      // write. The guarded write then matches nothing, and that is G0LeftScopeError, not an error alert.
      let armed = true;
      const racing = (tx: TenantTx): TenantTx =>
        new Proxy(tx, {
          get(target, prop) {
            if (prop !== 'opportunity') return Reflect.get(target, prop);
            const model = target.opportunity;
            return new Proxy(model, {
              get(m, p) {
                const value = Reflect.get(m, p);
                if (p !== 'findFirst' || typeof value !== 'function') return typeof value === 'function' ? value.bind(m) : value;
                return async (args: unknown) => {
                  const found = await value.call(m, args);
                  if (armed) {
                    armed = false;
                    await prisma.$executeRaw`UPDATE "Opportunity" SET stage = 'G1'::"Gate" WHERE id = ${oppId}`;
                  }
                  return found;
                };
              },
            });
          },
        }) as TenantTx;

      await expect(
        withTenant(tenantId, (tx) => persistG0(racing(tx), computation!, { keepUpdatedAt: true, rescope: true })),
      ).rejects.toBeInstanceOf(G0LeftScopeError);
      expect(armed).toBe(false);

      const after = await snapshot(oppId);
      expect(after.stage).toBe('G1');
      expect(after.g0Score).toBe(before.g0Score);
      expect(after.topicMatch).toEqual(before.topicMatch);
      expect(after.decisions).toEqual(before.decisions);
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
      expect(alerts[0]?.meta).toMatchObject({
        trigger: 'tenant_saved',
        auditEventId,
        total: 2,
        rescored: 1,
        cleared: 0,
        failed: 1,
        skipped: 0,
        queued: false,
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
      expect(summary).toEqual({ total: null, rescored: 0, cleared: 0, failed: 0, skipped: 0, archived: 0, queued: false });
      expect((await alertsFor(auditEventId))[0]?.meta).toMatchObject({ total: null, opportunityIds: [] });
    });
  });

  it('stops at the time budget and queues the rest after the last opportunity it reached', async () => {
    const auditEventId = `${key}-budget`;
    const listed: Array<string | undefined> = [];
    const queued: Array<{ tenantId: string; run: { afterId?: string } }> = [];
    let clock = 0;
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      budgetMs: 100,
      now: () => clock,
      listOpportunityIds: async (_tenant, afterId) => {
        listed.push(afterId);
        return ['a', 'b', 'c'];
      },
      rescore: async () => {
        clock += 100;
        return { score: 50 } as G0Computation;
      },
      enqueueContinuation: async (tenant, run) => {
        queued.push({ tenantId: tenant, run });
      },
    });
    expect(summary).toEqual({ total: 3, rescored: 1, cleared: 0, failed: 0, skipped: 2, archived: 0, queued: true });
    expect(listed).toEqual([undefined]);
    expect(queued).toEqual([{ tenantId, run: { trigger: 'tenant_saved', auditEventId, afterId: 'a' } }]);
    // The rest is in the queue, so nothing is alerted: an alert would say a rescore is lost.
    expect(await alertsFor(auditEventId)).toEqual([]);
  });

  it('resumes after the cursor it was given', async () => {
    const auditEventId = `${key}-resume`;
    const rescored: string[] = [];
    const summary = await rescoreTenantG0AfterPicChange(tenantId, { ...change(auditEventId), afterId: 'a' }, {
      listOpportunityIds: async (_tenant, afterId) => (afterId === 'a' ? ['b', 'c'] : ['a', 'b', 'c']),
      rescore: async (_tenant, id) => {
        rescored.push(id);
        return { score: 50 } as G0Computation;
      },
      enqueueContinuation: async () => {
        throw new Error('must not queue a finished run');
      },
    });
    expect(rescored).toEqual(['b', 'c']);
    expect(summary).toEqual({ total: 2, rescored: 2, cleared: 0, failed: 0, skipped: 0, archived: 0, queued: false });
  });

  it('alerts when the rest cannot be queued, with the counts and no tenant id', async () => {
    const auditEventId = `${key}-noqueue`;
    let clock = 0;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      budgetMs: 100,
      now: () => clock,
      listOpportunityIds: async () => ['a', 'b'],
      rescore: async () => {
        clock += 100;
        return { score: 50 } as G0Computation;
      },
      enqueueContinuation: async () => {
        throw new Error('queue is down');
      },
    });
    consoleError.mockRestore();
    expect(summary).toEqual({ total: 2, rescored: 1, cleared: 0, failed: 0, skipped: 1, archived: 0, queued: false });
    const alerts = await alertsFor(auditEventId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error' });
    expect(alerts[0]?.meta).toMatchObject({ skipped: 1, queued: false, opportunityIds: ['b'] });
    expect(JSON.stringify(alerts[0])).not.toContain(tenantId);
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

    expect(summary).toEqual({ total: 1, rescored: 0, cleared: 1, failed: 0, skipped: 0, archived: 0, queued: false });
    expect(await stored(oppId)).toEqual({ opportunity: null, topicMatch: null });
    const row = await prisma.topicMatch.findFirst({ where: { opportunityId: oppId }, select: { breakdown: true } });
    expect(row?.breakdown).toMatchObject({ score: null, coverage: 0, g0ScorerPlaceholderFitScore: true });
    expect(await alertsFor(`${key}-null`)).toEqual([]);
  });

  it('a rescore that changes the score keeps the opportunity updatedAt', async () => {
    await storeCurrentScore(oppId);
    const old = new Date('2026-03-03T10:00:00Z');
    await prisma.opportunity.update({ where: { id: oppId }, data: { updatedAt: old } });

    await updateTenantProfile({ ...profile, pic, confirmedPic: pic });

    await expectStoredIsFresh(oppId);
    expect((await prisma.opportunity.findUnique({ where: { id: oppId }, select: { updatedAt: true } }))?.updatedAt).toEqual(old);
  });

  it('a rescore that leaves the score unchanged does not touch the opportunity row', async () => {
    await storeCurrentScore(oppId);
    const old = new Date('2026-03-03T10:00:00Z');
    await prisma.opportunity.update({ where: { id: oppId }, data: { updatedAt: old } });
    const { rescoreOpportunityG0 } = await import('@/lib/scoring/g0-compute');

    await rescoreOpportunityG0(tenantId, oppId);

    expect((await prisma.opportunity.findUnique({ where: { id: oppId }, select: { updatedAt: true } }))?.updatedAt).toEqual(old);
    await expectStoredIsFresh(oppId);
  });

  it('rescoreOpportunityG0 clears a stored score that the scorer can no longer compute', async () => {
    // An opportunity without a topic has no evidence, so the scorer returns no score (coverage 0).
    await prisma.opportunity.create({
      data: { id: `${key}-notopic`, tenantId, workspaceId: `${tenantId}-w`, title: 'no topic', topicId: null, stage: 'G0', status: 'ACTIVE', intendedRole: 'coordinator', g0Score: 55 },
    });
    const { rescoreOpportunityG0 } = await import('@/lib/scoring/g0-compute');

    const computation = await rescoreOpportunityG0(tenantId, `${key}-notopic`);

    expect(computation?.score).toBeNull();
    expect(await stored(`${key}-notopic`)).toEqual({ opportunity: null, topicMatch: null });
  });

  it('a PIC change that leaves a topicless opportunity unscored keeps its updatedAt (E1)', async () => {
    const noTopic = `${key}-notopic-e1`;
    await prisma.opportunity.create({
      data: { id: noTopic, tenantId, workspaceId: `${tenantId}-w`, title: 'no topic', topicId: null, stage: 'G0', status: 'ACTIVE', intendedRole: 'coordinator', g0Score: 55 },
    });
    const old = new Date('2026-03-03T10:00:00Z');
    await prisma.opportunity.update({ where: { id: noTopic }, data: { updatedAt: old } });

    // No injected `rescore`: the real scorer decides that this opportunity now has no score.
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(`${key}-e1`), {
      listOpportunityIds: async () => [noTopic],
    });

    expect(summary).toMatchObject({ total: 1, cleared: 1, failed: 0 });
    expect(await stored(noTopic)).toEqual({ opportunity: null, topicMatch: null });
    expect((await prisma.opportunity.findUnique({ where: { id: noTopic }, select: { updatedAt: true } }))?.updatedAt).toEqual(old);
  });

  it('resumes after the cursor in id order, read from the real database (Y1)', async () => {
    // Created last: its id sorts between `oppId` and `secondOppId`, but its createdAt is the latest.
    // Ordered by createdAt the same rows come back in another order.
    const between = `${key}-opp0`;
    await prisma.opportunity.create({
      data: { id: between, tenantId, workspaceId: `${tenantId}-w`, title: between, topicId, stage: 'G0', status: 'ACTIVE', intendedRole: 'coordinator' },
    });
    const rescored: string[] = [];
    const summary = await rescoreTenantG0AfterPicChange(tenantId, { ...change(`${key}-cursor`), afterId: oppId }, {
      rescore: async (_tenant, id) => {
        rescored.push(id);
        return { score: 50 } as G0Computation;
      },
      enqueueContinuation: async () => {
        throw new Error('must not queue a finished run');
      },
    });
    expect(rescored).toEqual([between, secondOppId]);
    expect(summary).toMatchObject({ total: 2, rescored: 2, queued: false });
  });

  it('a row lock held by another transaction does not hold the request past its budget; the opportunity is alerted (Y2)', async () => {
    const auditEventId = `${key}-lock`;
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Opportunity" WHERE id = ${oppId} FOR UPDATE`;
        locked();
        await new Promise((resolve) => setTimeout(resolve, 8_000));
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    await lockTaken;
    const continuations: Array<{ afterId?: string }> = [];
    const started = Date.now();
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      budgetMs: 1_000,
      listOpportunityIds: async () => [oppId, secondOppId],
      enqueueContinuation: async (_tenant, run) => {
        continuations.push(run);
      },
    });
    const elapsed = Date.now() - started;
    await holder;

    // The wait ends at the lock timeout (2 s), not when the holder lets go (8 s).
    expect(elapsed).toBeLessThan(6_000);
    expect(summary).toEqual({ total: 2, rescored: 0, cleared: 0, failed: 1, skipped: 1, archived: 0, queued: true });
    // Not lost: the locked opportunity is named in the alert, the rest is queued after it.
    expect(continuations).toEqual([expect.objectContaining({ afterId: oppId })]);
    const alerts = await alertsFor(auditEventId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ level: 'error' });
    expect(alerts[0]?.meta).toMatchObject({ failed: 1, opportunityIds: [oppId] });
  }, 40_000);

  it('an opportunity archived after the listing is counted as archived, not as a failure (O2)', async () => {
    const auditEventId = `${key}-archived-mid`;
    const summary = await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      listOpportunityIds: async () => {
        // Archived after the listing and before its turn in the run.
        await prisma.opportunity.update({ where: { id: secondOppId }, data: { deletedAt: new Date() } });
        return [oppId, secondOppId];
      },
    });
    expect(summary).toMatchObject({ total: 2, failed: 0, skipped: 0, archived: 1, queued: false });
    expect(summary.rescored + summary.cleared).toBe(1);
    expect(await alertsFor(auditEventId)).toEqual([]);
  });

  it('an edit made between the rescore read and its write is not overwritten (O3)', async () => {
    await prisma.opportunity.update({ where: { id: oppId }, data: { g0Score: 1 } });
    const userEditAt = new Date('2026-11-05T12:00:00Z');
    const computation = (await withTenant(tenantId, (tx) => computeG0ForOpportunity(tx, tenantId, oppId)))!;
    expect(computation.score).not.toBeNull();

    await expect(
      withTenant(tenantId, (tx) => {
        const opportunity = new Proxy(tx.opportunity, {
          get(target, prop) {
            if (prop !== 'findFirst') return Reflect.get(target, prop, target);
            return async (args: Parameters<typeof target.findFirst>[0]) => {
              const row = await target.findFirst(args);
              // The user's edit lands after the rescore's read and before its write.
              await prisma.opportunity.update({ where: { id: oppId }, data: { title: 'user edit', updatedAt: userEditAt } });
              return row;
            };
          },
        });
        const racing = new Proxy(tx, {
          get: (target, prop) => (prop === 'opportunity' ? opportunity : Reflect.get(target, prop, target)),
        });
        return persistG0(racing as unknown as Parameters<typeof persistG0>[0], computation, { keepUpdatedAt: true });
      }),
    ).rejects.toBeInstanceOf(G0ConcurrentEditError);

    const row = await prisma.opportunity.findUnique({ where: { id: oppId }, select: { title: true, updatedAt: true, g0Score: true } });
    expect(row).toEqual({ title: 'user edit', updatedAt: userEditAt, g0Score: 1 });
  });

  it('a retried run adds to one alert, not a second row (H1, dedupe key)', async () => {
    const auditEventId = `${key}-dedupe`;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // First run: one of two fails. Second run: both fail. The messages differ, so only the dedupe key joins them.
    await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      listOpportunityIds: async () => [oppId, secondOppId],
      rescore: async (_tenant, id) => {
        if (id === oppId) throw new Error('first run failure');
        return { score: 50 } as G0Computation;
      },
    });
    await rescoreTenantG0AfterPicChange(tenantId, change(auditEventId), {
      listOpportunityIds: async () => [oppId, secondOppId],
      rescore: async () => {
        throw new Error('second run failure');
      },
    });
    consoleError.mockRestore();

    const alerts = await alertsFor(auditEventId);
    expect(alerts).toHaveLength(1);
    // The repeat is counted on the one row. Its meta keeps the first run's counts (an open, low-severity point).
    expect(alerts[0]?.meta).toMatchObject({ alertRepeatCount: 2 });
  });

  it('logs the error code of a failed rescore, never its message (M12)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error(`value for ${pic}`), { code: 'P2028' });
    await rescoreTenantG0AfterPicChange(tenantId, change(`${key}-code`), {
      listOpportunityIds: async () => [oppId],
      rescore: async () => {
        throw error;
      },
    });
    const logged = consoleError.mock.calls.flat().map(String).join(' ');
    consoleError.mockRestore();
    expect(logged).toContain('P2028');
    expect(logged).not.toContain(pic);
  });

  it('the worker rethrows a failed queue write, so the queue retries the job (O1)', async () => {
    const auditEventId = `${key}-worker`;
    h.enqueueJob.mockRejectedValueOnce(new Error('queue is down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Every clock read jumps 30 s: the budget ends after the first opportunity, so the rest must be queued.
    let clock = 0;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 30_000));
    try {
      await expect(
        g0RescoreTenantTask(
          { tenantId, trigger: 'tenant_saved', auditEventId },
          { job: { id: '3', attempts: 1, max_attempts: 5 }, logger: { info() {}, warn() {}, error() {}, debug() {} } } as unknown as Parameters<typeof g0RescoreTenantTask>[1],
        ),
      ).rejects.toThrow('queue is down');
    } finally {
      nowSpy.mockRestore();
      consoleError.mockRestore();
    }
    expect(h.enqueueJob).toHaveBeenCalledTimes(1);
    // The retry is the queue's; the request path's "could not queue" alert is not raised for it.
    expect(await alertsFor(auditEventId)).toEqual([]);
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
