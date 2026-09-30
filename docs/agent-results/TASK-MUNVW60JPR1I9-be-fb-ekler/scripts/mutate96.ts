// Usage: tsx .qa-scratch/mutate96.ts <prefix> <action> <scenario>
//   leave  : the user leaves tenant b (Membership row hard-deleted)
//   dropb  : tenant b is deleted (Tenant row, cascades to Membership)
//   claims : print the user's claims
import { createDbClient } from '@/lib/db';
const admin = createDbClient(process.env.OWNER_URL!);
const [p, action, s] = process.argv.slice(2) as [string, string, string];
const b = `i96-${p}-${s}-b`, u = `u96-${s}-${p}`;
async function main() {
  if (action === 'leave') await admin.membership.delete({ where: { tenantId_userId: { tenantId: b, userId: u } } });
  if (action === 'dropb') await admin.tenant.delete({ where: { id: b } });
  await admin.$executeRawUnsafe(`SELECT set_config('app.system_scope','on',false)`);
  const m = await admin.$queryRawUnsafe(`SELECT "tenantId", "staleDigestOn"::text FROM "Membership" WHERE "userId" = $1 ORDER BY 1`, u);
  const hasUserCol = ((await admin.$queryRawUnsafe(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='User' AND column_name='staleDigestOn'`)) as Array<{ n: number }>)[0]!.n;
  const usr = hasUserCol ? await admin.$queryRawUnsafe(`SELECT "staleDigestOn"::text FROM "User" WHERE id = $1`, u) : 'n/a';
  console.log(action, u, 'membership', JSON.stringify(m), 'user', JSON.stringify(usr));
}
main().finally(() => admin.$disconnect());
