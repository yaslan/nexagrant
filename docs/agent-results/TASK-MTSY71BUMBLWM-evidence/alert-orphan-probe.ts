import 'dotenv/config';
import { createDbClient } from '/Users/macbook/AgentSpace/fabrika/src/lib/db';
const prisma = createDbClient(process.env.DATABASE_URL!);
(async () => {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log('TENANTS (%d):', tenants.length, tenants);
  const mems = await prisma.membership.findMany({ select: { tenantId: true, role: true, user: { select: { email: true } } } });
  console.log('MEMBERSHIPS:', mems.map(m => `${m.user.email} @${m.tenantId} = ${m.role}`));
  const ident = await prisma.tenantBillingIdentity.findMany({ select: { tenantId:true, buyerName:true, buyerCountry:true }});
  console.log('IDENTITY ROWS:', ident.length, ident);

  const alerts = await prisma.systemAlert.findMany({ where: { source:'invoice_buyer_identity_missing', resolvedAt: null }, select: { meta: true }});
  const ids = alerts.map(a => (a.meta as any)?.tenantId).filter(Boolean) as string[];
  const live = new Set(tenants.map(t=>t.id));
  const alive = ids.filter(i=>live.has(i));
  console.log(`identity-missing open: ${alerts.length}; carrying a tenantId: ${ids.length}; whose tenant STILL EXISTS: ${alive.length} (distinct ${new Set(alive).size})`);
  console.log('live tenants named in alerts:', [...new Set(alive)]);
  await prisma.$disconnect();
})();
