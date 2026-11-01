/**
 * TASK-MTTUUGKNDGBXK step 2 — is each open alert STILL TRUE today? Read-only.
 *
 * The step-1 probe counted the pile. This one asks the only question that
 * decides whether a row belongs on an operator's screen: is the condition that
 * produced it still the case? Nothing here writes, updates or deletes.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';
import { findCountryVatRate } from '../../../src/lib/billing/vat-rates';

const REQUIRED = ['buyerName', 'buyerVknTckn', 'buyerTaxOffice', 'buyerAddress', 'buyerCity'] as const;

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function main() {
  const open = await prisma.systemAlert.findMany({
    where: { resolvedAt: null },
    select: { id: true, level: true, source: true, message: true, meta: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`open alerts examined: ${open.length}\n`);

  // ---- group 1: invoice_buyer_identity_missing (the 77% block) ----
  const identity = open.filter((r) => r.source === 'invoice_buyer_identity_missing');
  const tenantIds = [...new Set(identity.map((r) => String(asObject(r.meta).tenantId ?? '')).filter(Boolean))];
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true },
  });
  const liveTenant = new Set(tenants.map((t) => t.id));
  const identities = await prisma.tenantBillingIdentity.findMany({
    where: { tenantId: { in: tenantIds } },
  });
  const byTenant = new Map(identities.map((i) => [i.tenantId, i]));

  let stillMissing = 0;
  let nowComplete = 0;
  let tenantGone = 0;
  for (const tid of tenantIds) {
    if (!liveTenant.has(tid)) { tenantGone += 1; continue; }
    const row = byTenant.get(tid);
    const complete = !!row && REQUIRED.every((k) => String((row as Record<string, unknown>)[k] ?? '').trim() !== '');
    if (complete) nowComplete += 1; else stillMissing += 1;
  }

  console.log('=== invoice_buyer_identity_missing ===');
  console.log(`rows                          : ${identity.length}`);
  console.log(`distinct tenantId in meta     : ${tenantIds.length}`);
  console.log(`  tenant row no longer exists : ${tenantGone}   -> alert can never come true again`);
  console.log(`  billing identity now COMPLETE: ${nowComplete}  -> condition self-healed, row still open`);
  console.log(`  billing identity STILL missing: ${stillMissing} -> condition live today`);
  console.log(`TenantBillingIdentity rows in DB (any tenant): ${await prisma.tenantBillingIdentity.count()}`);
  console.log(`Tenant rows in DB                            : ${await prisma.tenant.count()}`);

  // ---- group 2: invoice_vat_country_unknown ----
  console.log('\n=== invoice_vat_country_unknown ===');
  for (const r of open.filter((x) => x.source === 'invoice_vat_country_unknown')) {
    const c = String(asObject(r.meta).country ?? '');
    const hit = findCountryVatRate(c);
    console.log(`  ${r.id} country=${JSON.stringify(c)} -> ${hit ? `RESOLVES NOW to ${hit.country} @ ${hit.ratePercent}% (${hit.regime}) => STALE` : 'still unknown => LIVE'}`);
  }

  // ---- group 3: hosts referenced by the fetch-failure alerts ----
  console.log('\n=== hosts / endpoints the fetch-failure alerts point at ===');
  for (const r of open) {
    const m = asObject(r.meta);
    const host = m.host ?? m.detail;
    if (!host) continue;
    console.log(`  ${r.source.padEnd(32)} ${String(host).slice(0, 90)}`);
  }
  console.log(`\n  WORKER_URL configured now : ${process.env.WORKER_URL ?? '(unset)'}`);
  console.log(`  TCMB_BASE_URL configured  : ${process.env.TCMB_BASE_URL ?? '(unset)'}`);
  console.log(`  CORDIS_* env keys present : ${Object.keys(process.env).filter((k) => k.includes('CORDIS')).join(', ') || '(none)'}`);

  // ---- group 4: rows whose meta names a month/run that is a test fixture ----
  console.log('\n=== alerts whose meta names a probe/test run ===');
  for (const r of open) {
    const s = JSON.stringify(r.meta ?? {});
    if (/probe|test|127\.0\.0\.1|localhost/i.test(s)) {
      console.log(`  ${r.createdAt.toISOString()}  ${r.source}  ${s.slice(0, 120)}`);
    }
  }

  // ---- group 5: standing-policy alerts that can never self-resolve ----
  console.log('\n=== standing-policy alerts (no condition to re-check) ===');
  for (const r of open.filter((x) => ['invoice_profile_assumed'].includes(x.source))) {
    console.log(`  ${r.source}: ${r.message.slice(0, 120)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
