/**
 * FO-396 (Ö4). The scorer's input is what `loadG0Snapshot` reads from the stored tenant row. A loader
 * that drops or hard-codes `picRegistryStatus` would leave every unit test green, so this one runs
 * against the real database: the same registered-looking tenant with each stored answer, and the
 * partner rule (`isNoHistoryPartner`) must change only for FOUND.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma, withTenant } from '@/lib/db';
import { isNoHistoryPartner } from '@/lib/scoring/g0-features';
import { loadG0Snapshot, type G0Subject } from '@/lib/scoring/g0-compute';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `fo396-loader-${suffix}`;
const pic = String(100_000_000 + Math.floor(Math.random() * 899_999_999));
const subject: G0Subject = { opportunityId: null, topicId: null, intendedRole: 'partner', seats: [] };
// CORDIS must be loaded (one participation row for someone else) for the tenant's PIC to be a
// "no record" at all; an empty table is missing data, not a history of zero.
const otherPic = String(100_000_000 + Math.floor(Math.random() * 899_999_999));
const otherProject = `fo396-loader-project-${suffix}`;

async function snapshotWith(status: 'FOUND' | 'NOT_FOUND' | 'UNKNOWN' | null) {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { picRegistryStatus: status, picRegistryCheckedAt: status === null ? null : new Date() },
  });
  return withTenant(tenantId, (tx) => loadG0Snapshot(tx, tenantId, subject));
}

describe('FO-396 loadG0Snapshot reads the stored register answer', () => {
  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: `fo396-loader-${suffix}`, slug: `fo396-loader-${suffix}`, country: 'TR', orgType: 'SME', kind: 'ORGANIZATION', pic },
    });
    await prisma.cordisOrganization.create({ data: { organisationId: otherPic, name: `FO-396 loader other ${suffix}`, country: 'DE' } });
    await prisma.cordisProject.create({
      data: { id: otherProject, framework: 'HORIZON', title: `FO-396 loader project ${suffix}`, masterCall: `FO396-LOADER-${suffix}` },
    });
    await prisma.cordisParticipation.create({ data: { projectId: otherProject, organisationId: otherPic, role: 'coordinator' } });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.cordisParticipation.deleteMany({ where: { projectId: otherProject } });
    await prisma.cordisProject.deleteMany({ where: { id: otherProject } });
    await prisma.cordisOrganization.deleteMany({ where: { organisationId: otherPic } });
  });

  it('passes FOUND through, and only FOUND earns the no-history grant', async () => {
    const snap = await snapshotWith('FOUND');
    expect(snap.tenant.picRegistryStatus).toBe('FOUND');
    expect(isNoHistoryPartner(snap)).toBe(true);
  });

  it.each([
    ['NOT_FOUND', 'NOT_FOUND'],
    ['UNKNOWN', 'UNKNOWN'],
    ['never checked', null],
  ] as const)('%s: no grant', async (_label, stored) => {
    const snap = await snapshotWith(stored);
    expect(snap.tenant.picRegistryStatus).toBe(stored);
    expect(isNoHistoryPartner(snap)).toBe(false);
  });
});
