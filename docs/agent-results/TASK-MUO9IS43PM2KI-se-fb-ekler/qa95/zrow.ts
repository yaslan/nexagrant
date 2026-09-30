import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
admin.relationship.create({ data: { tenantId: 't95-z1b', kind: 'partner', ownerUserId: 'u95-z1', counterpartName: 'z1-after-midnight', lastContactAt: new Date(Date.parse('2026-10-22T00:00:10Z') - 60 * 86_400_000) } })
  .then(() => admin.$queryRawUnsafe<unknown[]>(`SHOW timezone`)).then((r) => console.log('owner tz', r)).finally(() => admin.$disconnect());
