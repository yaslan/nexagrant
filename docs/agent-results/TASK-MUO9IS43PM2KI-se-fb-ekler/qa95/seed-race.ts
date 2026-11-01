// tsx .qa95/seed-race.ts <day> <round> <users>: 3 ortak kiracı (pro, M4 ON), her kullanıcı üçüne üye, her birinde vadeli satır
import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const [day, r, n] = process.argv.slice(2) as [string, string, string];
const due = new Date(new Date(`${day}T07:00:00.000Z`).getTime() - 61 * 86_400_000);
async function main() {
  const ts = ['a', 'b', 'c'].map((x) => `t95-r${r}${x}`);
  for (const t of ts) {
    await admin.tenant.create({ data: { id: t, name: t, slug: t, country: 'TR' } });
    await admin.workspace.create({ data: { tenantId: t, name: 'Ana', slug: `ws-${t}` } });
    await admin.subscription.create({ data: { tenantId: t, planId: 'pro', status: 'ACTIVE' } });
    await admin.moduleState.create({ data: { tenantId: t, moduleId: 'M4', status: 'ON' } });
  }
  for (let i = 0; i < Number(n); i++) {
    const u = `u95-r${r}-${String(i).padStart(3, '0')}`;
    await admin.user.create({ data: { id: u, email: `${u}@example.test`, locale: 'tr' } });
    for (const t of ts) {
      await admin.membership.create({ data: { tenantId: t, userId: u } });
      await admin.relationship.create({ data: { tenantId: t, kind: 'partner', ownerUserId: u, counterpartName: `${u}-${t}`, lastContactAt: due } });
    }
  }
}
main().then(() => console.log('seeded round', r)).finally(() => admin.$disconnect());
