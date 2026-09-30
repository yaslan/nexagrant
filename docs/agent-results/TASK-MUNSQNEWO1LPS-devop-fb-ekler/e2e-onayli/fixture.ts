// devop-fb İNCELEME-66 EK: spec fixture'larının (evidenceTenant) aynısı, tarayıcı yürütmesi için.
import { prisma } from '../src/lib/db';
import { evidenceTenant } from '../tests/e2e/fixtures/evidence-tenant';
const mode = process.argv[2];
const fab = evidenceTenant('fabrication');
const badge = evidenceTenant('badge');
const UNVERIFIED_ROW = { id: 'ev-unverified-mtrh86', tenantId: badge.tenantId, kind: 'certificate', category: 'CAT-03', title: 'Doğrulanmamış Test Belgesi', body: '', status: 'UNVERIFIED' };
async function main() {
  if (mode === 'setup') {
    await fab.setup(); await badge.setup();
    await prisma.evidence.deleteMany({ where: { id: UNVERIFIED_ROW.id } });
    await prisma.evidence.create({ data: UNVERIFIED_ROW as any });
    console.log('setup ok', fab.email, fab.evidenceUrl, badge.email, badge.evidenceUrl);
  } else if (mode === 'check') {
    for (const t of [fab, badge]) console.log(t.tenantId, JSON.stringify(await prisma.evidence.findMany({ where: { tenantId: t.tenantId }, select: { title: true, fileName: true, status: true, r2ObjectKey: true } as any })));
    console.log('claims', await prisma.claim.count({ where: { tenantId: { in: [fab.tenantId, badge.tenantId] } } }));
  } else if (mode === 'teardown') {
    await fab.teardown(); await badge.teardown();
    console.log('left evidence', await prisma.evidence.count({ where: { tenantId: { in: [fab.tenantId, badge.tenantId] } } }), 'tenants', await prisma.tenant.count({ where: { id: { in: [fab.tenantId, badge.tenantId] } } }));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
