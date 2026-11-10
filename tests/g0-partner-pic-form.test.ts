/**
 * FO-396 B3 — a partner's G0 score follows the PIC through the profile form.
 *
 * A partner with no CORDIS record gets the 75-point basis only while the EU register says FOUND
 * (FO-396). This test runs the real profile action on a real database: clearing the PIC on the form
 * must replace the stored score with the standard-basis score, and the stored score must equal a
 * fresh computation. No rule is written down here; the scorer decides.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  scope: null as Record<string, unknown> | null,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ requireTenantAction: vi.fn(async () => h.scope) }));
// The save path may queue a PIC retry; this test does not need the queue.
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: vi.fn(async () => ({ added: true })) }));

import { updateTenantProfile } from '@/app/[locale]/(app)/[workspace]/settings/profile/actions';
import { prisma, withTenant } from '@/lib/db';
import { computeG0ForOpportunity, rescoreOpportunityG0 } from '@/lib/scoring/g0-compute';
import { presentIds, requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const newPic = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999));
const profile = { capabilities: 'Grid flexibility pilots', keywords: 'grid flexibility', trlMin: 4, trlMax: 7 };

describe('FO-396 B3: a partner loses the register grant when the PIC is cleared on the form', () => {
  let key: string;
  let tenantId: string;
  let userId: string;
  let topicId: string;
  let oppId: string;
  let pic: string;
  let otherPic: string;

  const stored = async () => {
    const opp = await prisma.opportunity.findUnique({ where: { id: oppId }, select: { g0Score: true } });
    const match = await prisma.topicMatch.findFirst({ where: { opportunityId: oppId }, select: { g0Score: true } });
    return { opportunity: opp?.g0Score ?? null, topicMatch: match?.g0Score ?? null };
  };
  const fresh = async () => withTenant(tenantId, (tx) => computeG0ForOpportunity(tx, tenantId, oppId));

  beforeEach(async () => {
    key = `fo396b3-${suffix()}`;
    tenantId = `${key}-t`;
    userId = `${key}-u`;
    topicId = `${key}-topic`;
    oppId = `${key}-opp`;
    pic = newPic();
    otherPic = newPic();

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: tenantId,
        slug: tenantId,
        country: 'TR',
        orgType: 'SME',
        pic,
        picRegistryStatus: 'FOUND',
        picRegistryCheckedAt: new Date(),
      },
    });
    await prisma.workspace.create({ data: { id: `${tenantId}-w`, tenantId, name: tenantId, slug: tenantId } });
    await prisma.tenantProfile.create({
      data: { tenantId, capabilities: 'Grid', keywords: ['grid flexibility'], trlRange: [4, 7], naceCodes: [], preferredRoles: [] },
    });
    await prisma.user.create({ data: { id: userId, email: `${key}@test.local`, name: 'Owner' } });
    await prisma.membership.create({ data: { tenantId, userId, role: 'TENANT_OWNER' } });
    h.scope = { tenantId, userId, role: 'TENANT_OWNER' };

    // The CORDIS table is loaded (non-empty) but holds no record for this partner's PIC: a measured
    // "no history". The other organisation is what makes the table non-empty.
    await prisma.cordisOrganization.create({ data: { organisationId: otherPic, name: `Other ${key}`, country: 'TR' } });
    await prisma.cordisProject.create({ data: { id: `${key}-p`, title: 'P', framework: 'HORIZON', masterCall: 'HORIZON-FO396-2026-01' } });
    await prisma.cordisParticipation.create({ data: { projectId: `${key}-p`, organisationId: otherPic, role: 'coordinator' } });

    await prisma.programme.create({ data: { id: `${key}-pr`, name: key, sourceKey: key } });
    await prisma.call.create({ data: { id: `${key}-c`, programmeId: `${key}-pr`, callIdentifier: `${key}-c`, title: 'C', currency: 'EUR' } });
    await prisma.topic.create({
      data: {
        id: topicId,
        callId: `${key}-c`,
        identifier: `HORIZON-FO396-2026-01-D1-${key}`,
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
    await prisma.opportunity.create({
      data: { id: oppId, tenantId, workspaceId: `${tenantId}-w`, title: oppId, topicId, stage: 'G0', status: 'ACTIVE', intendedRole: 'partner' },
    });
  });

  afterEach(async () => {
    const tenant = requireId(tenantId, 'tenantId');
    await prisma.topicMatch.deleteMany({ where: { tenantId: tenant } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: tenant } });
    await prisma.opportunity.deleteMany({ where: { tenantId: tenant } });
    await prisma.topic.deleteMany({ where: { id: requireId(topicId, 'topicId') } });
    await prisma.call.deleteMany({ where: { id: requireId(`${key}-c`, 'call') } });
    await prisma.programme.deleteMany({ where: { id: requireId(`${key}-pr`, 'programme') } });
    await prisma.cordisParticipation.deleteMany({ where: { projectId: requireId(`${key}-p`, 'project') } });
    await prisma.cordisProject.deleteMany({ where: { id: requireId(`${key}-p`, 'project') } });
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: requireId(otherPic, 'otherPic') } });
    await prisma.membership.deleteMany({ where: { tenantId: tenant } });
    await prisma.workspace.deleteMany({ where: { tenantId: tenant } });
    await prisma.user.deleteMany({ where: { id: requireId(userId, 'userId') } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenant.deleteMany({ where: { id: { in: presentIds([tenant]) } } });
  });

  it('a FOUND partner keeps the 75-point basis; clearing the PIC on the form drops it to the standard basis, stored', async () => {
    await rescoreOpportunityG0(tenantId, oppId);
    const before = await fresh();
    expect(before?.scoringBasis).toBe('no_history_evidence');
    expect(before?.score).not.toBeNull();
    expect(await stored()).toEqual({ opportunity: before?.score ?? null, topicMatch: before?.score ?? null });

    expect(await updateTenantProfile({ ...profile, pic: '' })).toEqual({ ok: true, pic: { status: 'cleared' } });

    const after = await fresh();
    expect(after?.scoringBasis).toBe('standard');
    expect(after?.score).not.toBeNull();
    // Removing the PIC never raises the score: the 75-point basis was the only thing lifting it.
    expect(after!.score!).toBeLessThanOrEqual(before!.score!);
    expect(await stored()).toEqual({ opportunity: after?.score ?? null, topicMatch: after?.score ?? null });
  });

  it('a PIC still on the form and FOUND keeps the 75-point basis after an unrelated profile save', async () => {
    await rescoreOpportunityG0(tenantId, oppId);
    const before = await fresh();
    expect(await updateTenantProfile({ ...profile, pic, confirmedPic: pic })).toMatchObject({ ok: true });
    const after = await fresh();
    expect(after?.scoringBasis).toBe('no_history_evidence');
    expect(after?.score).toBe(before?.score);
  });
});
