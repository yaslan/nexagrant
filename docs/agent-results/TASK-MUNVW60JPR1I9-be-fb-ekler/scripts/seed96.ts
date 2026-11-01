// TASK-MUNVW60JPR1I9 fixture seed (owner connection). Usage: tsx .qa-scratch/seed96.ts <day-iso> <prefix> <scenario...>
// Each scenario: tenants <p>-<s>-a/b (pro, M4 ON), user u96-<s>-<p>, member of both;
// b's row is due at 07:00, a's row goes stale at 07:20.
import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const DAY = 86_400_000;
const [dayIso, p, ...scen] = process.argv.slice(2) as [string, string, ...string[]];
const T0 = new Date(`${dayIso}T07:00:00.000Z`);
async function tenant(id: string) {
  await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
  await admin.workspace.create({ data: { tenantId: id, name: 'Ana', slug: `ws-${id}` } });
  await admin.subscription.create({ data: { tenantId: id, planId: 'pro', status: 'ACTIVE' } });
  await admin.moduleState.create({ data: { tenantId: id, moduleId: 'M4', status: 'ON' } });
}
async function main() {
  for (const s of scen) {
    const a = `i96-${p}-${s}-a`, b = `i96-${p}-${s}-b`, u = `u96-${s}-${p}`;
    await tenant(a); await tenant(b);
    await admin.user.create({ data: { id: u, email: `${u}@example.test`, locale: 'tr' } });
    await admin.membership.create({ data: { tenantId: a, userId: u } });
    await admin.membership.create({ data: { tenantId: b, userId: u } });
    await admin.relationship.create({ data: { tenantId: b, kind: 'partner', ownerUserId: u, counterpartName: `${s}-due0700`, lastContactAt: new Date(T0.getTime() - 61 * DAY) } });
    await admin.relationship.create({ data: { tenantId: a, kind: 'partner', ownerUserId: u, counterpartName: `${s}-late0720`, lastContactAt: new Date(T0.getTime() - 60 * DAY + 20 * 60_000) } });
  }
  console.log('seeded', p, scen.join(','));
}
main().finally(() => admin.$disconnect());
