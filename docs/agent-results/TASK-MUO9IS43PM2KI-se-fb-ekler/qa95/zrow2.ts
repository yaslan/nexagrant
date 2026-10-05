import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
admin.relationship.create({ data: { tenantId: 't95-z2b', kind: 'partner', ownerUserId: 'u95-z2', counterpartName: 'z2-2359-40', lastContactAt: new Date(Date.parse('2026-10-23T23:59:40Z') - 60 * 86_400_000) } })
  .finally(() => admin.$disconnect());
