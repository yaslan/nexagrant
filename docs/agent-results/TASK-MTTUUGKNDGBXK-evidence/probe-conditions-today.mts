/** READ-ONLY. For each alert source: is the CONDITION that produced it still
 *  true today? Reads env + DB only; writes nothing. */
import { prisma } from '@/lib/db';

const show = (k: string) => {
  const v = process.env[k];
  return v ? `set (len=${v.length})` : 'UNSET';
};

console.log('=== env the alerting jobs depend on ===');
for (const k of [
  'OPENAI_API_KEY', 'WORKER_URL', 'TCMB_BASE_URL', 'INVOICE_VAT_RATE',
  'CORDIS_DELTA_URL', 'CORDIS_DELTA_ENDPOINT', 'CORDIS_HE_ZIP_URL', 'CORDIS_H2020_ZIP_URL',
  'INVOICE_SUPPLIER_NAME', 'INVOICE_SUPPLIER_VKN',
]) console.log(`  ${k.padEnd(24)} ${show(k)}`);

console.log('\n=== billing identity: can the %77 alert still fire? ===');
const tenants = await prisma.tenant.count();
const identities = await prisma.tenantBillingIdentity.count();
console.log(`  Tenant rows                 : ${tenants}`);
console.log(`  TenantBillingIdentity rows  : ${identities}`);
console.log(`  tenants with NO identity    : ${tenants - identities}  -> each is one future alert on next payment`);

console.log('\n=== how many open alerts point at a tenant that no longer exists ===');
const rows = await prisma.systemAlert.findMany({
  where: { resolvedAt: null, source: 'invoice_buyer_identity_missing' },
  select: { meta: true },
});
const ids = new Set<string>();
for (const r of rows) {
  const t = (r.meta as Record<string, unknown> | null)?.tenantId;
  if (typeof t === 'string') ids.add(t);
}
const alive = await prisma.tenant.findMany({ where: { id: { in: [...ids] } }, select: { id: true } });
const aliveSet = new Set(alive.map((t) => t.id));
console.log(`  distinct tenantId in those alerts : ${ids.size}`);
console.log(`  tenant still exists               : ${aliveSet.size}`);
console.log(`  tenant DELETED (test debris)      : ${ids.size - aliveSet.size}`);

console.log('\n=== VAT: do the two invoice_vat_country_unknown alerts still hold? ===');
const vat = await import('@/lib/billing/vat-rates');
for (const c of ['Türkiye', 'TR', 'Turkey']) {
  try {
    const r = (vat as Record<string, (s: string) => unknown>).resolveVatRate?.(c);
    console.log(`  resolveVatRate(${JSON.stringify(c)}) -> ${JSON.stringify(r)}`);
  } catch (e) {
    console.log(`  resolveVatRate(${JSON.stringify(c)}) threw: ${(e as Error).message}`);
  }
}

await prisma.$disconnect();
