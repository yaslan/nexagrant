import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const DAY = 86_400_000;
async function main() {
  for (const [s, tick] of [['s10', '2026-10-02T03:00:00.000Z']] as const) {
    const T = Date.parse(tick);
    for (const x of ['a', 'b']) {
      const id = `i69-${s}-${x}`;
      await admin.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
      await admin.workspace.create({ data: { tenantId: id, name: 'Ana', slug: `ws-${id}` } });
      await admin.subscription.create({ data: { tenantId: id, planId: 'pro', status: 'ACTIVE' } });
      await admin.moduleState.create({ data: { tenantId: id, moduleId: 'M4', status: 'ON' } });
    }
    await admin.user.create({ data: { id: `u69-${s}`, email: `u69-${s}@example.test` } });
    for (const x of ['a', 'b']) await admin.membership.create({ data: { tenantId: `i69-${s}-${x}`, userId: `u69-${s}` } });
    await admin.relationship.create({ data: { tenantId: `i69-${s}-b`, kind: 'partner', ownerUserId: `u69-${s}`, counterpartName: `${s}-d`, lastContactAt: new Date(T - 60 * DAY) } });
    await admin.relationship.create({ data: { tenantId: `i69-${s}-a`, kind: 'partner', ownerUserId: `u69-${s}`, counterpartName: `${s}-late`, lastContactAt: new Date(T - 60 * DAY + 20 * 60_000) } });
  }
  console.log('seeded tz');
}
main().finally(() => admin.$disconnect());
