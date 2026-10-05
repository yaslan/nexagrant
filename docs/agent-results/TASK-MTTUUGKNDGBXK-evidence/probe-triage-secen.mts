/**
 * TASK-MTTUUGKNDGBXK re-triage (sec-en). READ-ONLY.
 * Answers three things the triage table needs, freshly:
 *   1. how much headroom is left before the console's MAX_ROWS = 300 cap
 *   2. for every open alert carrying meta.tenantId, does that tenant still exist
 *   3. growth rate over the last 24h / 6h / 1h
 * Nothing here creates, updates or deletes a row.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';

const MAX_ROWS = 300; // src/app/[locale]/admin/alerts/page.tsx:12

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function main() {
  const now = new Date();
  const total = await prisma.systemAlert.count();
  const open = await prisma.systemAlert.count({ where: { resolvedAt: null } });

  console.log(`probe run at            : ${now.toISOString()}`);
  console.log(`total rows              : ${total}`);
  console.log(`open                    : ${open}`);
  console.log(`resolved                : ${total - open}`);
  console.log(`console MAX_ROWS        : ${MAX_ROWS}`);
  console.log(`headroom left           : ${MAX_ROWS - total} rows`);

  console.log('\n=== growth rate (rows created in the window) ===');
  for (const [label, hours] of [['last 1h', 1], ['last 6h', 6], ['last 24h', 24], ['last 72h', 72]] as const) {
    const since = new Date(now.getTime() - hours * 3600_000);
    const n = await prisma.systemAlert.count({ where: { createdAt: { gte: since } } });
    console.log(`  ${label.padEnd(9)}: ${String(n).padStart(4)} rows  (${(n / hours).toFixed(1)}/h)`);
  }

  console.log('\n=== do the tenants named in meta.tenantId still exist? ===');
  const rows = await prisma.systemAlert.findMany({
    where: { resolvedAt: null },
    select: { id: true, source: true, meta: true, createdAt: true },
  });
  const withTenant = rows.filter((r) => typeof asObj(r.meta).tenantId === 'string');
  const ids = [...new Set(withTenant.map((r) => String(asObj(r.meta).tenantId)))];
  const alive = await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const aliveSet = new Set(alive.map((t) => t.id));

  const dead = withTenant.filter((r) => !aliveSet.has(String(asObj(r.meta).tenantId)));
  const live = withTenant.filter((r) => aliveSet.has(String(asObj(r.meta).tenantId)));

  console.log(`open rows carrying meta.tenantId : ${withTenant.length}`);
  console.log(`  distinct tenantIds             : ${ids.length}`);
  console.log(`  tenants that STILL EXIST       : ${aliveSet.size} -> ${[...aliveSet].join(', ') || '(none)'}`);
  console.log(`  rows whose tenant IS GONE      : ${dead.length}  <- can never become true again`);
  console.log(`  rows whose tenant is alive     : ${live.length}`);
  console.log(`open rows with NO meta.tenantId  : ${rows.length - withTenant.length}`);

  console.log('\n  gone-tenant rows by source:');
  const bySource = new Map<string, number>();
  for (const r of dead) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
  for (const [s, n] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${s}`);

  console.log('\n  live-tenant rows (the ones a human may still need):');
  for (const r of live) {
    console.log(`    ${r.createdAt.toISOString()}  ${r.source}  tenant=${String(asObj(r.meta).tenantId)}`);
  }

  console.log('\n=== id shape of the gone tenants (which test made them) ===');
  const shape = new Map<string, number>();
  for (const r of dead) {
    const t = String(asObj(r.meta).tenantId);
    const k = t.startsWith('t-idem-') ? 't-idem-*  (stripe-webhook-idempotency.live.test.ts)'
      : t.startsWith('cmt') ? 'cuid cmt* (e2e invoice-write-path.spec.ts)'
      : `other: ${t}`;
    shape.set(k, (shape.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...shape].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  const after = await prisma.systemAlert.count();
  console.log(`\n[self-check] rows before=${total} after=${after} -> probe wrote nothing: ${total === after ? 'YES' : 'NO'}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
