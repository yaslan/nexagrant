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
 * TASK-MTSYG783RIIEE — until 2026-09-08 this script asked postgres only for
 * *catalogue metadata*: is RLS enabled, does a policy row exist. It never asked
 * the one question that decides whether any of it applies — is the role doing
 * the asking actually subject to those policies? The local `fabrika` role is
 * SUPERUSER + BYPASSRLS, so the answer was no, and the gate printed
 * "✅ the database enforces isolation on all 43 tables" over a connection where
 * RLS was switched off entirely. That false green is how TASK-MTSWVADF7RQ1B's
 * F-1 survived 1370 tests: `embedText` writes its AiUsageLog row outside
 * `withTenant`, which the production (NOBYPASSRLS) role rejects every time,
 * while locally it sailed through. A gate that lies is worse than no gate: with
 * no gate a human looks.
 *
 * So the measurement now runs through a role that RLS actually applies to, and
 * it is behavioural, not declarative — real reads and a real (rolled back)
 * write, each with a positive control so a permission error cannot masquerade
 * as isolation. Where that role comes from, in order:
 *
 *   1. DATABASE_URL itself, when its role is neither SUPERUSER nor BYPASSRLS
 *      (what a correctly configured deployment looks like — prisma/rls.sql:2).
 *   2. DATABASE_URL_RLS_TEST — the `fabrika_app` role `pnpm db:rls-role`
 *      already creates for tests/rls.spec.ts. Reused rather than reinvented,
 *      and it costs the gate no side effects at all.
 *   3. A temporary NOBYPASSRLS role created and dropped by this run. Only
 *      reachable when DATABASE_URL is powerful enough to create roles — i.e.
 *      exactly the misconfigured-dev case this gate exists to expose.
 *   4. Nothing. Then the measurement cannot be made, and the script says so and
 *      exits 1. It never prints a green it did not measure.
 *
 * Exit codes: 0 = isolation measured through an RLS-subject role and enforced,
 * or the database is unreachable (skipped loudly — a missing database is an
 * absent measurement, not a passing one).
 * 1 = the database is reachable and isolation is missing, partial, or could not
 * be measured honestly.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { tenantScopedModels } from './rls-models';

/** Fixed name so a crashed run leaves one droppable object, never a pile. */
const PROBE_ROLE = 'rls_verify_probe';

/** Reserved tenant ids for the write probe. Every row written is rolled back. */
const PROBE_TENANT_A = 'rls-verify-probe-a';
const PROBE_TENANT_B = 'rls-verify-probe-b';

interface RoleCaps {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
}

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

/**
 * What the connected role may do. `rolsuper`/`rolbypassrls` is the whole
 * question: either one makes every policy below invisible to this connection,
 * so anything it observes about isolation is an artefact of the role.
 */
async function roleCaps(client: pg.Client): Promise<RoleCaps> {
  const { rows } = await client.query<RoleCaps>(
    `select rolname, rolsuper, rolbypassrls, rolcreaterole
       from pg_roles where rolname = current_user`
  );
  if (!rows[0]) throw new Error('current_user pg_roles içinde bulunamadı.');
  return rows[0];
}

const isExempt = (c: RoleCaps): boolean => c.rolsuper || c.rolbypassrls;

const describeCaps = (c: RoleCaps): string =>
  `${c.rolname} (rolsuper=${c.rolsuper}, rolbypassrls=${c.rolbypassrls})`;

/** Repo-controlled identifiers, but never interpolate one unchecked. */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Beklenmeyen tablo adı: ${name}`);
  return `"${name}"`;
}

interface Measurer {
  client: pg.Client;
  caps: RoleCaps;
  /** How the connection was obtained, printed with the verdict. */
  source: string;
  cleanup: () => Promise<void>;
}

async function tryConnection(url: string, source: string): Promise<Measurer | null> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch (e) {
    console.log(`   ${source}: bağlanılamadı (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
  const caps = await roleCaps(client);
  if (isExempt(caps)) {
    console.log(`   ${source}: rol ${describeCaps(caps)} — RLS'e tabi değil, ölçüm için kullanılamaz.`);
    await client.end();
    return null;
  }
  return { client, caps, source, cleanup: () => client.end() };
}

/**
 * Creates a throwaway login role that RLS applies to, measures with it, and
 * drops it again. SELECT and INSERT only: the probe reads, and writes one row
 * it always rolls back. No DDL, no DELETE, no ownership.
 */
