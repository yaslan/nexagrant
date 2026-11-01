// Between run 1 (07:00) and run 2 (07:22): skip the claimed tenant in different ways.
import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const DAY = 86_400_000;
async function main() {
  await admin.moduleState.update({ where: { tenantId_moduleId: { tenantId: 'i69-s1-b', moduleId: 'M4' } }, data: { status: 'OFF' } });
  await admin.subscription.updateMany({
    where: { tenantId: 'i69-s2-b' },
    data: { planId: 'public-team', status: 'TRIALING', provider: 'pilot', trialEndsAt: new Date('2026-09-30T07:10:00.000Z') },
  });
  // S3: every read of i69-s3-b's relationships raises (division by zero) — a real DB error inside collectTenant.
  await admin.$executeRawUnsafe(`CREATE POLICY i69_fail ON "Relationship" AS RESTRICTIVE FOR SELECT USING (CASE WHEN "tenantId" = 'i69-s3-b' THEN (1/0) = 1 ELSE true END)`);
  // S6: user joins a brand-new tenant holding a stale row of theirs; the claimed tenant is skipped.
  await admin.tenant.create({ data: { id: 'i69-s6-c', name: 'i69-s6-c', slug: 'i69-s6-c', country: 'TR' } });
  await admin.workspace.create({ data: { tenantId: 'i69-s6-c', name: 'Ana', slug: 'ws-i69-s6-c' } });
  await admin.subscription.create({ data: { tenantId: 'i69-s6-c', planId: 'pro', status: 'ACTIVE' } });
  await admin.moduleState.create({ data: { tenantId: 'i69-s6-c', moduleId: 'M4', status: 'ON' } });
  await admin.membership.create({ data: { tenantId: 'i69-s6-c', userId: 'u69-s6' } });
  await admin.relationship.create({ data: { tenantId: 'i69-s6-c', kind: 'partner', ownerUserId: 'u69-s6', counterpartName: 's6-c-IMPORTED', lastContactAt: new Date(Date.parse('2026-09-30T07:00:00Z') - 90 * DAY) } });
  await admin.moduleState.update({ where: { tenantId_moduleId: { tenantId: 'i69-s6-a', moduleId: 'M4' } }, data: { status: 'OFF' } });
  // S7: user leaves the tenant that holds today's claim.
  await admin.membership.delete({ where: { tenantId_userId: { tenantId: 'i69-s7-b', userId: 'u69-s7' } } });
  // S4: a row that goes stale at the last ms of the day; the claimed tenant closes M4.
  await admin.relationship.create({ data: { tenantId: 'i69-s4-a', kind: 'partner', ownerUserId: 'u69-s4', counterpartName: 's4-e-LASTMS', lastContactAt: new Date(Date.parse('2026-09-30T23:59:59.999Z') - 60 * DAY) } });
  await admin.moduleState.update({ where: { tenantId_moduleId: { tenantId: 'i69-s4-b', moduleId: 'M4' } }, data: { status: 'OFF' } });
  console.log('mutated');
}
main().finally(() => admin.$disconnect());
