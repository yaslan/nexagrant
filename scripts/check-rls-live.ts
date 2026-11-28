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
 *
 *   pnpm rls:verify --require-db
 *
 * turns the skip into exit 1: a go-live gate where an unreachable database (a
 * TLS failure, TASK-MUOG51GJ3PUOG R-S7) must not read as exit 0.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { INTAKE_APPEND_ONLY, INTAKE_APPEND_ONLY_POLICIES, tenantScopedModels } from './rls-models';

/** Fixed name so a crashed run leaves one droppable object, never a pile. */
const PROBE_ROLE = 'rls_verify_probe';

/** Reserved tenant ids for the write probe. Every row written is rolled back. */
const PROBE_TENANT_A = 'rls-verify-probe-a';
const PROBE_TENANT_B = 'rls-verify-probe-b';

/** `--require-db`: an unreachable or unset database fails instead of skipping. */
const REQUIRE_DB = process.argv.includes('--require-db');

function skipped(reason: string): void {
  if (REQUIRE_DB) {
    console.error(`❌ ${reason} — canlı RLS denetimi koşamadı ve --require-db verildi.`);
    process.exit(1);
  }
  console.log(`⏭  ${reason} — canlı RLS denetimi ATLANDI (geçti sayılmaz).`);
}

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
        -- The system_scope policy calls these as the querying role; PUBLIC has
        -- no EXECUTE on them (revoke-api-role-function-execute.sql).
        IF to_regprocedure('public.system_scope_open(regclass)') IS NOT NULL THEN
          EXECUTE 'GRANT EXECUTE ON FUNCTION public.system_scope_open(regclass), public.system_scope_sealed() TO ${PROBE_ROLE}';
        END IF;
        -- The system-scope probes enter a purpose the way fabrika_app does.
        IF to_regprocedure('public.enter_system_scope(text)') IS NOT NULL THEN
          EXECUTE 'GRANT EXECUTE ON FUNCTION public.enter_system_scope(text) TO ${PROBE_ROLE}';
        END IF;
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

/**
 * The connection the expected row counts are taken from. It must see every row:
 * the measured role reads 0 outside `system_scope`, so counting through it
 * expects 0 and then reports the scope's real row as a policy failure
 * (TASK-MVUPDK0P6ZT0N). DATABASE_URL serves when its role is exempt; otherwise
 * OWNER_DATABASE_URL (the BYPASSRLS owner, fabrika_owner). Null when neither is.
 */
