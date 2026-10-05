/**
 * Orphan-alert gate: does any OPEN `SystemAlert` name a tenant that no longer
 * exists? (TASK-MTVFWYKIZXRB1)
 *
 *   pnpm alerts:check
 *
 * Why this gate exists, measured rather than argued. `SystemAlert` is
 * deliberately tenant-agnostic: it has no `tenantId` column and no RLS policy
 * (src/lib/observability/system-alert.ts, prisma/rls.sql), because the K1/K2
 * fetchers and the CORDIS importer raise alerts that belong to no tenant at
 * all. Test fixtures, meanwhile, clean up with the only sweep available to
 * them — "delete every row of mine from the tenant-scoped tables, then delete
 * the tenant". `SystemAlert` is the one table that sweep cannot reach.
 *
 * The consequence is not theoretical. On 2026-09-10 the table held 268 open
 * alerts; 234 of them (87%) named tenants that had already been deleted by the
 * fixture that created them — 164 from tests/stripe-webhook-idempotency.live.test.ts
 * and 70 from tests/e2e/invoice-write-path.spec.ts. They can never become true
 * again and no operator can act on them, yet /[locale]/admin/alerts renders
 * only the newest 300 rows, so the pile was ~32 rows from pushing every real
 * alert off the screen. The genuine tenant-agnostic alerts do NOT behave this
 * way: `recordAlert` folds their repeats into one row (one CORDIS alert stood
 * for 231 occurrences). Only the tenant-scoped ones grow the row count, because
 * a fresh tenant id per run defeats the dedupe key by construction.
 *
 * So the invariant this gate holds is narrow and true: an open alert may name
 * no tenant, or it may name a tenant that exists. It may not name a ghost.
 *
 * Deliberately a *runtime* check, not a source scan. Whether a fixture leaks an
 * alert depends on which production path the code under test happens to take,
 * which no grep can decide; 19 test files delete a tenant and only 2 of them
 * leak. Grepping would demand a ritual cleanup line from 17 files that need
 * none, and would still miss the 18th that does.
 *
 * It runs LAST in `pnpm gate`, after `test:e2e`, so it sees what the run it is
 * judging actually left behind.
 *
 * Exit codes: 0 = no orphans, or the database is unreachable (skipped loudly —
 * an absent database is an environment fact, not an alert leak). 1 = orphans.
 */
import 'dotenv/config';

import { prisma } from '../src/lib/db';

function metaOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Points at the fixture a ghost tenant id came from. Only `t-idem-*` is a
 * literal, self-chosen id and so can be named with certainty; everything else
 * got its id from `prisma.tenant.create`, which mints a cuid that carries no
 * provenance at all. So the fallback reports the alert's own `source` — the
 * production call site — and leaves the fixture to the reader rather than
 * inventing an attribution the data does not support.
 */
function blame(tenantId: string, source: string): string {
  if (tenantId.startsWith('t-idem-')) return 'tests/stripe-webhook-idempotency.live.test.ts';
  return `kaynak "${source}" (tenant id bir cuid — fixture adı veriden okunamaz)`;
}

async function main() {
  const open = await prisma.systemAlert.findMany({
    where: { resolvedAt: null },
    select: { id: true, source: true, meta: true, createdAt: true },
  });

  const named = open.filter((r) => typeof metaOf(r.meta).tenantId === 'string');
  const ids = [...new Set(named.map((r) => String(metaOf(r.meta).tenantId)))];

  // No tenant ids to check is a pass, not a skip: it means nothing leaked.
  const alive =
    ids.length === 0
      ? []
      : await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const aliveSet = new Set(alive.map((t) => t.id));
  const orphans = named.filter((r) => !aliveSet.has(String(metaOf(r.meta).tenantId)));

  console.log(`açık SystemAlert satırı            : ${open.length}`);
  console.log(`  meta.tenantId taşıyan             : ${named.length}`);
  console.log(`  tenant'ı YAŞAYAN                  : ${named.length - orphans.length}`);
  console.log(`  tenant'ı SİLİNMİŞ (öksüz)         : ${orphans.length}`);
  console.log(`  hiç tenant adı geçmeyen (normal)  : ${open.length - named.length}`);

  if (orphans.length === 0) {
    console.log('\n✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant’ı gösteriyor.');
    return;
  }

  const byFixture = new Map<string, number>();
  for (const r of orphans) {
    const f = blame(String(metaOf(r.meta).tenantId), r.source);
    byFixture.set(f, (byFixture.get(f) ?? 0) + 1);
  }

  console.error(
    `\n❌ ${orphans.length} açık alarm, artık var olmayan bir kiracıyı gösteriyor — bunlar hiçbir zaman doğrulanamaz ve alarm konsolunu (en yeni 300 satır) gerçek alarmların önünden iter.`
  );
  for (const [fixture, n] of [...byFixture].sort((a, b) => b[1] - a[1])) {
    console.error(`   • ${String(n).padStart(4)} satır  ←  ${fixture}`);
  }
  console.error(
    '\n   Onarım: kiracısını silen fixture, aynı temizlikte alarmını da silmeli.\n' +
      '   SystemAlert tenant-agnostiktir ve tenantId KOLONU YOKTUR; meta üzerinden eşle:\n' +
      "     await prisma.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: tenantId } } });\n" +
      '   Örnek: tests/e2e/invoice-write-path.spec.ts afterAll.'
  );
  process.exit(1);
}

main()
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    // An unreachable database is an environment fact, not an alert leak. Say so
    // out loud and pass — the same contract pnpm rls:verify keeps.
    if (/ECONNREFUSED|ENOTFOUND|Can't reach database|P1001|P1000|EAI_AGAIN/i.test(msg)) {
      console.log(`⏭️  Veritabanına ulaşılamadı, öksüz alarm ölçümü ATLANDI: ${msg.split('\n')[0]}`);
      return;
    }
    console.error(`❌ ${msg}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