async function createProbeRole(admin: pg.Client, adminUrl: string): Promise<Measurer | null> {
  const password = randomBytes(24).toString('base64url');
  const drop = async () => {
    await admin.query(`DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
          EXECUTE 'DROP OWNED BY ${PROBE_ROLE}';
          EXECUTE 'DROP ROLE ${PROBE_ROLE}';
        END IF;
      END $$;`);
  };

  try {
    await drop(); // a previous crashed run must not block this one
    // The password travels as a session GUC and reaches DDL through format(%L),
    // so it is never string-interpolated here. Same pattern as
    // prisma/rls-app-role.sql, deliberately.
    await admin.query('SELECT set_config($1, $2, false)', ['fabrika.probe_password', password]);
    await admin.query(`DO $$
      DECLARE pw text := current_setting('fabrika.probe_password', true);
      BEGIN
        EXECUTE format(
          'CREATE ROLE ${PROBE_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', pw);
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${PROBE_ROLE}', current_database());
        EXECUTE 'GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}';
        EXECUTE 'GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}';
      END $$;`);
  } catch (e) {
    console.log(`   geçici ölçüm rolü kurulamadı: ${e instanceof Error ? e.message : String(e)}`);
    await drop().catch(() => {});
    return null;
  }

  const url = new URL(adminUrl);
  url.username = PROBE_ROLE;
  url.password = password;

  const measurer = await tryConnection(url.toString(), `geçici rol ${PROBE_ROLE}`);
  if (!measurer) {
    await drop().catch(() => {});
    return null;
  }
  return {
    ...measurer,
    cleanup: async () => {
      await measurer.cleanup();
      await drop().catch(() => {});
    },
  };
}

/** The connection the isolation claim will actually rest on, or null. */
async function acquireMeasurer(
  admin: pg.Client,
  adminCaps: RoleCaps,
  adminUrl: string,
  dotenv: Record<string, string>
): Promise<Measurer | null> {
  if (!isExempt(adminCaps)) {
    return { client: admin, caps: adminCaps, source: 'DATABASE_URL', cleanup: async () => {} };
  }

  console.log(
    `\n⚠  DATABASE_URL rolü ${describeCaps(adminCaps)} — RLS bu bağlantıda hiç uygulanmıyor.`
  );
  console.log("   Bu rolle yapılan bir izolasyon ölçümü GEÇERSİZDİR; RLS'e tabi bir rol aranıyor:");

  const testUrl = process.env.DATABASE_URL_RLS_TEST ?? dotenv.DATABASE_URL_RLS_TEST;
  if (testUrl) {
    const m = await tryConnection(testUrl, 'DATABASE_URL_RLS_TEST');
    if (m) return m;
  } else {
    console.log('   DATABASE_URL_RLS_TEST: tanımlı değil.');
  }

  if (adminCaps.rolsuper || adminCaps.rolcreaterole) {
    const m = await createProbeRole(admin, adminUrl);
    if (m) return m;
  } else {
    console.log('   geçici rol: DATABASE_URL rolü CREATEROLE taşımıyor.');
  }

  return null;
}

interface Populated {
  table: string;
  tenantId: string;
  rows: number;
  /** Rows whose tenantId is NULL — they belong to no tenant (AuditEvent). */
  nullRows: number;
}

/** Tenant-scoped tables that actually hold rows, with one real tenant id each. */
async function populatedTables(
  admin: pg.Client,
  models: string[],
  existing: Set<string>
): Promise<Populated[]> {
  const out: Populated[] = [];
  for (const t of models) {
    if (!existing.has(t)) continue;
    // The tenant is the busiest NON-null one: on AuditEvent the NULL group is
    // the largest (plan admin events), and picking it skipped the whole table.
    const { rows } = await admin.query<{ tid: string | null; total: string; nulls: string }>(
      `select (select "tenantId" from ${quoteIdent(t)} where "tenantId" is not null
                group by 1 order by count(*) desc limit 1) as tid,
              count(*)::int as total,
              count(*) filter (where "tenantId" is null)::int as nulls
         from ${quoteIdent(t)}`
    );
    const first = rows[0];
    if (first && first.tid) {
      out.push({ table: t, tenantId: first.tid, rows: Number(first.total), nullRows: Number(first.nulls) });
    }
  }
  return out;
}

const isRlsViolation = (e: unknown): boolean =>
  e instanceof Error && /row-level security/i.test(e.message);

/**
 * The behavioural measurement. Every check is paired with a positive control,
 * because "saw nothing / could not write" is also what a missing GRANT, a wrong
 * database or an empty table look like.
 */
