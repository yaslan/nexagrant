/** READ-ONLY. Do the two open invoice_vat_country_unknown alerts still hold? */
import { findCountryVatRate, supportedVatCountries, chargeableVatCountries } from '@/lib/billing/vat-rates';
import { prisma } from '@/lib/db';

console.log('supported countries :', supportedVatCountries().join(', '));
console.log('chargeable countries:', chargeableVatCountries().join(', '));
console.log();
for (const c of ['Türkiye', 'TR', 'Turkey', 'Kuwait', 'KW']) {
  const r = findCountryVatRate(c);
  console.log(`findCountryVatRate(${JSON.stringify(c)}) -> ${r ? `${r.country} ${r.ratePercent ?? '?'}% ${r.regime}` : 'null (alert would fire)'}`);
}

console.log('\n=== the countries the two open alerts actually named ===');
const rows = await prisma.systemAlert.findMany({
  where: { resolvedAt: null, source: 'invoice_vat_country_unknown' },
  select: { meta: true, createdAt: true },
});
for (const r of rows) {
  const m = (r.meta ?? {}) as Record<string, unknown>;
  const country = (m.country ?? m.buyerCountry ?? '(not in meta)') as string;
  const now = typeof country === 'string' ? findCountryVatRate(country) : null;
  console.log(`  ${r.createdAt.toISOString()}  country=${JSON.stringify(country)} -> today: ${now ? `${now.country} ${now.ratePercent}% ${now.regime} => STALE` : 'still unresolved => LIVE'}`);
}
await prisma.$disconnect();
