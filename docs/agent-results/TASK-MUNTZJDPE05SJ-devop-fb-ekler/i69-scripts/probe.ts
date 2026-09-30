import { withTenant } from '@/lib/db';
async function main() {
  for (const t of ['i69-s3-a', 'i69-s3-b']) {
    try {
      const n = await withTenant(t, (tx) => tx.relationship.count({ where: { tenantId: t } }));
      console.log(t, 'ok', n);
    } catch (e) { console.log(t, 'FAIL', (e as Error).message.split('\n').slice(-1)[0]); }
    try {
      const m = await withTenant(t, (tx) => tx.membership.findMany({ where: { tenantId: t }, select: { userId: true, staleDigestOn: true } }));
      console.log(t, 'members', JSON.stringify(m));
    } catch (e) { console.log(t, 'member FAIL'); }
  }
}
main().then(() => process.exit(0));
