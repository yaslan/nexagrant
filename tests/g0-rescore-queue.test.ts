/**
 * FO-384 B2 — a tenant whose rescore does not fit in one request's budget is finished by the queue.
 *
 * Real database and the real queue table (graphile-worker's `graphile_worker._private_jobs`): the request
 * side queues the rest, the queued row is read back, and the task is run on its payload. Every
 * score is compared with what the canonical scorer says now, so no scoring rule is written here.
 */
import type { JobHelpers } from 'graphile-worker';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@/lib/db';
import { computeG0ForOpportunity } from '@/lib/scoring/g0-compute';
import { rescoreTenantG0AfterPicChange, type G0RescoreRun } from '@/lib/scoring/g0-rescore-tenant';
import { g0RescoreTenantTask } from '@/lib/jobs/tasks/g0-rescore-tenant';
import { requireId } from './helpers/teardown-guard';

const OPPORTUNITIES = 30;
const STALE = 1;

describe('FO-384 B2: the rest of a G0 rescore is queued and finished', () => {
  const key = `fo384q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantId = `${key}-t`;
  const pic = String(100_000_000 + Math.floor(Math.random() * 899_999_999));
  const topicId = `${key}-topic`;
  const auditEventId = `${key}-audit`;
  const oppIds = Array.from({ length: OPPORTUNITIES }, (_, i) => `${key}-opp-${String(i).padStart(2, '0')}`);

  /** The stored scores in the order of `oppIds` (their ids sort the same way). */
  const storedScores = async (): Promise<Array<number | null>> =>
    (await prisma.opportunity.findMany({ where: { id: { in: oppIds } }, select: { id: true, g0Score: true }, orderBy: { id: 'asc' } })).map(
      (r) => r.g0Score,
    );

  beforeEach(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId, country: 'TR', orgType: 'SME' } });
    await prisma.workspace.create({ data: { id: `${tenantId}-w`, tenantId, name: tenantId, slug: tenantId } });
    await prisma.tenantProfile.create({
      data: { tenantId, capabilities: 'Grid', keywords: ['grid flexibility'], trlRange: [4, 7], naceCodes: [], preferredRoles: [] },
    });
    await prisma.cordisOrganization.create({ data: { organisationId: pic, name: `Org ${key}`, country: 'TR' } });
    await prisma.cordisProject.create({ data: { id: `${key}-p`, title: 'P', framework: 'HORIZON', masterCall: 'HORIZON-FO384Q-2026-01' } });
    await prisma.cordisParticipation.create({ data: { projectId: `${key}-p`, organisationId: pic, role: 'coordinator' } });
    await prisma.programme.create({ data: { id: `${key}-pr`, name: key, sourceKey: key } });
    await prisma.call.create({ data: { id: `${key}-c`, programmeId: `${key}-pr`, callIdentifier: `${key}-c`, title: 'C', currency: 'EUR' } });
    await prisma.topic.create({
      data: {
        id: topicId,
        callId: `${key}-c`,
        identifier: `HORIZON-FO384Q-2026-01-D1-${key}`,
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
    await prisma.tenant.update({ where: { id: tenantId }, data: { pic } });
    for (const id of oppIds) {
      await prisma.opportunity.create({
        data: { id, tenantId, workspaceId: `${tenantId}-w`, title: id, topicId, stage: 'G0', status: 'ACTIVE', intendedRole: 'coordinator', g0Score: STALE },
      });
    }
  });

  afterEach(async () => {
    const tid = requireId(tenantId, 'tenantId');
    await prisma.$executeRaw`DELETE FROM graphile_worker._private_jobs WHERE key LIKE ${`g0-rescore-tenant:${auditEventId}%`}`;
    await prisma.topicMatch.deleteMany({ where: { tenantId: tid } });
    await prisma.opportunity.deleteMany({ where: { tenantId: tid } });
    await prisma.topic.deleteMany({ where: { id: requireId(topicId, 'topicId') } });
    await prisma.call.deleteMany({ where: { id: requireId(`${key}-c`, 'call') } });
    await prisma.programme.deleteMany({ where: { id: requireId(`${key}-pr`, 'programme') } });
    await prisma.cordisParticipation.deleteMany({ where: { projectId: requireId(`${key}-p`, 'project') } });
    await prisma.cordisProject.deleteMany({ where: { id: requireId(`${key}-p`, 'project') } });
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: requireId(pic, 'pic') } });
    await prisma.workspace.deleteMany({ where: { tenantId: tid } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  });

  it('a rescore that stops at its budget queues one job per cursor, and the job finishes the tenant', async () => {
    // A budget of zero: the request reaches no opportunity and hands all of them to the queue.
    const summary = await rescoreTenantG0AfterPicChange(tenantId, { trigger: 'tenant_saved', auditEventId }, { budgetMs: 0 });
    expect(summary).toEqual({ total: OPPORTUNITIES, rescored: 0, cleared: 0, failed: 0, skipped: OPPORTUNITIES, archived: 0, queued: true });
    expect(await storedScores()).toEqual(Array(OPPORTUNITIES).fill(STALE));

    const rows = await prisma.$queryRaw<Array<{ task_identifier: string; key: string; payload: G0RescoreRun & { tenantId: string } }>>`
      SELECT t.identifier AS task_identifier, j.key, j.payload FROM graphile_worker._private_jobs j JOIN graphile_worker._private_tasks t ON t.id = j.task_id WHERE j.key LIKE ${`g0-rescore-tenant:${auditEventId}%`}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      task_identifier: 'g0-rescore-tenant',
      key: `g0-rescore-tenant:${auditEventId}:start`,
      payload: { tenantId, trigger: 'tenant_saved', auditEventId },
    });

    // The queue runs the task on that payload.
    const helpers = { job: { id: '1', attempts: 1, max_attempts: 5 }, logger: { info() {}, warn() {}, error() {}, debug() {} } } as unknown as JobHelpers;
    await g0RescoreTenantTask(rows[0]!.payload, helpers);

    const fresh = await Promise.all(
      oppIds.map((id) => withTenant(tenantId, (tx) => computeG0ForOpportunity(tx, tenantId, id)).then((c) => c?.score ?? null)),
    );
    expect(fresh.every((score) => score !== null)).toBe(true);
    expect(await storedScores()).toEqual(fresh);
  });

  it('the task resumes after the afterId in its payload: what was reached stays as it was (Y1)', async () => {
    const cursor = oppIds[14]!;
    const helpers = { job: { id: '2', attempts: 1, max_attempts: 5 }, logger: { info() {}, warn() {}, error() {}, debug() {} } } as unknown as JobHelpers;

    await g0RescoreTenantTask({ tenantId, trigger: 'tenant_saved', auditEventId: `${auditEventId}-cursor`, afterId: cursor }, helpers);

    const scores = await storedScores();
    // Ids up to and including the cursor were reached by an earlier run, so the task must not touch them.
    expect(scores.slice(0, 15)).toEqual(Array(15).fill(STALE));
    const fresh = await Promise.all(
      oppIds.slice(15).map((id) => withTenant(tenantId, (tx) => computeG0ForOpportunity(tx, tenantId, id)).then((c) => c?.score ?? null)),
    );
    expect(fresh.every((score) => score !== null)).toBe(true);
    expect(scores.slice(15)).toEqual(fresh);
  });
});