async function acquireTruth(
  admin: pg.Client,
  adminCaps: RoleCaps,
  dotenv: Record<string, string>
): Promise<Measurer | null> {
  if (isExempt(adminCaps)) {
    return { client: admin, caps: adminCaps, source: 'DATABASE_URL', cleanup: async () => {} };
  }
  const ownerUrl = process.env.OWNER_DATABASE_URL ?? dotenv.OWNER_DATABASE_URL;
  if (!ownerUrl) return null;
  const client = new pg.Client({ connectionString: ownerUrl, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch (e) {
    console.log(`   OWNER_DATABASE_URL: bağlanılamadı (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
  const caps = await roleCaps(client);
  if (!isExempt(caps)) {
    console.log(`   OWNER_DATABASE_URL: rol ${describeCaps(caps)} — satır beklentisi için BYPASSRLS gerekir.`);
    await client.end();
    return null;
  }
  return { client, caps, source: 'OWNER_DATABASE_URL', cleanup: () => client.end() };
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

  // 2c. A FORGED scope (TASK-MUOGMQK3JAH4Y, İNCELEME-115 Ö-1). `app.system_scope`
  //     is a placeholder GUC, so it is USERSET: no grant can stop a role from
  //     setting it. Until the seal, fabrika_app read every tenant's rows with a
  //     plain SET — and every check above stayed green, because none of them
  //     tried. Three shapes, each inside a rolled-back transaction (a session
  //     `SET` there is undone by the ROLLBACK, and is what PGOPTIONS or a
  //     connection string `options=` produce): transaction-local set_config,
  //     session SET, and the seal of an earlier legitimate enter_system_scope
  //     replayed in a later transaction.
  if (populated.length > 0) {
    let replay: string | null = null;
    await m.query('BEGIN');
    try {
      await m.query(`select enter_system_scope('platform-admin')`);
      const { rows } = await m.query<{ t: string | null }>(
        `select current_setting('app.system_scope_token', true) as t`
      );
      replay = rows[0]?.t ?? null;
      // Positive control: the sealed door still opens. Without it, "0 rows
      // under a forged scope" is also what a broken system_scope looks like.
      const probe = populated[0]!;
      const { rows: open } = await m.query<{ n: string }>(
        `select count(*)::int as n from ${quoteIdent(probe.table)}`
      );
      const seen = Number(open[0]?.n ?? 0);
      if (seen === 0) {
        failures.push(
          `${probe.table}: enter_system_scope ile de 0 satır okunuyor (tabloda ${probe.rows}) — meşru kapı açılmıyor, sahte kapsam ölçümü geçersiz.`
        );
      } else {
        checks.push(`kapsam (pozitif): enter_system_scope ile ${probe.table} tablosunda ${seen} satır göründü (tabloda ${probe.rows})`);
      }
    } catch (e) {
      // Same standing as 2b: the throwaway probe role holds no EXECUTE.
      if (!(e instanceof Error && /permission denied/i.test(e.message))) {
        failures.push(
          `enter_system_scope başarısız — mühür yeniden oynatma sondası kurulamadı: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    } finally {
      await m.query('ROLLBACK');
    }

    const shapes: Array<{ name: string; setup: Array<[string, unknown[]]> }> = [
      { name: `set_config('app.system_scope','on',true)`, setup: [[`select set_config('app.system_scope', 'on', true)`, []]] },
      { name: `SET app.system_scope = 'on' (oturum; PGOPTIONS/options= ile aynı)`, setup: [[`set app.system_scope = 'on'`, []]] },
    ];
    if (replay) {
      shapes.push({
        name: 'önceki işlemin mührü yeniden oynatıldı',
        setup: [
          [`select set_config('app.system_scope', 'on', true)`, []],
          [`select set_config('app.system_scope_token', $1, true)`, [replay]],
        ],
      });
    } else {
      checks.push('sahte kapsam (yeniden oynatma): ATLANDI — ölçüm rolünün enter_system_scope yetkisi yok');
    }

    for (const shape of shapes) {
      await m.query('BEGIN');
      try {
        for (const [sql, params] of shape.setup) await m.query(sql, params);
        const leaked: string[] = [];
        for (const p of populated) {
          const { rows } = await m.query<{ n: string }>(`select count(*)::int as n from ${quoteIdent(p.table)}`);
          const seen = Number(rows[0]?.n ?? -1);
          if (seen !== 0) leaked.push(`${p.table} ${seen}/${p.rows}`);
        }
        if (leaked.length > 0) {
          failures.push(
            `sahte kapsam (${shape.name}): enter_system_scope olmadan kiracı yalıtımı AÇILDI — ${leaked.join(', ')}`
          );
        } else {
          checks.push(`sahte kapsam (${shape.name}): ${populated.length} dolu tablonun hepsi 0 satır döndü`);
        }
      } finally {
        await m.query('ROLLBACK');
      }
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

/**
 * FO-45 (TASK-MVC6CTSCLO6LI): ExpertPreRegistration is personal data with no tenant,
 * so the tenant probe above does not reach it. Its contract is the one policy
 * `system_scope`: outside that scope the measured role reads 0 rows and cannot
 * insert; inside `public-intake` every row is visible. Rolled back, nothing is kept.
 */
const EXPERT_TABLE = 'ExpertPreRegistration';

/** NG-175: the smallest row the readiness contact form writes (src/lib/leads/public-lead.ts). */
const PUBLIC_LEAD_INSERT = `insert into ${quoteIdent('PublicLead')} (id, name, email, organisation, "consentVersion", "consentAt", source, locale)
       values ($1, 'probe', $1 || '@rls-verify.invalid', 'probe', 'probe', now(), 'fon-hazirlik', 'tr')`;
/** NG-9: the smallest row the cookie banner writes (src/lib/cookie-consent-record.ts). */
const COOKIE_CONSENT_INSERT = `insert into ${quoteIdent('CookieConsentRecord')} (id, "visitorId", choice, analytics, marketing, "policyVersion", locale)
       values ($1, 'rls-verify-probe', 'reject_all', false, false, 'probe', 'tr')`;

/**
 * FO-45 (TASK-MVC6CTSCLO6LI): ExpertPreRegistration is personal data with no tenant,
 * so the tenant probe above does not reach it. Its contract is the one policy
 * `system_scope`: outside that scope the measured role reads 0 rows and cannot
 * insert; inside `public-intake` every row is visible. Rolled back, nothing is kept.
 * FO-50 (K-568932 = A): ExpertFounderCounter, its founder-number counter, has the
 * same contract and is measured the same way.
 *
 * NG-183: this is also THE list of system_scope tables (tables with no tenant whose
 * one policy is system_scope). main() asks pg_policies that each of them carries
 * exactly {system_scope}, and fails a catalogue table of that kind missing here.
 */
const SYSTEM_SCOPE_TABLES: ReadonlyArray<{
  table: string;
  migration: string;
  /** Null when the row cannot be built (ProvinceLeadRoute with no Tenant to point at). */
  insert: (id: string, tenantId: string | null) => [string, unknown[]] | null;
  /** The purpose that must show every row (default 'public-intake'). */
  purpose?: string;
  /** The row the read probe adds, when it differs from `insert` (the counter's upsert). */
  probeRow?: (id: string, tenantId: string | null) => [string, unknown[]] | null;
  /** The measured role must hold no DELETE/TRUNCATE (crw-fb Ö-1: the counter only goes up). */
  noDelete?: boolean;
}> = [
  {
    table: 'ExpertPreRegistration',
    migration: 'expert-prereg-rls-mail-quota.sql',
    insert: (id) => [
      `insert into ${quoteIdent('ExpertPreRegistration')} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale)
       values ($1, 'probe', $2, '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr')`,
      [id, `${id}@rls-verify.invalid`],
    ],
  },
  {
    // NG-175 (SEC NG-170 O-1): the readiness visitor's contact request.
    table: 'PublicLead',
    migration: 'public-lead-rls.sql',
    insert: (id) => [PUBLIC_LEAD_INSERT, [id]],
  },
  {
    table: 'ExpertFounderCounter',
    migration: 'add-expert-founder-counter.sql',
    insert: () => [`insert into ${quoteIdent('ExpertFounderCounter')} (id, "lastNumber", "updatedAt") values (1, 0, now())`, []],
    // One row at most (CHECK id = 1): on a seeded counter the upsert touches updatedAt only.
    probeRow: () => [
      `insert into "ExpertFounderCounter" (id, "lastNumber", "updatedAt") values (1, 0, now())
       on conflict (id) do update set "updatedAt" = excluded."updatedAt"`,
      [],
    ],
    noDelete: true,
  },
  {
    // FO-26: the per-IP counter of the expert form (pseudonymous personal data).
    table: 'ExpertPreRegAttempt',
    migration: 'add-expert-pre-reg-attempt.sql',
    insert: (id) => [`insert into "ExpertPreRegAttempt" (id, "ipHash") values ($1, 'rls-verify-probe')`, [id]],
  },
  {
    // NG-9: the cookie banner's consent record (anonymous visitor id); its own purpose
    // since NG-367 Ö-3.
    table: 'CookieConsentRecord',
    migration: 'add-cookie-consent-record.sql',
    purpose: 'cookie-consent',
    insert: (id) => [COOKIE_CONSENT_INSERT, [id]],
  },
  {
    // NG-167: province -> consultancy map; closed to public-intake (NG-175 D-1).
    // active = false keeps the probe clear of the one-active-route-per-province index.
    table: 'ProvinceLeadRoute',
    migration: 'add-province-lead-route.sql',
    purpose: 'platform-admin',
    insert: (id, tenantId) =>
      tenantId
        ? [`insert into "ProvinceLeadRoute" (id, province, "targetTenantId", active, "updatedAt") values ($1, 'Bolu', $2, false, now())`, [id, tenantId]]
        : null,
  },
];

/**
 * Named exceptions to "exactly {system_scope}" on a system_scope table: none since NG-188.
 * NG-52 had one (expert_directory, SELECT only, on ExpertPreRegistration); SEC NG-185 F-1
 * measured that it filtered rows, not columns, and NG-188 replaced it with the view
 * "ExpertDirectoryEntry" (probeExpertDirectory). The mechanism stays, so a future exception
 * is one line here plus one in prisma/rls.sql's NG-183 block. The same name on another table,
 * or with another command, is still drift; and so is any policy other than the one
 * prisma/rls.sql writes (`expectedPolicy`):
 *   - SEC NG-185 M3b: the live `qual` must equal, character for character, what Postgres
 *     deparses from rls.sql's own USING expression. A substring check let
 *     `… AND ('verified' <> '' OR true) …` through, which keeps every expected fragment and
 *     opens every row.
 *   - NG-191 (SEC NG-185 low finding): "as written" is also the role list (`TO …`) and the
 *     permissive flag (`AS PERMISSIVE|RESTRICTIVE`). The temporary copy is created from
 *     rls.sql's whole statement, so both sides are read from pg_policies in the same form.
 *     A statement with no TO clause is recorded as {public}, so a `TO public` copy of it is
 *     the same policy.
 * The expected policy is compiled by the same server, so the comparison does not depend on
 * how a Postgres version prints an expression.
 */
const SYSTEM_SCOPE_ALLOWED_EXTRA: ReadonlyArray<{ table: string; policy: string; cmd: string }> = [
  // NG-243: the intake tables' RESTRICTIVE intake_no_update / intake_no_delete (rls-models.ts
  // INTAKE_APPEND_ONLY). Restrictive, so they only shut rows; still compared with rls.sql field by
  // field (a PERMISSIVE copy, another command or another expression is drift).
  ...[...INTAKE_APPEND_ONLY].sort().flatMap((table) => INTAKE_APPEND_ONLY_POLICIES.map(({ policy, cmd }) => ({ table, policy, cmd }))),
];

/**
 * Everything after `CREATE POLICY <policy> ON public."<table>"` in prisma/rls.sql up to its `;`,
 * verbatim (AS / FOR / TO / USING / WITH CHECK clauses). null when the statement or its USING
 * clause is missing.
 */
function rlsSqlPolicyClauses(sql: string, table: string, policy: string): string | null {
  const head = `CREATE POLICY ${policy} ON public."${table}"`;
  const start = sql.indexOf(head);
  if (start < 0) return null;
  const end = sql.indexOf(';', start);
  if (end < 0) return null;
  const stmt = sql.slice(start + head.length, end).trim();
  if (!/\bUSING\b/i.test(stmt)) return null;
  return stmt;
}

/** The fields of a policy the expert_directory exception is compared on (as pg_policies prints them). */
type PolicyShape = { cmd: string; qual: string; roles: string[]; permissive: string; with_check: string | null };

/** Field-by-field difference of a live policy from the one rls.sql compiles to; [] when equal. */
function policyShapeDrift(
  live: { cmd: string; qual: string | null; roles: string[] | null; permissive: string; with_check: string | null },
  expected: PolicyShape
): string[] {
  const set = (r: readonly string[] | null) => `{${[...(r ?? [])].sort().join(', ')}}`;
  const out: string[] = [];
  if (live.cmd !== expected.cmd) out.push(`komut ${live.cmd}, beklenen ${expected.cmd}`);
  if (live.permissive !== expected.permissive) out.push(`permissive ${live.permissive}, beklenen ${expected.permissive}`);
  if (set(live.roles) !== set(expected.roles)) out.push(`roller ${set(live.roles)}, beklenen ${set(expected.roles)}`);
  if (live.qual === null || live.qual !== expected.qual) out.push('qual rls.sql\'deki ifadeden farklı');
  // NG-243: an UPDATE policy's WITH CHECK is part of "as written" too.
  if ((live.with_check ?? null) !== (expected.with_check ?? null)) out.push('with_check rls.sql\'deki ifadeden farklı');
  return out;
}

/**
 * The policy Postgres records for rls.sql's statement (cmd, qual, roles, permissive), compiled
 * on a temporary copy of the table (CREATE TEMP TABLE … LIKE) inside a transaction that is
 * rolled back: the real table is never locked or altered. Read back through pg_policies, the
 * same view the live side is read from. An error (with the reason) when it cannot be compiled,
 * or when rls.sql's command is not the one the exception allows — both fail closed.
 */
async function expectedPolicy(
  client: pg.Client,
  table: string,
  policy: string,
  cmd: string
): Promise<PolicyShape | { error: string }> {
  const clauses = rlsSqlPolicyClauses(readFileSync(resolve(process.cwd(), 'prisma/rls.sql'), 'utf8'), table, policy);
  if (!clauses) return { error: `prisma/rls.sql içinde ${table}.${policy} USING ifadesi bulunamadı` };
  const tmp = `rls_verify_expected_${table.toLowerCase()}`;
  await client.query('begin');
  try {
    await client.query(`create temp table ${tmp} (like public."${table}") on commit drop`);
    await client.query(`create policy ${policy} on pg_temp.${tmp} ${clauses}`);
    const r = await client.query<{ cmd: string; qual: string | null; roles: string[] | null; permissive: string; with_check: string | null }>(
      `select cmd, qual, roles::text[] as roles, permissive, with_check
         from pg_policies
        where schemaname = (select nspname from pg_namespace where oid = pg_my_temp_schema())
          and tablename = $1 and policyname = $2`,
      [tmp, policy]
    );
    const row = r.rows[0];
    if (!row?.qual || !row.roles) return { error: `${table}.${policy}: beklenen politika derlenemedi` };
    if (row.cmd !== cmd) return { error: `${table}.${policy}: prisma/rls.sql komutu ${row.cmd}, istisna yalnız ${cmd}` };
    return { cmd: row.cmd, qual: row.qual, roles: row.roles, permissive: row.permissive, with_check: row.with_check };
  } catch (e) {
    return { error: `${table}.${policy}: beklenen politika derlenemedi (${e instanceof Error ? e.message.split('\n')[0] : String(e)})` };
  } finally {
    await client.query('rollback');
  }
}

/** The purpose the read probe writes its row under: opens every SYSTEM_SCOPE_TABLES table (rls.sql system_scope_open). */
const PROBE_ROW_PURPOSE = 'platform-admin';

/**
 * NG-183 (NG-175 review Düşük-2): on an empty table "0 rows outside the scope" measured
 * nothing — a foreign `FOR SELECT USING (true)` policy on an empty PublicLead passed
 * rls:verify. So before a read is counted, the measured role writes one probe row per
 * table INSIDE the caller's transaction (under PROBE_ROW_PURPOSE), then closes the scope
 * again. Its own uncommitted row is visible to it alone, and the caller ROLLS BACK: no
 * other session ever sees it (the PublicLead forwarder cannot pick it up) and a crashed
 * run leaves nothing, so live keeps no probe row by construction. `added` = rows the
 * probe added (0 for a seeded counter, whose upsert only touches updatedAt).
 */
async function addProbeRows(
  m: pg.Client,
  tables: readonly string[],
  tenantId: string | null
): Promise<{ added: Map<string, number>; failures: string[]; checks: string[] }> {
  const added = new Map<string, number>();
  const failures: string[] = [];
  const checks: string[] = [];
  const count = async (t: string): Promise<number> =>
    Number((await m.query<{ n: number }>(`select count(*)::int as n from ${quoteIdent(t)}`)).rows[0]?.n ?? -1);
  await m.query('select enter_system_scope($1)', [PROBE_ROW_PURPOSE]);
  for (const t of tables) {
    const spec = SYSTEM_SCOPE_TABLES.find((s) => s.table === t);
    const row = spec ? (spec.probeRow ?? spec.insert)(`rls-verify-${randomBytes(6).toString('hex')}`, tenantId) : null;
    if (!spec) {
      failures.push(`${t}: okuma probu satırı tanımsız (SYSTEM_SCOPE_TABLES) — boş tabloda okuma ölçülemez`);
      continue;
    }
    if (!row) {
      checks.push(`${t}: okuma probu satırı ATLANDI — veritabanında Tenant yok, satır kurulamıyor`);
      continue;
    }
    const before = await count(t);
    await m.query('savepoint probe_row');
    try {
      await m.query(...row);
      await m.query('release savepoint probe_row');
    } catch (e) {
      await m.query('rollback to savepoint probe_row');
      failures.push(
        `${t}: okuma probu satırı ${PROBE_ROW_PURPOSE} kapsamında yazılamadı — ${isRlsViolation(e) ? 'RLS' : e instanceof Error ? e.message.split('\n')[0] : String(e)}`
      );
      continue;
    }
    const after = await count(t);
    if (after < 1) failures.push(`${t}: okuma probu satırı yazıldı ama ${PROBE_ROW_PURPOSE} kapsamında görünmüyor`);
    added.set(t, after - before);
  }
  // Close the scope for the rest of the transaction: system_scope_open() needs app.system_scope = 'on'.
  await m.query(
    `select set_config('app.system_scope', 'off', true), set_config('app.system_scope_purpose', '', true), set_config('app.system_scope_token', '', true)`
  );
  return { added, failures, checks };
}

async function probeSystemScopeTable(
  m: pg.Client,
  spec: (typeof SYSTEM_SCOPE_TABLES)[number],
  rlsOn: boolean,
  expectedRows: number,
  tenantId: string | null
): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const table = spec.table;
  if (!rlsOn) {
    failures.push(`${table}: RLS kapalı — sistem kapsamı korumasız (prisma/migrations/${spec.migration}).`);
    return { failures, checks };
  }
  const count = async (): Promise<number> =>
    Number((await m.query<{ n: number }>(`select count(*)::int as n from ${quoteIdent(table)}`)).rows[0]?.n ?? -1);

  const outside = await count();
  if (outside !== 0) {
    failures.push(`${table}: sistem kapsamı DIŞINDA ${outside} satır okunuyor — izolasyon uygulanmıyor.`);
  } else {
    checks.push(`${table}: sistem kapsamı dışında okuma 0 satır (tabloda ${expectedRows})`);
  }

  const id = `rls-verify-${randomBytes(6).toString('hex')}`;
  const insert = spec.insert(id, tenantId);
  if (!insert) {
    checks.push(`${table}: sistem kapsamı dışında INSERT ölçülmedi — veritabanında Tenant yok`);
  } else {
    await m.query('begin');
    try {
      await m.query(...insert);
      failures.push(`${table}: sistem kapsamı DIŞINDA INSERT kabul edildi.`);
    } catch (e) {
      if (isRlsViolation(e)) checks.push(`${table}: sistem kapsamı dışında INSERT reddedildi`);
      else failures.push(`${table}: INSERT beklenmeyen hatayla düştü — ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    } finally {
      await m.query('rollback');
    }
  }

  if (spec.noDelete) {
    const priv = await m.query<{ d: boolean; t: boolean }>(
      `select has_table_privilege(current_user, $1, 'DELETE') as d, has_table_privilege(current_user, $1, 'TRUNCATE') as t`,
      [quoteIdent(table)]
    );
    const { d, t } = priv.rows[0] ?? { d: true, t: true };
    if (d || t) failures.push(`${table}: ölçüm rolünde DELETE/TRUNCATE yetkisi var — sayaç silinebilir (prisma/migrations/${spec.migration}).`);
    else checks.push(`${table}: ölçüm rolünde DELETE ve TRUNCATE yetkisi yok`);
  }

  // NG-183: the read measured against a real row (addProbeRows), rolled back with the rest.
  const purpose = spec.purpose ?? 'public-intake';
  await m.query('begin');
  try {
    const probe = await addProbeRows(m, [table], tenantId);
    failures.push(...probe.failures);
    checks.push(...probe.checks);
    const n = expectedRows + (probe.added.get(table) ?? 0);
    const leaked = await count();
    if (leaked !== 0) {
      failures.push(
        `${table}: sistem kapsamı DIŞINDA ${leaked}/${n} satır okunuyor (geri alınan prob satırıyla ölçüldü) — okuma sızıntısı; pg_policies'teki fazla politikaya bak.`
      );
    } else if (n > 0) {
      checks.push(`${table}: okuma probu — sistem kapsamı dışında 0/${n} satır (prob satırı dahil, geri alındı)`);
    }
    await m.query('select enter_system_scope($1)', [purpose]);
    const inside = await count();
    if (inside !== n) {
      failures.push(`${table}: sistem kapsamı (${purpose}) İÇİNDE ${inside}/${n} satır görüldü — politika yanlış.`);
    } else {
      checks.push(`${table}: sistem kapsamı (${purpose}) içinde ${inside}/${n} satır görüldü`);
    }
  } finally {
    await m.query('rollback');
  }
  return { failures, checks };
}

/**
 * FO-52 (K-569554 = C): the purpose 'public-intake' (the anonymous expert form)
 * opens only PUBLIC_INTAKE_TABLES; every other system_scope table must look
 * exactly as it does outside the scope, and a write there must be refused.
 * The other purposes must still open everything but the expert data they do
 * not handle (FO-92, NG-175: PURPOSE_NARROWED). One snapshot for both
 * connections (pg_export_snapshot), so concurrent writers cannot skew a count.
 * Everything is rolled back.
 */
const PUBLIC_INTAKE_TABLES = new Set([EXPERT_TABLE, 'ExpertFounderCounter', 'ExpertPreRegAttempt', 'PublicLead']);

/**
 * NG-367 Ö-3 (SEC NG-363): the cookie banner's purpose. It opens this one table; the table is
 * shut to 'public-intake' (the expert and readiness forms), which opened it until NG-367.
 */
const COOKIE_CONSENT_PURPOSE = 'cookie-consent';
const COOKIE_CONSENT_TABLE = 'CookieConsentRecord';

/**
 * FO-98: one write per PUBLIC_INTAKE_TABLES table, the smallest the form itself
 * makes. A row count cannot tell an open empty table from a closed one (0 = 0):
 * with ExpertPreRegAttempt dropped from system_scope_open the counts still
 * matched and rls:verify passed. So each table is written once outside any scope
 * (must be an RLS error) and once inside public-intake (must be accepted), each
 * inside tryInsert's savepoint. A table on the list without a probe here fails.
 */
const PUBLIC_INTAKE_PROBES = new Map<string, (id: string) => [sql: string, params: unknown[]]>([
  // NG-175: the readiness contact form (src/lib/leads/public-lead.ts submitPublicLead).
  ['PublicLead', (id) => [PUBLIC_LEAD_INSERT, [id]]],
  [
    EXPERT_TABLE,
    (id) => [
      `insert into ${quoteIdent(EXPERT_TABLE)} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale)
       values ($1, 'probe', $1 || '@rls-verify.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr')`,
      [id],
    ],
  ],
  ['ExpertPreRegAttempt', (id) => [`insert into "ExpertPreRegAttempt" (id, "ipHash") values ($1, 'rls-verify-probe')`, [id]]],
  // One-row counter (CHECK id = 1), written by the app with this same upsert
  // (src/lib/expert-prereg/server/founder-counter.ts). Empty table: the INSERT
  // path meets WITH CHECK. Seeded row: the UPDATE path meets USING, and RLS
  // refuses a hidden conflicting row with an error instead of a silent 0-row
  // UPDATE. No WHERE, so the UPDATE path always runs; lastNumber is not touched,
  // so the "only goes up" trigger stays out of it.
  [
    'ExpertFounderCounter',
    () => [
      `insert into "ExpertFounderCounter" (id, "lastNumber", "updatedAt") values (1, 0, now())
       on conflict (id) do update set "updatedAt" = excluded."updatedAt"`,
      [],
    ],
  ],
]);

/**
 * FO-92 (FO-21 O4): the reverse direction. The expert's personal data opens only
 * for the purposes that handle it; the others read exactly what they read outside
 * the scope (0) and cannot insert there.
 */
const EXPERT_DATA_PURPOSES = new Set(['public-intake', 'platform-admin', 'platform-aggregate', 'cross-tenant-job']);
/**
 * Tables system_scope_open() opens only for some purposes (FO-92; NG-175 for PublicLead = O-1 and
 * ProvinceLeadRoute = D-1). A purpose off the list reads what it reads outside the scope (0) and
 * cannot insert (when a write probe exists below).
 */
const PURPOSE_NARROWED = new Map<string, ReadonlySet<string>>([
  [EXPERT_TABLE, EXPERT_DATA_PURPOSES],
  ['ExpertPreRegAttempt', EXPERT_DATA_PURPOSES],
  ['PublicLead', new Set(['public-intake', 'platform-admin', 'cross-tenant-job'])],
  [COOKIE_CONSENT_TABLE, new Set([COOKIE_CONSENT_PURPOSE, 'platform-admin', 'cross-tenant-job'])],
  ['ProvinceLeadRoute', new Set(['platform-admin', 'cross-tenant-job'])],
]);

/**
 * NG-243 (NG-9 review Ö-1): the intake tables are append-only for the intake purposes. On one
 * probe row per INTAKE_APPEND_ONLY table (written under PROBE_ROW_PURPOSE inside this
 * transaction; ExpertPreRegistration's is a VERIFIED row, a pending one is the form's own
 * exception), an UPDATE and a DELETE under the table's intake purpose must touch 0 rows, and the
 * same DELETE under 'cross-tenant-job' (the retention purges) must still touch 1. The catalogue
 * check alone cannot tell a restrictive policy that shuts from one whose expression is `true`.
 * Rolled back, nothing is kept.
 */
const INTAKE_APPEND_ONLY_PROBES = new Map<string, { purpose: string; insert: [string, (id: string) => unknown[]]; update: string }>([
  [
    'CookieConsentRecord',
    { purpose: COOKIE_CONSENT_PURPOSE, insert: [COOKIE_CONSENT_INSERT, (id) => [id]], update: `update "CookieConsentRecord" set choice = 'accept_all' where id = $1` },
  ],
  ['PublicLead', { purpose: 'public-intake', insert: [PUBLIC_LEAD_INSERT, (id) => [id]], update: `update "PublicLead" set email = 'changed@rls-verify.invalid' where id = $1` }],
  [
    'ExpertPreRegAttempt',
    {
      purpose: 'public-intake',
      insert: [`insert into "ExpertPreRegAttempt" (id, "ipHash") values ($1, 'rls-verify-probe')`, (id) => [id]],
      update: `update "ExpertPreRegAttempt" set "ipHash" = 'changed' where id = $1`,
    },
  ],
  [
    EXPERT_TABLE,
    {
      purpose: 'public-intake',
      insert: [
        `insert into ${quoteIdent(EXPERT_TABLE)} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale, status, "emailVerifiedAt")
         values ($1, 'probe', $2, '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr', 'verified', now())`,
        (id) => [id, `${id}@rls-verify.invalid`],
      ],
      update: `update ${quoteIdent(EXPERT_TABLE)} set "fullName" = 'changed' where id = $1`,
    },
  ],
]);

async function probeIntakeAppendOnly(m: pg.Client, existing: ReadonlySet<string>): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const touched = async (sql: string, params: unknown[]): Promise<number | string> => {
    await m.query('savepoint probe_append_only');
    try {
      return (await m.query(sql, params)).rowCount ?? -1;
    } catch (e) {
      return e instanceof Error ? e.message.split('\n')[0]! : String(e);
    } finally {
      await m.query('rollback to savepoint probe_append_only');
    }
  };
  for (const t of [...INTAKE_APPEND_ONLY].sort()) {
    if (!existing.has(t)) {
      checks.push(`append-only: ${t} bu veritabanında yok, ölçülmedi`);
      continue;
    }
    const probe = INTAKE_APPEND_ONLY_PROBES.get(t);
    if (!probe) {
      failures.push(`append-only: ${t} için prob yok (INTAKE_APPEND_ONLY_PROBES)`);
      continue;
    }
    const id = `rls-verify-${randomBytes(6).toString('hex')}`;
    await m.query('begin');
    try {
      await m.query('select enter_system_scope($1)', [PROBE_ROW_PURPOSE]);
      const [sql, params] = probe.insert;
      await m.query(sql, params(id));
      await m.query('select enter_system_scope($1)', [probe.purpose]);
      const upd = await touched(probe.update, [id]);
      const del = await touched(`delete from ${quoteIdent(t)} where id = $1`, [id]);
      if (upd === 0 && del === 0) checks.push(`append-only: ${t} ${probe.purpose} ile UPDATE 0, DELETE 0 satır`);
      else failures.push(`append-only: ${t} ${probe.purpose} ile UPDATE ${upd}, DELETE ${del} satır (0 beklenir)`);
      await m.query(`select enter_system_scope('cross-tenant-job')`);
      const purge = await touched(`delete from ${quoteIdent(t)} where id = $1`, [id]);
      if (purge === 1) checks.push(`append-only: ${t} cross-tenant-job ile DELETE 1 satır (saklama silmesi çalışıyor)`);
      else failures.push(`append-only: ${t} cross-tenant-job ile DELETE ${purge} (1 beklenir — saklama silmesi bozuldu)`);
    } catch (e) {
      failures.push(`append-only: ${t} prob satırı yazılamadı — ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    } finally {
      await m.query('rollback');
    }
  }
  return { failures, checks };
}

async function probePurposeTables(
  m: pg.Client,
  admin: pg.Client | null
): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const tables = (
    await m.query<{ t: string }>(
      `select tablename as t from pg_policies where schemaname = 'public' and policyname = 'system_scope' order by 1`
    )
  ).rows.map((r) => r.t);
  if (!tables.includes('AuditEvent')) {
    failures.push('system_scope: AuditEvent politikası yok — amaç ölçümü koşamadı.');
    return { failures, checks };
  }
  const countAll = async (c: pg.Client): Promise<Map<string, number>> => {
    const out = new Map<string, number>();
    for (const t of tables) {
      out.set(t, Number((await c.query<{ n: number }>(`select count(*)::int as n from ${quoteIdent(t)}`)).rows[0]?.n ?? -1));
    }
    return out;
  };
  const tryInsert = async (sql: string, params: unknown[]): Promise<'ok' | 'rls' | string> => {
    await m.query('savepoint probe_purpose');
    try {
      await m.query(sql, params);
      return 'ok';
    } catch (e) {
      return isRlsViolation(e) ? 'rls' : e instanceof Error ? e.message.split('\n')[0]! : String(e);
    } finally {
      await m.query('rollback to savepoint probe_purpose');
    }
  };
  const auditInsert = (tenantId: string | null) =>
    tryInsert(`insert into "AuditEvent" (id, "tenantId", type) values ($1, $2, 'rls-verify.probe')`, [
      `rls-verify-${randomBytes(6).toString('hex')}`,
      tenantId,
    ]);

  let truth: Map<string, number> | null = null;
  if (admin) {
    await admin.query('begin isolation level repeatable read');
    const snap = (await admin.query<{ s: string }>('select pg_export_snapshot() as s')).rows[0]!.s;
    await m.query('begin isolation level repeatable read');
    await m.query(`set transaction snapshot '${snap.replace(/'/g, "''")}'`);
    truth = await countAll(admin);
  } else {
    await m.query('begin isolation level repeatable read');
  }
  try {
    const tenantId = (await m.query<{ id: string }>('select id from "Tenant" order by id limit 1')).rows[0]?.id ?? null;
    // NG-183: one probe row per system_scope table first, so a closed purpose reads 0 of N
    // real rows instead of 0 of 0. Visible to this transaction only; rolled back below.
    const probe = await addProbeRows(
      m,
      SYSTEM_SCOPE_TABLES.map((s) => s.table).filter((t) => tables.includes(t)),
      tenantId
    );
    failures.push(...probe.failures);
    checks.push(...probe.checks);
    if (truth) for (const [t, n] of probe.added) truth.set(t, (truth.get(t) ?? 0) + n);
    const outside = await countAll(m);
    const opened = (inside: Map<string, number>) =>
      tables.filter((t) => (inside.get(t) ?? 0) > (outside.get(t) ?? 0));

    const intakeProbes: [string, (id: string) => [string, unknown[]]][] = [];
    for (const t of PUBLIC_INTAKE_TABLES) {
      const probe = PUBLIC_INTAKE_PROBES.get(t);
      if (!probe) failures.push(`public-intake: ${t} için yazma prob'u yok (PUBLIC_INTAKE_PROBES) — boş tabloda kapsam ölçülemez`);
      else if (!tables.includes(t)) checks.push(`public-intake: ${t} bu veritabanında yok (system_scope politikası yok), yazma ölçülmedi`);
      else intakeProbes.push([t, probe]);
    }
    for (const [t, probe] of intakeProbes) {
      const r = await tryInsert(...probe(`rls-verify-${randomBytes(6).toString('hex')}`));
      if (r === 'rls') checks.push(`public-intake: ${t} kapsam dışında INSERT reddedildi`);
      else failures.push(`public-intake: ${t} kapsam dışında INSERT ${r === 'ok' ? 'KABUL EDİLDİ' : `beklenmeyen hatayla düştü — ${r}`}`);
    }

    await m.query(`select enter_system_scope('public-intake')`);
    const intake = await countAll(m);
    const leaked = opened(intake).filter((t) => !PUBLIC_INTAKE_TABLES.has(t));
    if (leaked.length > 0) {
      failures.push(
        `public-intake: ${leaked.length} tablo kapsam dışından fazlasını gösteriyor (yalnız ${[...PUBLIC_INTAKE_TABLES].join(', ')} açılmalı): ${leaked
          .map((t) => `${t}=${intake.get(t)}>${outside.get(t)}`)
          .join(', ')}`
      );
    } else {
      checks.push(`public-intake: ${tables.filter((t) => !PUBLIC_INTAKE_TABLES.has(t)).length} system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ${[...PUBLIC_INTAKE_TABLES].filter((t) => tables.includes(t)).join(', ')} açık)`);
    }
    if (truth) {
      const short = [...PUBLIC_INTAKE_TABLES].filter((t) => tables.includes(t) && intake.get(t) !== truth!.get(t));
      if (short.length > 0) failures.push(`public-intake: kendi tablosunu tam göremiyor: ${short.map((t) => `${t}=${intake.get(t)}/${truth!.get(t)}`).join(', ')}`);
    }
    const auditIntake = await auditInsert(tenantId);
    if (auditIntake === 'rls') checks.push('public-intake: AuditEvent INSERT reddedildi');
    else failures.push(`public-intake: AuditEvent INSERT ${auditIntake === 'ok' ? 'KABUL EDİLDİ' : `beklenmeyen hatayla düştü — ${auditIntake}`}`);
    for (const [t, probe] of intakeProbes) {
      const r = await tryInsert(...probe(`rls-verify-${randomBytes(6).toString('hex')}`));
      if (r === 'ok') checks.push(`public-intake: ${t} INSERT kabul edildi (pozitif kontrol, geri alındı)`);
      else failures.push(`public-intake: ${t} INSERT reddedildi — form yazamaz: ${r === 'rls' ? 'RLS' : r}`);
    }

    // NG-367 Ö-3: the consent record is shut to public-intake and open to cookie-consent only.
    if (!tables.includes(COOKIE_CONSENT_TABLE)) {
      checks.push(`${COOKIE_CONSENT_PURPOSE}: ${COOKIE_CONSENT_TABLE} bu veritabanında yok (system_scope politikası yok), ölçülmedi`);
    } else {
      const consentId = () => `rls-verify-${randomBytes(6).toString('hex')}`;
      const outsideWrite = await tryInsert(COOKIE_CONSENT_INSERT, [consentId()]);
      if (outsideWrite === 'rls') checks.push(`public-intake: ${COOKIE_CONSENT_TABLE} INSERT reddedildi (NG-367: ayrı amaç)`);
      else failures.push(`public-intake: ${COOKIE_CONSENT_TABLE} INSERT ${outsideWrite === 'ok' ? 'KABUL EDİLDİ — çerez rızası hâlâ public-intake ile yazılabiliyor' : `beklenmeyen hatayla düştü — ${outsideWrite}`}`);

      await m.query('select enter_system_scope($1)', [COOKIE_CONSENT_PURPOSE]);
      const consent = await countAll(m);
      const extra = opened(consent).filter((t) => t !== COOKIE_CONSENT_TABLE);
      if (extra.length > 0) {
        failures.push(`${COOKIE_CONSENT_PURPOSE}: ${extra.length} tablo kapsam dışından fazlasını gösteriyor (yalnız ${COOKIE_CONSENT_TABLE} açılmalı): ${extra.map((t) => `${t}=${consent.get(t)}>${outside.get(t)}`).join(', ')}`);
      } else {
        checks.push(`${COOKIE_CONSENT_PURPOSE}: ${tables.length - 1} system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ${COOKIE_CONSENT_TABLE} açık)`);
      }
      if (truth && consent.get(COOKIE_CONSENT_TABLE) !== truth.get(COOKIE_CONSENT_TABLE)) {
        failures.push(`${COOKIE_CONSENT_PURPOSE}: kendi tablosunu tam göremiyor: ${COOKIE_CONSENT_TABLE}=${consent.get(COOKIE_CONSENT_TABLE)}/${truth.get(COOKIE_CONSENT_TABLE)}`);
      }
      const shutWrites: [string, () => Promise<string>][] = [
        ['AuditEvent', () => auditInsert(tenantId)],
        ...(tables.includes('PublicLead') ? [['PublicLead', () => tryInsert(PUBLIC_LEAD_INSERT, [consentId()])] as [string, () => Promise<string>]] : []),
      ];
      for (const [t, write] of shutWrites) {
        const r = await write();
        if (r === 'rls') checks.push(`${COOKIE_CONSENT_PURPOSE}: ${t} INSERT reddedildi`);
        else failures.push(`${COOKIE_CONSENT_PURPOSE}: ${t} INSERT ${r === 'ok' ? 'KABUL EDİLDİ' : `beklenmeyen hatayla düştü — ${r}`}`);
      }
      const own = await tryInsert(COOKIE_CONSENT_INSERT, [consentId()]);
      if (own === 'ok') checks.push(`${COOKIE_CONSENT_PURPOSE}: ${COOKIE_CONSENT_TABLE} INSERT kabul edildi (pozitif kontrol, geri alındı)`);
      else failures.push(`${COOKIE_CONSENT_PURPOSE}: ${COOKIE_CONSENT_TABLE} INSERT reddedildi — bant rızayı yazamaz: ${own === 'rls' ? 'RLS' : own}`);
    }

    // The other purposes are not narrowed by public-intake's list: each still
    // opens every row, except the expert data the purpose does not handle (FO-92).
    for (const purpose of ['tenant-discovery', 'subject-scoped', 'platform-admin', 'platform-aggregate', 'cross-tenant-job']) {
      await m.query('select enter_system_scope($1)', [purpose]);
      const inside = await countAll(m);
      const shut = tables.filter((t) => PURPOSE_NARROWED.get(t)?.has(purpose) === false);
      if (shut.length > 0) {
        const seen = shut.filter((t) => (inside.get(t) ?? 0) > (outside.get(t) ?? 0));
        if (seen.length > 0) {
          failures.push(`${purpose}: amacına kapalı tabloyu görüyor (kapalı olmalı): ${seen.map((t) => `${t}=${inside.get(t)}>${outside.get(t)}`).join(', ')}`);
        } else {
          checks.push(`${purpose}: ${shut.map((t) => `${t}=${inside.get(t)}${truth ? `/${truth.get(t)}` : ''}`).join(', ')} — amaca kapalı`);
        }
        const writes: [string, [string, unknown[]]][] = [];
        const probeId = () => `rls-verify-${randomBytes(6).toString('hex')}`;
        if (shut.includes(EXPERT_TABLE)) {
          writes.push([
            EXPERT_TABLE,
            [
              `insert into ${quoteIdent(EXPERT_TABLE)} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale)
           values ($1, 'probe', $1 || '@rls-verify.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr')`,
              [probeId()],
            ],
          ]);
        }
        if (shut.includes('PublicLead')) writes.push(['PublicLead', [PUBLIC_LEAD_INSERT, [probeId()]]]);
        if (shut.includes(COOKIE_CONSENT_TABLE)) writes.push([COOKIE_CONSENT_TABLE, [COOKIE_CONSENT_INSERT, [probeId()]]]);
        if (shut.includes('ProvinceLeadRoute') && tenantId) {
          writes.push([
            'ProvinceLeadRoute',
            [`insert into "ProvinceLeadRoute" (id, province, "targetTenantId", active, "updatedAt") values ($1, 'Bolu', $2, false, now())`, [probeId(), tenantId]],
          ]);
        }
        for (const [t, [sql, params]] of writes) {
          const r = await tryInsert(sql, params);
          if (r === 'rls') checks.push(`${purpose}: ${t} INSERT reddedildi`);
          else failures.push(`${purpose}: ${t} INSERT ${r === 'ok' ? 'KABUL EDİLDİ' : `beklenmeyen hatayla düştü — ${r}`}`);
        }
      }
      const short = (
        truth
          ? tables.filter((t) => inside.get(t) !== truth!.get(t))
          : tables.filter((t) => (inside.get(t) ?? 0) < (outside.get(t) ?? 0))
      ).filter((t) => !shut.includes(t));
      if (short.length > 0) {
        failures.push(`${purpose}: daraldı, tüm satırları görmüyor: ${short.map((t) => `${t}=${inside.get(t)}`).join(', ')}`);
      } else {
        checks.push(`${purpose}: ${opened(inside).length} tablo kapsamla açıldı${truth ? `, ${shut.length > 0 ? 'amaca kapalı tablolar dışında ' : ''}her system_scope tablosunda tüm satırlar` : ''}`);
      }
    }
    const auditAdmin = await auditInsert(tenantId);
    if (auditAdmin === 'ok') checks.push('cross-tenant-job: AuditEvent INSERT kabul edildi (pozitif kontrol, geri alındı)');
    else failures.push(`cross-tenant-job: AuditEvent INSERT reddedildi — ${auditAdmin === 'rls' ? 'RLS' : auditAdmin}`);
  } finally {
    await m.query('rollback');
    if (admin) await admin.query('rollback');
  }
  return { failures, checks };
}

/**
 * NG-52 (SEC NG-185 F-4) + NG-188 (SEC NG-185 F-1b): the purpose 'expert-directory' (M8
 * matching reads the expert pool). Its one read is the view EXPERT_DIRECTORY_VIEW; the base
 * table is shut to it. Measured in one rolled-back transaction of the measured role, after
 * three probe rows (verified, pending, disabled) are written under PROBE_ROW_PURPOSE:
 *   - the view exists, is security_barrier, is not updatable, and its columns are exactly
 *     EXPERT_DIRECTORY_COLUMNS (no name, e-mail, ORCID, LinkedIn, IP or token);
 *   - outside the scope, with a plain SET of the purpose (no seal) and under another sealed
 *     purpose the view shows 0 rows;
 *   - inside the sealed scope ExpertPreRegistration shows 0 rows, so its personal-data
 *     columns cannot be read at all; the view shows exactly the verified + consented rows
 *     (the owner connection counts them in the same snapshot) and of the probe rows only the
 *     verified one; no other system_scope table shows more than outside;
 *   - nothing is written: the base table's UPDATE and DELETE touch 0 rows and INSERT is
 *     refused by RLS, and INSERT, UPDATE and DELETE on the view fail.
 */
const EXPERT_DIRECTORY_PURPOSE = 'expert-directory';
const EXPERT_DIRECTORY_VIEW = 'ExpertDirectoryEntry';
/** The card M8 may see, plus the row number it is read in (prisma/rls.sql). */
const EXPERT_DIRECTORY_COLUMNS = [
  'expertiseAreas',
  'founderNumber',
  'id',
  'isFreelancer',
  'languages',
  'listOrder',
  'programmes',
  'province',
  'roles',
] as const;

async function probeExpertDirectory(
  m: pg.Client,
  admin: pg.Client | null
): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const p = EXPERT_DIRECTORY_PURPOSE;
  const view = quoteIdent(EXPERT_DIRECTORY_VIEW);

  const shape = (
    await m.query<{ exists: boolean; barrier: boolean; updatable: string | null; insertable: string | null; cols: string[] | null }>(
      `select to_regclass($1) is not null as exists,
              coalesce((select 'security_barrier=true' = any(c.reloptions) from pg_class c where c.oid = to_regclass($1)), false) as barrier,
              (select v.is_updatable from information_schema.views v where v.table_schema = 'public' and v.table_name = $2) as updatable,
              (select v.is_insertable_into from information_schema.views v where v.table_schema = 'public' and v.table_name = $2) as insertable,
              (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
                where a.attrelid = to_regclass($1) and a.attnum > 0 and not a.attisdropped) as cols`,
      [`public.${view}`, EXPERT_DIRECTORY_VIEW]
    )
  ).rows[0];
  if (!shape?.exists) {
    failures.push(`${p}: ${EXPERT_DIRECTORY_VIEW} görünümü YOK — M8 uzman havuzu okunamaz (pnpm db:rls)`);
    return { failures, checks };
  }
  const cols = [...(shape.cols ?? [])].sort();
  const expectedCols = [...EXPERT_DIRECTORY_COLUMNS];
  if (JSON.stringify(cols) !== JSON.stringify(expectedCols)) {
    const extra = cols.filter((c) => !expectedCols.includes(c as (typeof EXPERT_DIRECTORY_COLUMNS)[number]));
    const missing = expectedCols.filter((c) => !cols.includes(c));
    failures.push(
      `${p}: ${EXPERT_DIRECTORY_VIEW} sütunları {${cols.join(', ')}}${extra.length ? ` — fazla: ${extra.join(', ')}` : ''}${missing.length ? ` — eksik: ${missing.join(', ')}` : ''}`
    );
  } else {
    checks.push(`${p}: ${EXPERT_DIRECTORY_VIEW} yalnız kart sütunları (${cols.length}: ${cols.join(', ')})`);
  }
  if (!shape.barrier) failures.push(`${p}: ${EXPERT_DIRECTORY_VIEW} security_barrier değil`);
  else checks.push(`${p}: ${EXPERT_DIRECTORY_VIEW} security_barrier`);
  if (shape.updatable !== 'NO' || shape.insertable !== 'NO') {
    failures.push(`${p}: ${EXPERT_DIRECTORY_VIEW} güncellenebilir (is_updatable=${shape.updatable}, is_insertable_into=${shape.insertable}) — sahip yetkisiyle tabloya yazılabilir`);
  } else {
    checks.push(`${p}: ${EXPERT_DIRECTORY_VIEW} güncellenemez`);
  }

  const tables = (
    await m.query<{ t: string }>(
      `select tablename as t from pg_policies where schemaname = 'public' and policyname = 'system_scope' order by 1`
    )
  ).rows.map((r) => r.t);
  const countAll = async (): Promise<Map<string, number>> => {
    const out = new Map<string, number>();
    for (const t of tables) {
      out.set(t, Number((await m.query<{ n: number }>(`select count(*)::int as n from ${quoteIdent(t)}`)).rows[0]?.n ?? -1));
    }
    return out;
  };
  const count = async (rel: string): Promise<number> =>
    Number((await m.query<{ n: number }>(`select count(*)::int as n from ${rel}`)).rows[0]?.n ?? -1);

  let expectedListed: number | null = null;
  if (admin) {
    await admin.query('begin isolation level repeatable read');
    const snap = (await admin.query<{ s: string }>('select pg_export_snapshot() as s')).rows[0]!.s;
    await m.query('begin isolation level repeatable read');
    await m.query(`set transaction snapshot '${snap.replace(/'/g, "''")}'`);
    expectedListed = Number(
      (
        await admin.query<{ n: number }>(
          `select count(*)::int as n from ${quoteIdent(EXPERT_TABLE)} where status = 'verified' and "visibilityConsentAt" is not null`
        )
      ).rows[0]?.n ?? 0
    );
  } else {
    await m.query('begin isolation level repeatable read');
  }
  try {
    const outside = await countAll();
    const viewOutside = await count(view);
    if (viewOutside !== 0) failures.push(`${p}: kapsam dışında ${EXPERT_DIRECTORY_VIEW} ${viewOutside} satır gösteriyor`);
    else checks.push(`${p}: kapsam dışında ${EXPERT_DIRECTORY_VIEW} 0 satır`);

    const ids = { verified: '', pending: '', disabled: '' };
    await m.query('select enter_system_scope($1)', [PROBE_ROW_PURPOSE]);
    for (const status of ['verified', 'pending', 'disabled'] as const) {
      const id = `rls-verify-${randomBytes(6).toString('hex')}`;
      ids[status] = id;
      await m.query(
        `insert into ${quoteIdent(EXPERT_TABLE)} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale, status)
         values ($1, 'probe', $1 || '@rls-verify.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr', $2)`,
        [id, status]
      );
    }
    if (expectedListed !== null) expectedListed += 1;
    // Another sealed purpose — one that does open the base table — opens nothing in the view.
    const viewOther = await count(view);
    if (viewOther !== 0) failures.push(`${p}: '${PROBE_ROW_PURPOSE}' kapsamında ${EXPERT_DIRECTORY_VIEW} ${viewOther} satır gösteriyor (yalnız ${p} açmalı)`);
    else checks.push(`${p}: '${PROBE_ROW_PURPOSE}' kapsamında ${EXPERT_DIRECTORY_VIEW} 0 satır`);

    // A plain SET of the purpose is not the seal: nothing opens.
    await m.query(
      `select set_config('app.system_scope', 'on', true), set_config('app.system_scope_purpose', $1, true), set_config('app.system_scope_token', '', true)`,
      [p]
    );
    const forgedBase = await count(quoteIdent(EXPERT_TABLE));
    const forgedView = await count(view);
    if (forgedBase !== 0 || forgedView !== 0) {
      failures.push(`${p}: mühürsüz (düz SET) amaçla ${EXPERT_TABLE} ${forgedBase}, ${EXPERT_DIRECTORY_VIEW} ${forgedView} satır — mühür uygulanmıyor`);
    } else {
      checks.push(`${p}: mühürsüz (düz SET) amaçla ${EXPERT_TABLE} ve ${EXPERT_DIRECTORY_VIEW} 0 satır`);
    }

    await m.query('select enter_system_scope($1)', [p]);
    // NG-188: the base table — and with it every personal-data column — is shut to the purpose.
    const base = await count(quoteIdent(EXPERT_TABLE));
    const pii = (
      await m.query(`select "fullName", email, orcid, "linkedinUrl", "ipHash", "verifyTokenHash" from ${quoteIdent(EXPERT_TABLE)} where id = any($1)`, [
        Object.values(ids),
      ])
    ).rowCount;
    if (base !== 0 || pii !== 0) {
      failures.push(`${p}: ${EXPERT_TABLE} ${base} satır okunuyor (kişisel veri sütunlarıyla ${pii} prob satırı) — taban tablo bu amaca kapalı olmalı`);
    } else {
      checks.push(`${p}: ${EXPERT_TABLE} 0 satır — fullName/email/orcid/linkedinUrl/ipHash/verifyTokenHash okunamıyor`);
    }

    const listed = await count(view);
    const probeSeen = (
      await m.query<{ id: string }>(`select id from ${view} where id = any($1) order by id`, [Object.values(ids)])
    ).rows.map((r) => r.id);
    if (probeSeen.length !== 1 || probeSeen[0] !== ids.verified) {
      const leaked = (['pending', 'disabled'] as const).filter((s) => probeSeen.includes(ids[s]));
      failures.push(
        `${p}: ${EXPERT_DIRECTORY_VIEW} prob satırlarından görünen ${probeSeen.length}/3 (yalnız verified görünmeli)${leaked.length ? ` — doğrulanmamış/rızasız görünüyor: ${leaked.join(', ')}` : ''}`
      );
    } else {
      checks.push(`${p}: ${EXPERT_DIRECTORY_VIEW} pending/disabled prob satırı 0`);
    }
    if (expectedListed !== null && listed !== expectedListed) {
      failures.push(`${p}: ${EXPERT_DIRECTORY_VIEW} verified + rızalı ${listed}/${expectedListed} satır görüldü — görünüm koşulu yanlış`);
    } else if (probeSeen.length === 1 && probeSeen[0] === ids.verified) {
      checks.push(`${p}: ${EXPERT_DIRECTORY_VIEW} verified + rızalı ${listed}${expectedListed !== null ? `/${expectedListed}` : ''} satır görüldü (prob satırı dahil, geri alındı)`);
    }

    const inside = await countAll();
    const opened = tables.filter((t) => (inside.get(t) ?? 0) > (outside.get(t) ?? 0));
    if (opened.length > 0) {
      failures.push(`${p}: system_scope tablosu açıyor (hiçbiri açılmamalı): ${opened.map((t) => `${t}=${inside.get(t)}>${outside.get(t)}`).join(', ')}`);
    } else {
      checks.push(`${p}: ${tables.length} system_scope tablosunda kapsam dışıyla aynı satır sayısı`);
    }

    const write = async (sql: string, params: unknown[]): Promise<number | 'rls' | string> => {
      await m.query('savepoint probe_directory');
      try {
        return (await m.query(sql, params)).rowCount ?? 0;
      } catch (e) {
        return isRlsViolation(e) ? 'rls' : e instanceof Error ? e.message.split('\n')[0]! : String(e);
      } finally {
        await m.query('rollback to savepoint probe_directory');
      }
    };
    const upd = await write(`update ${quoteIdent(EXPERT_TABLE)} set "fullName" = 'rls-verify' where id = any($1)`, [Object.values(ids)]);
    const del = await write(`delete from ${quoteIdent(EXPERT_TABLE)} where id = any($1)`, [Object.values(ids)]);
    for (const [verb, r] of [['UPDATE', upd], ['DELETE', del]] as const) {
      if (r === 0) checks.push(`${p}: ${EXPERT_TABLE} ${verb} 0 satır`);
      else failures.push(`${p}: ${EXPERT_TABLE} ${verb} ${typeof r === 'number' ? `${r} satır değiştirdi` : `beklenmeyen sonuç — ${r}`} (yalnız okuma olmalı)`);
    }
    const ins = await write(
      `insert into ${quoteIdent(EXPERT_TABLE)} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale, status)
       values ($1, 'probe', $1 || '@rls-verify.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr', 'verified')`,
      [`rls-verify-${randomBytes(6).toString('hex')}`]
    );
    if (ins === 'rls') checks.push(`${p}: ${EXPERT_TABLE} INSERT reddedildi`);
    else failures.push(`${p}: ${EXPERT_TABLE} INSERT ${typeof ins === 'number' ?'KABUL EDİLDİ' : `beklenmeyen hatayla düştü — ${ins}`}`);
    // Through the view: refused outright (not updatable, and fabrika_app holds SELECT only).
    for (const [verb, sql, params] of [
      ['UPDATE', `update ${view} set province = '01' where id = any($1)`, [Object.values(ids)]],
      ['DELETE', `delete from ${view} where id = any($1)`, [Object.values(ids)]],
      ['INSERT', `insert into ${view} (id, province, "isFreelancer", roles, programmes, "expertiseAreas", languages) values ($1, '34', false, '{}', '{}', '{}', '{}')`, [`rls-verify-${randomBytes(6).toString('hex')}`]],
    ] as const) {
      const r = await write(sql, [...params]);
      if (typeof r === 'string' && r !== 'rls') checks.push(`${p}: ${EXPERT_DIRECTORY_VIEW} ${verb} reddedildi (${r})`);
      else failures.push(`${p}: ${EXPERT_DIRECTORY_VIEW} ${verb} ${typeof r === 'number' ? `${r} satır` : r} — görünümden yazma kapalı olmalı`);
    }
  } finally {
    await m.query('rollback');
    if (admin) await admin.query('rollback');
  }
  return { failures, checks };
}

/**
 * NG-187 (SEC NG-185 F-2): the seal binds the purpose. `app.system_scope_purpose` is USERSET,
 * so after enter_system_scope('<P>') the app role can still `SET LOCAL` the purpose to another
 * one. Before NG-187 the seal covered only secret | pid | transaction_timestamp, so the new
 * purpose took effect: an 'expert-directory' scope read every expert row and updated one.
 * For every purpose the database itself accepts (the list in enter_system_scope, read from
 * pg_get_functiondef so this follows the database, not a copy) and every other value
 * (each other purpose and ''), after enter_system_scope(P) + set_config(purpose, Q):
 * system_scope_sealed() is false, no probe table shows more than outside the scope, the probe
 * expert row cannot be updated and an AuditEvent insert is refused. Positive control per P:
 * right after enter_system_scope(P) the seal holds. Probe rows (addProbeRows plus one
 * verified + consented expert, which 'expert-directory' may read) are written under
 * PROBE_ROW_PURPOSE first; everything is rolled back.
 */
async function probeSealBindsPurpose(m: pg.Client): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const def = (
    await m.query<{ d: string | null }>(
      `select case when to_regprocedure('public.enter_system_scope(text)') is null then null
                   else pg_get_functiondef('public.enter_system_scope(text)'::regprocedure) end as d`
    )
  ).rows[0]?.d;
  const list = def ? /purpose NOT IN \(([\s\S]*?)\)/.exec(def)?.[1] : undefined;
  const purposes = list ? [...list.matchAll(/'([a-z-]+)'/g)].map((x) => x[1]!) : [];
  if (purposes.length < 2) {
    failures.push(`mühür-amaç: enter_system_scope amaç listesi okunamadı (${purposes.length} amaç) — yoklama koşamadı`);
    return { failures, checks };
  }
  const existingTables = new Set(
    (
      await m.query<{ t: string }>(
        `select tablename as t from pg_policies where schemaname = 'public' and policyname = 'system_scope'`
      )
    ).rows.map((r) => r.t)
  );
  const tables = [...SYSTEM_SCOPE_TABLES.map((s) => s.table), 'AuditEvent'].filter((t) => existingTables.has(t));
  // One row per table at most (LIMIT 1): visible or not is the question, and it stays cheap on live.
  const visible = async (): Promise<string> =>
    (
      await m.query<{ v: string }>(
        `select concat_ws(',', ${tables.map((t) => `(select case when exists (select 1 from ${quoteIdent(t)}) then '${t.replace(/'/g, "''")}' end)`).join(', ')}) as v`
      )
    ).rows[0]?.v ?? '';
  const sealed = async (): Promise<boolean> =>
    (await m.query<{ s: boolean }>('select public.system_scope_sealed() as s')).rows[0]?.s === true;
  const attempt = async (sql: string, params: unknown[]): Promise<number | 'rls' | string> => {
    await m.query('savepoint probe_seal');
    try {
      return (await m.query(sql, params)).rowCount ?? 0;
    } catch (e) {
      return isRlsViolation(e) ? 'rls' : e instanceof Error ? e.message.split('\n')[0]! : String(e);
    } finally {
      await m.query('rollback to savepoint probe_seal');
    }
  };

  await m.query('begin');
  try {
    const tenantId = (await m.query<{ id: string }>('select id from "Tenant" order by id limit 1')).rows[0]?.id ?? null;
    const probe = await addProbeRows(m, tables.filter((t) => t !== 'AuditEvent'), tenantId);
    failures.push(...probe.failures);
    const expertId = `rls-verify-${randomBytes(6).toString('hex')}`;
    if (existingTables.has(EXPERT_TABLE)) {
      await m.query('select enter_system_scope($1)', [PROBE_ROW_PURPOSE]);
      await m.query(
        `insert into ${quoteIdent(EXPERT_TABLE)} (id, "fullName", email, province, "isFreelancer", "expertiseAreas", roles, programmes, languages, "kvkkAcceptedAt", "visibilityConsentAt", locale, status)
         values ($1, 'probe', $1 || '@rls-verify.invalid', '34', false, '{}', '{}', '{}', '{}', now(), now(), 'tr', 'verified')`,
        [expertId]
      );
      if (existingTables.has('AuditEvent')) {
        await m.query(`insert into "AuditEvent" (id, "tenantId", type) values ($1, null, 'rls-verify.probe')`, [
          `rls-verify-${randomBytes(6).toString('hex')}`,
        ]);
      }
      await m.query(
        `select set_config('app.system_scope', 'off', true), set_config('app.system_scope_purpose', '', true), set_config('app.system_scope_token', '', true)`
      );
    }
    const outside = await visible();

    let pairs = 0;
    const broken: string[] = [];
    for (const p of purposes) {
      await m.query('select enter_system_scope($1)', [p]);
      if (!(await sealed())) {
        failures.push(`mühür-amaç: enter_system_scope('${p}') hemen sonra system_scope_sealed() false — meşru yol kapalı`);
        continue;
      }
      for (const q of [...purposes.filter((x) => x !== p), '']) {
        await m.query('select enter_system_scope($1)', [p]);
        await m.query(`select set_config('app.system_scope_purpose', $1, true)`, [q]);
        pairs += 1;
        const label = `${p} → '${q}'`;
        if (await sealed()) broken.push(`${label}: system_scope_sealed() hâlâ true`);
        const seen = await visible();
        if (seen !== outside) broken.push(`${label}: görünen tablolar {${seen}} (kapsam dışında {${outside}})`);
        if (existingTables.has(EXPERT_TABLE)) {
          const upd = await attempt(`update ${quoteIdent(EXPERT_TABLE)} set "fullName" = 'rls-verify' where id = $1`, [expertId]);
          // 'rls' or no UPDATE grant (a probe role holds SELECT, INSERT only): either way nothing was written.
          if (upd !== 0 && upd !== 'rls' && !/permission denied/i.test(String(upd))) broken.push(`${label}: ${EXPERT_TABLE} UPDATE ${typeof upd === 'number' ? `${upd} satır` : upd}`);
        }
        if (existingTables.has('AuditEvent')) {
          const ins = await attempt(`insert into "AuditEvent" (id, "tenantId", type) values ($1, $2, 'rls-verify.probe')`, [
            `rls-verify-${randomBytes(6).toString('hex')}`,
            tenantId,
          ]);
          if (ins !== 'rls') broken.push(`${label}: AuditEvent INSERT ${typeof ins === 'number' ? 'KABUL EDİLDİ' : ins}`);
        }
      }
    }
    if (broken.length > 0) {
      failures.push(
        `mühür-amaç: mühürden sonra amaç değiştirilince kapsam açık kalıyor (mühür amacı bağlamıyor, NG-187) — ${broken.length} bulgu: ${broken.slice(0, 6).join('; ')}${broken.length > 6 ? ' …' : ''}`
      );
    } else {
      checks.push(
        `mühür-amaç: ${purposes.length} amaç × ${purposes.length} değer = ${pairs} amaç değişikliği — mühür tutmuyor, okuma kapsam dışıyla aynı ({${outside}}), UPDATE 0, INSERT reddedildi`
      );
    }
  } finally {
    await m.query('rollback');
  }
  return { failures, checks };
}