async function probeIsolation(
  m: pg.Client,
  populated: Populated[],
  aiUsageLogExists: boolean
): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];

  const { rows: ctxRows } = await m.query<{ tenant: string | null }>(
    `select current_setting('app.tenant_id', true) as tenant`
  );
  if (ctxRows[0]?.tenant) {
    throw new Error(
      `Ölçüm bağlantısında app.tenant_id zaten '${ctxRows[0].tenant}' — temiz oturum bekleniyordu.`
    );
  }

  // 1. Negative read: no tenant context, so a policy-bound role must see nothing
  //    in a table that demonstrably holds rows.
  for (const p of populated) {
    const { rows } = await m.query<{ n: string }>(
      `select count(*)::int as n from ${quoteIdent(p.table)}`
    );
    const seen = Number(rows[0]?.n ?? -1);
    if (seen !== 0) {
      failures.push(
        `${p.table}: kiracı bağlamı YOKKEN ${seen} satır okunuyor (tabloda ${p.rows} satır var) — izolasyon uygulanmıyor.`
      );
    }
  }
  if (populated.length > 0) {
    checks.push(
      `okuma (negatif): app.tenant_id yokken ${populated.length} dolu tablonun hepsi 0 satır döndü`
    );
  }

  // 2. Positive read: with the right tenant set, the same table must be visible.
  //    Without this, a connection pointed at an empty database would "pass".
  const sample = populated[0];
  if (sample) {
    await m.query('BEGIN');
    try {
      await m.query(`select set_config('app.tenant_id', $1, true)`, [sample.tenantId]);
      const { rows } = await m.query<{ n: string }>(
        `select count(*)::int as n from ${quoteIdent(sample.table)}`
      );
      const seen = Number(rows[0]?.n ?? 0);
      if (seen === 0) {
        failures.push(
          `${sample.table}: DOĞRU kiracı bağlamında da 0 satır okunuyor — ölçüm geçersiz (yetki/veri sorunu), izolasyon kanıtlanmadı.`
        );
      } else {
        checks.push(`okuma (pozitif): ${sample.table} kendi kiracısı bağlamında ${seen} satır döndü`);
      }
    } finally {
      await m.query('ROLLBACK');
    }
  }

  // 2b. Rows with a NULL tenantId belong to NO tenant (TASK-MULUJ8O4JH1PF).
  //     A tenant session must not see them; system scope must (positive
  //     control — otherwise "0 visible" could just be a missing GRANT). Under
  //     the old AuditEvent `tenant_or_shared` policy tenant A read all 331.
  for (const p of populated.filter((x) => x.nullRows > 0)) {
    await m.query('BEGIN');
    try {
      await m.query(`select set_config('app.tenant_id', $1, true)`, [p.tenantId]);
      const { rows } = await m.query<{ n: string }>(
        `select count(*)::int as n from ${quoteIdent(p.table)} where "tenantId" is null`
      );
      const seen = Number(rows[0]?.n ?? -1);
      if (seen !== 0) {
        failures.push(
          `${p.table}: kiracı bağlamında tenantId NULL olan ${seen} satır okunuyor (tabloda ${p.nullRows}) — kiracısız satırlar her kiracıya açık.`
        );
      } else {
        checks.push(`okuma (NULL): ${p.table} kiracı bağlamında ${p.nullRows} kiracısız satırın hiçbirini görmedi`);
      }
    } finally {
      await m.query('ROLLBACK');
    }

    await m.query('BEGIN');
    try {
      await m.query(`select enter_system_scope('platform-admin')`);
      const { rows } = await m.query<{ n: string }>(
        `select count(*)::int as n from ${quoteIdent(p.table)} where "tenantId" is null`
      );
      const seen = Number(rows[0]?.n ?? 0);
      if (seen !== p.nullRows) {
        failures.push(
          `${p.table}: system scope'ta ${seen}/${p.nullRows} kiracısız satır okunuyor — platform görünümü eksik, ölçüm geçersiz.`
        );
      } else {
        checks.push(`okuma (NULL, pozitif): ${p.table} system scope'ta ${seen} kiracısız satırın hepsini gördü`);
      }
    } catch (e) {
      // The throwaway probe role (acquireMeasurer, option 3) holds no EXECUTE on
      // enter_system_scope; fabrika_app does. That is a missing control, said
      // out loud, not a leak — the negative read above already ran.
      if (e instanceof Error && /permission denied/i.test(e.message)) {
        checks.push(`okuma (NULL, pozitif): ${p.table} ATLANDI — ölçüm rolünün enter_system_scope yetkisi yok`);
        continue;
      }
      failures.push(
        `${p.table}: enter_system_scope başarısız — NULL satırların pozitif kontrolü yapılamadı: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    } finally {
      await m.query('ROLLBACK');
    }
  }

  // 3. WITH CHECK, the direction that lets a row land in the wrong tenant.
  //    Every insert below is rolled back; nothing is ever committed.
  if (aiUsageLogExists) {
    const insert = (tenantId: string) =>
      m.query(
        `insert into "AiUsageLog"
           (id, "tenantId", module, purpose, provider, model, "promptHash",
            "inputTokens", "outputTokens", credits)
         values ($1, $2, 'RLSVERIFY', 'isolation_probe', 'probe', 'probe', 'probe', 0, 0, 0)`,
        [`rlsverify_${randomBytes(8).toString('hex')}`, tenantId]
      );

    // 3a. No tenant context at all — the shape of TASK-MTSWVADF7RQ1B F-1.
    await m.query('BEGIN');
    try {
      await insert(PROBE_TENANT_A);
      failures.push(
        'AiUsageLog: kiracı bağlamı YOKKEN yazma KABUL EDİLDİ — WITH CHECK uygulanmıyor.'
      );
    } catch (e) {
      if (isRlsViolation(e)) {
        checks.push('yazma (negatif): app.tenant_id yokken INSERT reddedildi');
      } else {
        failures.push(
          `AiUsageLog: bağlamsız INSERT, RLS dışı bir sebeple başarısız — ölçüm geçersiz: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    } finally {
      await m.query('ROLLBACK');
    }

    // 3b. Right tenant must succeed (control), wrong tenant must be refused.
    await m.query('BEGIN');
    try {
      await m.query(`select set_config('app.tenant_id', $1, true)`, [PROBE_TENANT_A]);

      await m.query('SAVEPOINT probe_own');
      try {
        await insert(PROBE_TENANT_A);
        checks.push('yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)');
      } catch (e) {
        failures.push(
          `AiUsageLog: KENDİ kiracısına INSERT de reddedildi — ölçüm geçersiz (yetki sorunu), izolasyon kanıtlanmadı: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      } finally {
        await m.query('ROLLBACK TO SAVEPOINT probe_own');
      }

      await m.query('SAVEPOINT probe_cross');
      try {
        await insert(PROBE_TENANT_B);
        failures.push(
          `AiUsageLog: '${PROBE_TENANT_A}' bağlamındayken '${PROBE_TENANT_B}' kiracısına satır YAZILABİLDİ — çapraz kiracı yazma açık.`
        );
      } catch (e) {
        if (isRlsViolation(e)) {
          checks.push('yazma (çapraz): başka kiracıya INSERT reddedildi');
        } else {
          failures.push(
            `AiUsageLog: çapraz INSERT, RLS dışı bir sebeple başarısız — ölçüm geçersiz: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
        }
      } finally {
        await m.query('ROLLBACK TO SAVEPOINT probe_cross');
      }
    } finally {
      await m.query('ROLLBACK');
    }
  }

  return { failures, checks };
}

