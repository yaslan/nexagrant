// İNCELEME-95 fixture (owner connection). tsx .qa95/seed.ts <day> <user> <tenant:rowkind,...>...
// rowkind: due (61 gün, 07:00'de vadeli) | late (07:20'de vadeli) | none
import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const DAY = 86_400_000;
const [dayIso, u, ...specs] = process.argv.slice(2) as [string, string, ...string[]];
const T0 = new Date(`${dayIso}T07:00:00.000Z`);
async function main() {
  await admin.user.create({ data: { id: u, email: `${u}@example.test`, locale: 'tr' } });
  for (const s of specs) {
    const [t, kind] = s.split(':') as [string, string];
    if (!(await admin.tenant.findUnique({ where: { id: t } }))) {
      await admin.tenant.create({ data: { id: t, name: t, slug: t, country: 'TR' } });
      await admin.workspace.create({ data: { tenantId: t, name: 'Ana', slug: `ws-${t}` } });
      await admin.subscription.create({ data: { tenantId: t, planId: 'pro', status: 'ACTIVE' } });
      await admin.moduleState.create({ data: { tenantId: t, moduleId: 'M4', status: 'ON' } });
    }
    await admin.membership.create({ data: { tenantId: t, userId: u } });
    if (kind === 'none') continue;
    const at = kind === 'due' ? T0.getTime() - 61 * DAY : T0.getTime() - 60 * DAY + 20 * 60_000;
    await admin.relationship.create({ data: { tenantId: t, kind: 'partner', ownerUserId: u, counterpartName: `${u}-${t}-${kind}`, lastContactAt: new Date(at) } });
  }
}
main().then(() => console.log('seeded', u)).finally(() => admin.$disconnect());