/**
 * NG-222 (K-583842): `close_own_province_routes` is the tenant scope's only write door to
 * ProvinceLeadRoute. Catalogue (on the DATABASE_URL connection): it exists, SECURITY DEFINER,
 * search_path fixed, EXECUTE not held by PUBLIC / anon / authenticated, held by fabrika_app.
 * Behaviour (on the measuring role, when it may EXECUTE it): no app.tenant_id → refused; a tenant
 * id that names no tenant → closes nothing; app.system_scope is not left 'on'. Writes nothing
 * (the only call that reaches the loop names no tenant); everything is rolled back.
 */
async function probeOwnRouteClose(admin: pg.Client, m: pg.Client): Promise<{ failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const fn = 'public.close_own_province_routes(text, text)';
  const cat = (
    await admin.query<{ present: boolean; definer: boolean | null; config: string[] | null; pub: boolean | null; api: string[] | null; app: boolean | null }>(
      `select p.oid is not null as present, p.prosecdef as definer, p.proconfig as config,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as pub,
              array(select r.rolname::text from pg_roles r where r.rolname in ('anon', 'authenticated') and has_function_privilege(r.oid, p.oid, 'EXECUTE')) as api,
              case when exists (select 1 from pg_roles where rolname = 'fabrika_app') then has_function_privilege('fabrika_app', p.oid, 'EXECUTE') end as app
         from (select to_regprocedure($1) as oid) f left join pg_proc p on p.oid = f.oid`,
      [fn]
    )
  ).rows[0];
  if (!cat?.present) {
    failures.push(`kendi-rota-kapanışı: ${fn} yok (prisma/migrations/add-close-own-province-routes.sql uygulanmamış, NG-222)`);
    return { failures, checks };
  }
  const bad: string[] = [];
  if (!cat.definer) bad.push('SECURITY DEFINER değil');
  if (!(cat.config ?? []).some((c) => c.startsWith('search_path='))) bad.push('search_path sabit değil');
  if (cat.pub) bad.push('PUBLIC EXECUTE tutuyor');
  if ((cat.api ?? []).length > 0) bad.push(`Supabase API rolleri EXECUTE tutuyor: ${(cat.api ?? []).join(', ')}`);
  if (cat.app === false) bad.push('fabrika_app EXECUTE tutmuyor (kiracının ayarı ve faturalama M18 kapanışında rotayı kapatamaz)');
  if (bad.length > 0) {
    failures.push(`kendi-rota-kapanışı: ${bad.join('; ')}`);
    return { failures, checks };
  }

  const mayCall = (await m.query<{ ok: boolean }>(`select has_function_privilege(current_user, $1::regprocedure, 'EXECUTE') as ok`, [fn])).rows[0]?.ok === true;
  if (!mayCall) {
    checks.push(`kendi-rota-kapanışı: katalog doğru (DEFINER, search_path, yalnız fabrika_app); ölçüm rolü EXECUTE tutmuyor — davranış sondası atlandı`);
    return { failures, checks };
  }
  await m.query('begin');
  try {
    await m.query(`select set_config('app.tenant_id', '', true), set_config('app.system_scope', 'off', true)`);
    await m.query('savepoint probe_own_route');
    let refused = false;
    try {
      await m.query(`select public.close_own_province_routes('billing', null::text)`);
    } catch {
      refused = true;
    }
    await m.query('rollback to savepoint probe_own_route');
    if (!refused) failures.push('kendi-rota-kapanışı: app.tenant_id boşken çağrı REDDEDİLMEDİ');

    await m.query(`select set_config('app.tenant_id', $1, true)`, [`rls-verify-${randomBytes(6).toString('hex')}`]);
    const r = (
      await m.query<{ closed: string[]; flag: string | null }>(
        `select public.close_own_province_routes('billing', null::text) as closed, current_setting('app.system_scope', true) as flag`
      )
    ).rows[0];
    if ((r?.closed ?? []).length > 0) failures.push(`kendi-rota-kapanışı: var olmayan kiracı için ${r?.closed.length} rota kapattı`);
    const flag = (await m.query<{ flag: string | null }>(`select current_setting('app.system_scope', true) as flag`)).rows[0]?.flag;
    if (flag === 'on') failures.push(`kendi-rota-kapanışı: dönüşte app.system_scope 'on' kaldı`);
    if (refused && (r?.closed ?? []).length === 0 && flag !== 'on') {
      checks.push(`kendi-rota-kapanışı: katalog doğru (DEFINER, search_path, yalnız fabrika_app); kiracısız çağrı reddedildi, yabancı kiracı 0 rota, bayrak kapalı`);
    }
  } finally {
    await m.query('rollback');
  }
  return { failures, checks };
}


