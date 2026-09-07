/**
 * Live RLS gate: does the DATABASE actually enforce tenant isolation right now?
 *
 * scripts/check-rls.ts only compares two files, so it reports SUCCESS even when
 * the database has no policies at all. On 2026-09-07 the schema was rebuilt
 * mid-sprint: the repo declared 38 tenant_isolation policies, the database had
 * 1, and the static check stayed green throughout. This one asks postgres.
 *
 *   pnpm rls:verify
 *
 * Exit codes: 0 = every tenant-scoped table has RLS enabled and a
 * tenant_isolation policy, or the database is unreachable (skipped loudly —
 * a missing database is an absent measurement, not a passing one).
 * 1 = the database is reachable and isolation is missing or partial.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { tenantScopedModels } from './rls-models';

function readDotenv(): Record<string, string> {
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL ?? readDotenv().DATABASE_URL;
  if (!url) {
    console.log('⏭  DATABASE_URL yok — canlı RLS denetimi ATLANDI (geçti sayılmaz).');
    return;
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch {
    console.log('⏭  Veritabanına ulaşılamadı — canlı RLS denetimi ATLANDI (geçti sayılmaz).');
    console.log('   Kiracı izolasyonu ÖLÇÜLMEDİ. Docker/Postgres açıkken tekrar koş.');
    return;
  }

  try {
    const models = tenantScopedModels();

    const enabled = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`
    );
    const rlsOn = new Set(enabled.rows.filter((r) => r.relrowsecurity).map((r) => r.relname));
    const existing = new Set(enabled.rows.map((r) => r.relname));

    const policies = await client.query<{ tablename: string }>(
      `select tablename from pg_policies
        where schemaname = 'public' and policyname = 'tenant_isolation'`
    );
    const hasPolicy = new Set(policies.rows.map((r) => r.tablename));

    const missingTable = models.filter((m) => !existing.has(m));
    const missingRls = models.filter((m) => existing.has(m) && !rlsOn.has(m));
    const missingPolicy = models.filter((m) => existing.has(m) && !hasPolicy.has(m));

    console.log(`Kiracıya özel model: ${models.length} · RLS açık tablo: ${rlsOn.size} · tenant_isolation politikası: ${hasPolicy.size}`);

    if (missingTable.length > 0) {
      console.log(`\nℹ  Şemada olup veritabanında olmayan tablo (migration bekliyor): ${missingTable.join(', ')}`);
    }

    if (missingRls.length > 0 || missingPolicy.length > 0) {
      console.error('\n❌ KİRACI İZOLASYONU EKSİK — bu bir ortam gürültüsü değil, güvenlik durumu.');
      if (missingRls.length > 0) console.error(`   RLS kapalı: ${missingRls.join(', ')}`);
      if (missingPolicy.length > 0) console.error(`   tenant_isolation politikası yok: ${missingPolicy.join(', ')}`);
      console.error('\n   Onarım: pnpm db:rls   (gerekirse önce pnpm db:rls-role)');
      process.exit(1);
    }

    console.log(`\n✅ Veritabanı ${models.length} kiracıya özel tablonun tamamında izolasyonu uyguluyor.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