async function main() {
  const dotenv = readDotenv();
  const url = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
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

  let measurer: Measurer | null = null;
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

    // Politikalar yerinde. Asıl soru: bu politikalar birine uygulanıyor mu?
    const adminCaps = await roleCaps(client);
    measurer = await acquireMeasurer(client, adminCaps, url, dotenv);

    if (!measurer) {
      console.error('\n❌ KİRACI İZOLASYONU ÖLÇÜLEMEDİ — yeşil YAZILMIYOR.');
      console.error(
        `   Politikalar (${models.length} tablo) yerinde, ama RLS'e tabi bir rol bulunamadı:`
      );
      console.error(`   DATABASE_URL rolü ${describeCaps(adminCaps)} politikaları baypas ediyor.`);
      console.error('\n   Onarım: pnpm db:rls-role   (DATABASE_URL_RLS_TEST üretir)');
      process.exit(1);
    }

    const populated = await populatedTables(client, models, existing);
    const { failures, checks } = await probeIsolation(
      measurer.client,
      populated,
      existing.has('AiUsageLog')
    );

    console.log(`\nÖlçüm rolü: ${describeCaps(measurer.caps)} — kaynak: ${measurer.source}`);
    for (const c of checks) console.log(`   ✓ ${c}`);
    if (populated.length === 0) {
      console.log('   ℹ dolu kiracıya özel tablo yok — okuma sondası koşulmadı.');
    }

    if (checks.length === 0) {
      console.error('\n❌ KİRACI İZOLASYONU ÖLÇÜLEMEDİ — tek bir davranış sondası bile koşamadı.');
      process.exit(1);
    }

    if (failures.length > 0) {
      console.error('\n❌ KİRACI İZOLASYONU UYGULANMIYOR — bu bir ortam gürültüsü değil, güvenlik durumu.');
      for (const f of failures) console.error(`   • ${f}`);
      console.error('\n   Onarım: pnpm db:rls   (gerekirse önce pnpm db:rls-role)');
      process.exit(1);
    }

    console.log(
      `\n✅ ${models.length} kiracıya özel tabloda politika yerinde ve izolasyon ${measurer.caps.rolname} rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.`
    );
  } finally {
    await measurer?.cleanup().catch(() => {});
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