async function main() {
  const dotenv = readDotenv();
  const url = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
  if (!url) {
    skipped('DATABASE_URL yok');
    return;
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch (e) {
    const why = e instanceof Error ? e.message.split('\n')[0] : String(e);
    skipped(`Veritabanına ulaşılamadı (${why})`);
    console.log('   Kiracı izolasyonu ÖLÇÜLMEDİ. Docker/Postgres açıkken tekrar koş.');
    return;
  }

  let measurer: Measurer | null = null;
  let truth: Measurer | null = null;
  try {
    const models = tenantScopedModels();

    const enabled = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`
    );
    const rlsOn = new Set(enabled.rows.filter((r) => r.relrowsecurity).map((r) => r.relname));
    const existing = new Set(enabled.rows.map((r) => r.relname));
    // FORCE is what holds the policies on the table's OWNER — the prod migrate
    // role and every script that connects as it. The behavioural probe below
    // runs as an RLS-subject role that does not own the tables, so it cannot see
    // FORCE drop: a migration that turns it off for a backfill and fails to put
    // it back (m4-stale-digest-user-claim.sql) stayed green here
    // (TASK-MUOADTEOQVL4Z, İNCELEME-95 T-3).
    const forced = new Set(enabled.rows.filter((r) => r.relforcerowsecurity).map((r) => r.relname));

    const policies = await client.query<{ tablename: string }>(
      `select tablename from pg_policies
        where schemaname = 'public' and policyname = 'tenant_isolation'`
    );
    const hasPolicy = new Set(policies.rows.map((r) => r.tablename));

    const missingTable = models.filter((m) => !existing.has(m));
    const missingRls = models.filter((m) => existing.has(m) && !rlsOn.has(m));
    const missingPolicy = models.filter((m) => existing.has(m) && !hasPolicy.has(m));
    const missingForce = models.filter((m) => existing.has(m) && rlsOn.has(m) && !forced.has(m));

    // A system_scope policy that tests the bare GUC is a forgeable one
    // (TASK-MUOGMQK3JAH4Y): `app.system_scope` is USERSET, so fabrika_app can
    // set it itself. Checked in the catalogue as well as by the probe below,
    // because the probe only reads tables that hold rows — an empty AuditEvent
    // left the old wording (restated by a migration re-run) invisible to it.
    const scopePolicies = await client.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies
        where schemaname = 'public' and policyname = 'system_scope'`
    );
    const unsealed = scopePolicies.rows
      .filter((r) => !`${r.qual ?? ''}`.includes('system_scope_open(') || !`${r.with_check ?? ''}`.includes('system_scope_open('))
      .map((r) => r.tablename)
      .sort();

    // NG-183 (NG-175 review Düşük-1): on a system_scope table the one policy is
    // system_scope. Policies are permissive and OR together, so any other one — even a
    // SELECT-only `USING (true)` — opens what system_scope keeps shut, and the probes
    // above could not see it on an empty table. The set must be exactly {system_scope}.
    // The class is SYSTEM_SCOPE_TABLES plus any catalogue table carrying system_scope
    // without a tenant policy (a new one must be added to the list to be probed).
    type LivePolicy = { tablename: string; policyname: string; cmd: string; qual: string | null; roles: string[] | null; permissive: string; with_check: string | null };
    const allPolicies = await client.query<LivePolicy>(
      `select tablename, policyname, cmd, qual, roles::text[] as roles, permissive, with_check
         from pg_policies where schemaname = 'public' order by tablename, policyname`
    );
    const policiesOf = new Map<string, LivePolicy[]>();
    for (const r of allPolicies.rows) policiesOf.set(r.tablename, [...(policiesOf.get(r.tablename) ?? []), r]);
    const hasTenantPolicy = (t: string) =>
      (policiesOf.get(t) ?? []).some((p) => p.policyname === 'tenant_isolation' || p.policyname === 'tenant_or_shared');
    const systemScopeTables = [
      ...new Set([
        ...SYSTEM_SCOPE_TABLES.map((s) => s.table).filter((t) => existing.has(t)),
        ...[...policiesOf.keys()].filter((t) => !hasTenantPolicy(t) && (policiesOf.get(t) ?? []).some((p) => p.policyname === 'system_scope')),
      ]),
    ].sort();
    const policySetDrift: string[] = [];
    const expectedPolicies = new Map<string, PolicyShape>();
    for (const a of SYSTEM_SCOPE_ALLOWED_EXTRA) {
      if (!existing.has(a.table)) continue;
      const e = await expectedPolicy(client, a.table, a.policy, a.cmd);
      if ('error' in e) policySetDrift.push(e.error);
      else expectedPolicies.set(`${a.table}.${a.policy}`, e);
    }
    for (const t of systemScopeTables) {
      const pols = policiesOf.get(t) ?? [];
      // Why a named exception is not the one rls.sql writes; null = not a named exception here
      // (or its expected shape could not be compiled, already a failure above).
      const exceptionDrift = (p: LivePolicy): string[] | null => {
        const a = SYSTEM_SCOPE_ALLOWED_EXTRA.find((x) => x.table === t && x.policy === p.policyname);
        const exp = a ? expectedPolicies.get(`${a.table}.${a.policy}`) : undefined;
        return exp ? policyShapeDrift(p, exp) : null;
      };
      const allowed = (p: LivePolicy) => exceptionDrift(p)?.length === 0;
      const extra = pols.filter((p) => p.policyname !== 'system_scope' && !allowed(p));
      const shapeDrift = extra.flatMap((p) => {
        const d = exceptionDrift(p);
        return d && d.length > 0 ? [`${p.policyname} sapması: ${d.join('; ')}`] : [];
      });
      const missing = !pols.some((p) => p.policyname === 'system_scope');
      if (extra.length > 0 || missing) {
        policySetDrift.push(
          `${t}: politika kümesi {${pols.map((p) => p.policyname).join(', ')}}, beklenen tam {system_scope}${
            SYSTEM_SCOPE_ALLOWED_EXTRA.some((a) => a.table === t)
              ? ` (+ ${SYSTEM_SCOPE_ALLOWED_EXTRA.filter((a) => a.table === t).map((a) => `${a.policy} (${a.cmd})`).join(', ')})`
              : ''
          }${
            missing ? ' — system_scope YOK' : ''
          }${extra.length > 0 ? ` — fazla: ${extra.map((p) => `${p.policyname} (${p.cmd})`).join(', ')}` : ''}${
            shapeDrift.length > 0 ? ` — ${shapeDrift.join(' · ')}` : ''
          }`
        );
      }
      if (!SYSTEM_SCOPE_TABLES.some((s) => s.table === t)) {
        policySetDrift.push(`${t}: system_scope tablosu SYSTEM_SCOPE_TABLES listesinde yok — okuma/yazma probu ölçmüyor`);
      }
    }

    // Supabase's Data API roles (TASK-MUOG51GJ3PUOG R-S2, crw2-fb Ö-2): none of
    // the schema owner's functions in public may be callable by them, or
    // /rest/v1/rpc reaches them anonymously. The roles exist only on Supabase;
    // elsewhere the query returns nothing. Extension members (pgvector when the
    // owner installed it) are skipped, as in revoke-api-role-function-execute.sql
    // step 2: db:rls does not touch them, so flagging them would be a red the
    // repair cannot clear (crw2-fb golive review Ö-A).
    const apiCallable = await client.query<{ fn: string; role: string }>(
      `select p.oid::regprocedure::text as fn, r.rolname as role
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
        where n.nspname = 'public'
          and p.proowner = (select c.relowner from pg_class c where c.oid = to_regclass('public."Tenant"'))
          and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
          and not exists (select 1 from pg_depend d
                           where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
        order by 1, 2`
    );
    const apiExposed = apiCallable.rows.map((r) => `${r.fn} → ${r.role}`);

    // RLS on with ZERO policies is deny-all for every non-owner role, fabrika_app
    // included: it reads 0 rows and every INSERT fails "new row violates
    // row-level security policy" (TASK-MUWDA86A7U4LK). Supabase's ensure_rls
    // event trigger produces exactly that on every new table in public, and
    // BlogPost sat in it on live (TASK-MUTP1R1C13GE3). No exception: no table is
    // meant to be unreachable. The behavioural probe below cannot see it — it
    // reads only populated tenant tables — so it is asked of the catalogue.
    const denyAll = await client.query<{ relname: string; tenant: boolean }>(
      `select c.relname,
              exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'tenantId'
                         and a.attnum > 0 and not a.attisdropped) as tenant
         from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and c.relrowsecurity
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
        order by 1`
    );
    const denyAllFixes = denyAll.rows.map((r) =>
      r.tenant
        ? `${r.relname} (kiracı tablosu → pnpm db:rls)`
        : `${r.relname} (politikasız SYSTEM_WIDE → ALTER TABLE "${r.relname}" DISABLE ROW LEVEL SECURITY; migration'a ve prisma/rls.sql DISABLE döngüsüne ekle)`
    );

    // The other side of that DISABLE: a table with RLS off is guarded only by
    // GRANTs. Supabase's Data API roles must hold none on it, or /rest/v1 serves
    // it anonymously — the very thing ensure_rls exists to prevent. On live they
    // hold none today (TASK-MUWDA86A7U4LK Phase 3); the roles exist only on
    // Supabase, elsewhere this returns nothing.
    const apiTables = await client.query<{ relname: string; role: string }>(
      `select c.relname, r.rolname as role
         from pg_class c
         cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and not c.relrowsecurity
          and has_table_privilege(r.rolname, c.oid, 'SELECT, INSERT, UPDATE, DELETE')
        order by 1, 2`
    );
    const apiOpenTables = apiTables.rows.map((r) => `${r.relname} → ${r.role}`);

    console.log(`Kiracıya özel model: ${models.length} · RLS açık tablo: ${rlsOn.size} · tenant_isolation politikası: ${hasPolicy.size}`);
    console.log(`RLS açık + 0 politika (deny-all): ${denyAll.rows.length} · RLS kapalı + anon/authenticated erişimi: ${apiOpenTables.length}`);
    console.log(
      `system_scope tablosu: ${systemScopeTables.length} (${systemScopeTables.join(', ')}) · politika kümesi {system_scope} olmayan: ${policySetDrift.length}`
    );

    if (missingTable.length > 0) {
      console.log(`\nℹ  Şemada olup veritabanında olmayan tablo (migration bekliyor): ${missingTable.join(', ')}`);
    }

    if (missingRls.length > 0 || missingPolicy.length > 0 || missingForce.length > 0 || unsealed.length > 0 || apiExposed.length > 0) {
      console.error('\n❌ KİRACI İZOLASYONU EKSİK — bu bir ortam gürültüsü değil, güvenlik durumu.');
      if (missingRls.length > 0) console.error(`   RLS kapalı: ${missingRls.join(', ')}`);
      if (missingForce.length > 0) console.error(`   FORCE ROW LEVEL SECURITY yok (tablo sahibi politikaları atlıyor): ${missingForce.join(', ')}`);
      if (missingPolicy.length > 0) console.error(`   tenant_isolation politikası yok: ${missingPolicy.join(', ')}`);
      if (unsealed.length > 0) {
        console.error(
          `   system_scope politikası mühürsüz (yalnız app.system_scope GUC'una bakıyor, fabrika_app kendisi açabilir): ${unsealed.join(', ')}`
        );
      }
      if (apiExposed.length > 0) {
        console.error(`   Supabase API rolleri şema sahibinin fonksiyonlarını çağırabiliyor (/rest/v1/rpc): ${apiExposed.join(', ')}`);
      }
      console.error('\n   Onarım: pnpm db:rls   (gerekirse önce pnpm db:rls-role)');
      process.exit(1);
    }

    if (denyAll.rows.length > 0 || apiOpenTables.length > 0) {
      console.error('\n❌ ERİŞİLEMEZ YA DA AÇIK TABLO — bu bir ortam gürültüsü değil.');
      if (denyAll.rows.length > 0) {
        console.error(
          `   RLS açık ama hiç politika yok (fabrika_app 0 satır görür, her INSERT reddedilir; Supabase ensure_rls): ${denyAllFixes.join(', ')}`
        );
      }
      if (apiOpenTables.length > 0) {
        console.error(`   RLS kapalı ve Supabase API rolleri tabloya erişebiliyor (/rest/v1): ${apiOpenTables.join(', ')} → REVOKE ALL ON "<T>" FROM anon, authenticated`);
      }
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

    const needsTruth = SYSTEM_SCOPE_TABLES.some((s) => existing.has(s.table)) || existing.has(EXPERT_TABLE);
    truth = needsTruth ? await acquireTruth(client, adminCaps, dotenv) : null;
    if (needsTruth && !truth) {
      console.error('\n❌ SİSTEM KAPSAMI SATIR BEKLENTİSİ ÖLÇÜLEMEDİ — yeşil YAZILMIYOR.');
      console.error('   Toplam satır sayısı BYPASSRLS bir bağlantıdan (OWNER_DATABASE_URL) alınmalı; uygulama rolü 0 görür.');
      process.exit(1);
    }

    const populated = await populatedTables(client, models, existing);
    const { failures, checks } = await probeIsolation(
      measurer.client,
      populated,
      existing.has('AiUsageLog')
    );
    // The catalogue finding is reported with the behavioural ones, after the probes ran,
    // so one run shows both the drifted policy set and the read it leaks (NG-183).
    failures.push(...policySetDrift);
    const probeTenantId = truth && existing.has('Tenant')
      ? ((await truth.client.query<{ id: string }>('select id from "Tenant" order by id limit 1')).rows[0]?.id ?? null)
      : null;
    for (const spec of SYSTEM_SCOPE_TABLES) {
      if (!existing.has(spec.table)) continue;
      const rows = Number((await truth!.client.query<{ n: number }>(`select count(*)::int as n from ${quoteIdent(spec.table)}`)).rows[0]?.n ?? 0);
      const probe = await probeSystemScopeTable(measurer.client, spec, rlsOn.has(spec.table), rows, probeTenantId);
      failures.push(...probe.failures);
      checks.push(...probe.checks);
    }
    if (existing.has(EXPERT_TABLE)) {
      const purposes = await probePurposeTables(measurer.client, truth!.client === measurer.client ? null : truth!.client);
      failures.push(...purposes.failures);
      checks.push(...purposes.checks);
      const directory = await probeExpertDirectory(measurer.client, truth!.client === measurer.client ? null : truth!.client);
      failures.push(...directory.failures);
      checks.push(...directory.checks);
    }
    if ([...INTAKE_APPEND_ONLY].some((t) => existing.has(t))) {
      const appendOnly = await probeIntakeAppendOnly(measurer.client, existing);
      failures.push(...appendOnly.failures);
      checks.push(...appendOnly.checks);
    }
    if (existing.has('AuditEvent') || existing.has(EXPERT_TABLE)) {
      const seal = await probeSealBindsPurpose(measurer.client);
      failures.push(...seal.failures);
      checks.push(...seal.checks);
    }
    if (existing.has('ProvinceLeadRoute')) {
      const ownRoute = await probeOwnRouteClose(client, measurer.client);
      failures.push(...ownRoute.failures);
      checks.push(...ownRoute.checks);
    }

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
    await truth?.cleanup().catch(() => {});
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
