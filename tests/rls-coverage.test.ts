import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  canonicalPolicyClauses,
  forwardMigrationFiles,
  scanMigrations,
  stripSqlComments,
} from '../scripts/rls-migrations';
import { NULLABLE_TENANT, SYSTEM_WIDE, tenantScopedModels } from '../scripts/rls-models';

/**
 * The RLS gates read two files and agree with each other; the risk is that both
 * agree about the wrong thing. `scripts/rls-models.ts` decides what "covered"
 * means, and a table listed in SYSTEM_WIDE is exempt from BOTH gates — so a
 * tenant-carrying table parked there is invisible to the whole apparatus and
 * the gate can never go red for it. That is what happened to
 * `ClaimEvidenceLink` and `EvidenceReminder` (TASK-MTU6HUB8FUHMG B-1).
 *
 * These are file-level assertions on purpose: they hold with no database, which
 * is exactly when the live gate cannot run and something has to still be true.
 */

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const rlsSql = readFileSync(resolve(process.cwd(), 'prisma/rls.sql'), 'utf8');

/** Every `model X { ... }` block in schema.prisma, by name. */
function modelBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    if (m[1] && m[2]) out.set(m[1], m[2]);
  }
  return out;
}

/** The table list of one `FOREACH t IN ARRAY ARRAY[...]` block, by policy name. */
function policyTables(policy: 'tenant_isolation' | 'tenant_or_shared'): string[] {
  const blocks = rlsSql.split('DO $$');
  const block = blocks.find((b) => b.includes(`CREATE POLICY ${policy} ON %I`));
  expect(block, `prisma/rls.sql has no loop creating ${policy}`).toBeDefined();
  const arr = /FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]\s*LOOP/.exec(block as string);
  expect(arr?.[1], `could not read the table array for ${policy}`).toBeDefined();
  return [...(arr?.[1] ?? '').matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1] as string);
}

describe('RLS model classification (scripts/rls-models.ts)', () => {
  test('no SYSTEM_WIDE table carries a tenantId', () => {
    const offenders = [...modelBodies()]
      .filter(([name, body]) => SYSTEM_WIDE.has(name) && /^\s*tenantId\s+String/m.test(body))
      .map(([name]) => name);

    // A table is SYSTEM_WIDE because it has no tenant — never because listing
    // it there makes the gate quiet.
    expect(offenders).toEqual([]);
  });

  test('every NULLABLE_TENANT table really has an optional tenantId', () => {
    for (const name of NULLABLE_TENANT) {
      const body = modelBodies().get(name);
      expect(body, `${name} is in NULLABLE_TENANT but not in schema.prisma`).toBeDefined();
      expect(
        /^\s*tenantId\s+String\?/m.test(body as string),
        `${name} is in NULLABLE_TENANT but its tenantId is not optional`
      ).toBe(true);
    }
  });

  test('the two sets never claim the same table', () => {
    const both = [...NULLABLE_TENANT].filter((n) => SYSTEM_WIDE.has(n));
    expect(both).toEqual([]);
  });

  test('every strict model is declared in prisma/rls.sql', () => {
    const declared = new Set(policyTables('tenant_isolation'));
    const missing = tenantScopedModels().filter((m) => !declared.has(m));
    expect(missing).toEqual([]);
  });
});

describe('B-1 — ClaimEvidenceLink and EvidenceReminder are tenant data', () => {
  const tables = ['ClaimEvidenceLink', 'EvidenceReminder'] as const;

  test.each(tables)('%s has a required tenantId in schema.prisma', (name) => {
    const body = modelBodies().get(name);
    expect(body).toBeDefined();
    // `String` with no `?`: these rows always belong to someone.
    expect(/^\s*tenantId\s+String(?!\?)/m.test(body as string)).toBe(true);
  });

  test.each(tables)('%s is no longer exempt from the gates', (name) => {
    expect(SYSTEM_WIDE.has(name)).toBe(false);
    expect(NULLABLE_TENANT.has(name)).toBe(false);
    expect(tenantScopedModels()).toContain(name);
  });

  test.each(tables)('%s is under strict tenant_isolation in prisma/rls.sql', (name) => {
    expect(policyTables('tenant_isolation')).toContain(name);
    expect(policyTables('tenant_or_shared')).not.toContain(name);
  });

  test('EvidenceReminder carries personal data, so it is indexed by tenant', () => {
    const body = modelBodies().get('EvidenceReminder') as string;
    // recipientEmails is why this table is not a harmless scheduling row.
    expect(/recipientEmails\s+String\[\]/.test(body)).toBe(true);
    expect(/@@index\(\[tenantId\]\)/.test(body)).toBe(true);
  });
});

describe('AuditEvent — a tenant-less row belongs to no tenant (TASK-MULUJ8O4JH1PF)', () => {
  test('its tenantId is optional in schema.prisma', () => {
    const body = modelBodies().get('AuditEvent') as string;
    expect(/^\s*tenantId\s+String\?/m.test(body)).toBe(true);
  });

  test('it takes strict tenant_isolation, never tenant_or_shared', () => {
    // Under tenant_or_shared (C-2), `"tenantId" IS NULL` opened every
    // tenant-less row — plan admin events, KVKK/GDPR erasure records — to every
    // tenant, and let any tenant insert one. The rows now live behind
    // system_scope, which rls.sql derives for every tenant_isolation table.
    expect(policyTables('tenant_isolation')).toContain('AuditEvent');
    expect(policyTables('tenant_or_shared')).not.toContain('AuditEvent');
  });

  test('rls.sql drops the C-2 policy on already-migrated databases', () => {
    // Permissive policies OR together: a leftover tenant_or_shared would keep
    // the leak open next to the strict policy.
    expect(rlsSql).toMatch(/DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";/);
  });

  test('its migration drops tenant_or_shared and restates both remaining policies', () => {
    const sql = stripSqlComments(
      readFileSync(resolve(process.cwd(), 'prisma/migrations/auditevent-null-system-only.sql'), 'utf8')
    );
    expect(sql).toMatch(/DROP POLICY IF EXISTS tenant_or_shared ON "AuditEvent";/);
    expect(sql).toMatch(/ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;/);
    const canon = canonicalPolicyClauses();
    const norm = sql.replace(/\s+/g, ' ');
    expect(norm).toContain(`CREATE POLICY tenant_isolation ON "AuditEvent" USING (${canon.using}) WITH CHECK (${canon.check});`);
    expect(norm).toMatch(/CREATE POLICY system_scope ON "AuditEvent"/);
  });

  test('its system_scope is never the bare, forgeable GUC test (TASK-MUOGMQK3JAH4Y)', () => {
    // The file runs again on every scripts/apply-migrations.sh. With the bare
    // `app.system_scope = 'on'` predicate it reopened AuditEvent to any role
    // that sets the GUC — fabrika_app included — after each run.
    const sql = stripSqlComments(
      readFileSync(resolve(process.cwd(), 'prisma/migrations/auditevent-null-system-only.sql'), 'utf8')
    ).replace(/\s+/g, ' ');
    expect(sql).toContain(`USING ((SELECT public.system_scope_open('"AuditEvent"'::regclass)))`);
    expect(sql).toContain(`WITH CHECK ((SELECT public.system_scope_open('"AuditEvent"'::regclass)))`);
    expect(sql).not.toMatch(/USING \(current_setting\('app\.system_scope', true\) = 'on'\)/);
    expect(sql).not.toMatch(/WITH CHECK \(current_setting\('app\.system_scope', true\) = 'on'\)/);
  });

  test('Y-1(a): no migration file, .down.sql included, creates a policy on the bare system_scope flag (TASK-MUPCYOCLINGC7)', () => {
    // crw2-fb B-1: drop-marketplace.down.sql recreated system_scope as
    // `current_setting('app.system_scope', true) = 'on'` and the test above
    // only looks at one file. That GUC is USERSET, so fabrika_app could set it
    // and read/write every tenant's rows. A policy that mentions the flag must
    // also gate it: rls.sql's system_scope_open(), or — on a database where
    // rls.sql has not run yet — the owner-only pg_has_role(current_user, …).
    // `ON (\S+)` on purpose: policies built in DO blocks say `ON %I`.
    const root = resolve(process.cwd(), 'prisma/migrations');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir).sort()) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.sql')) files.push(full);
      }
    };
    walk(root);
    expect(files.some((f) => f.endsWith('.down.sql'))).toBe(true);

    const offenders: string[] = [];
    for (const file of files) {
      const sql = stripSqlComments(readFileSync(file, 'utf8'));
      for (const m of sql.matchAll(/CREATE\s+POLICY\s+(\S+)\s+ON\s+(\S+)([\s\S]*?);/gi)) {
        const body = m[3] ?? '';
        if (!/app\.system_scope'/.test(body)) continue;
        if (/system_scope_open\(/.test(body) || /pg_has_role\(\s*current_user\b/.test(body)) continue;
        offenders.push(`${relative(root, file)}: ${m[1]} ON ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('it is classified strict, not nullable-shared and not exempt', () => {
    expect(NULLABLE_TENANT.has('AuditEvent')).toBe(false);
    expect(SYSTEM_WIDE.has('AuditEvent')).toBe(false);
    expect(tenantScopedModels()).toContain('AuditEvent');
  });

  /**
   * Three writers still produce a tenant-less AuditEvent row — the erasure
   * request, the erasure itself (docs/DATA_MODEL.md §1) and the data export —
   * and strict isolation refuses that row outside system scope. The audit trail
   * must not be lost, so each tenant-less write is asserted to sit inside
   * withSystemScope rather than on the bare client.
   */
  test.each([
    ['src/actions/user/request-deletion.ts', 'request-deletion.erasureAudit'],
    ['src/lib/jobs/tasks/users-scheduled-deletion.ts', 'erasure-sweep.erasureAudit'],
    ['src/actions/user/export-data.ts', 'gdpr-export.accessAudit'],
  ])('%s writes its tenant-less AuditEvent in system scope (%s)', (file, context) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/\bprisma\.auditEvent\./);
    const call = new RegExp(
      `withSystemScope\\(\\s*'subject-scoped',\\s*'${context.replace(/\./g, '\\.')}',[\\s\\S]{0,120}?tx\\.auditEvent\\.create\\(`
    );
    expect(call.test(src)).toBe(true);
  });

  test('the platform audit page reads through system scope', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/app/[locale]/admin/audit/page.tsx'), 'utf8');
    expect(src).not.toMatch(/\bprisma\.auditEvent\./);
    expect(src).toMatch(/withSystemScope\('platform-admin', 'admin-audit\.list'/);
  });
});

/**
 * CHECK 4b — a migration protects the table it creates (TASK-MTVDSSJTZCY4T).
 *
 * The red/green gate lives in `scripts/check-rls.ts` so `pnpm rls:check` is the
 * command that fails; these tests guard the scanner it calls. A checker that
 * silently stops seeing things is worse than no checker, so the mutation probe
 * that proved it bites is kept here as a test rather than left in a report:
 * a synthetic migration creating an unprotected tenant table must be found.
 */
describe('4b — every migration protects the tenant table it creates', () => {
  test('no forward migration creates a tenant table it leaves unprotected', () => {
    const { findings } = scanMigrations();
    expect(findings.map((f) => `${f.file}:${f.line} ${f.problem}`)).toEqual([]);
  });

  test('the scan actually sees tables — including the three it once missed', () => {
    // A green check that inspects nothing is not a green check.
    const names = scanMigrations().tables.map((t) => t.table);
    expect(names).toContain('Feedback'); // convention A from the start
    expect(names).toContain('Invoice');
    expect(names).toContain('TenantBillingIdentity');
    expect(names).toContain('MeetingBrief'); // the folder-shaped one
    expect(names.length).toBeGreaterThanOrEqual(12);
  });

  test('probe B — a table whose policy is in its own migration is no violation', () => {
    const { tables, findings } = scanMigrations();
    const feedback = tables.find((t) => t.table === 'Feedback');
    expect(feedback?.file).toBe('prisma/migrations/add-feedback.sql');
    expect(findings.filter((f) => f.table === 'Feedback')).toEqual([]);
  });

  test('both migration shapes are read, and no down migration is', () => {
    const files = forwardMigrationFiles();
    expect(files).toContain('prisma/migrations/add-feedback.sql');
    expect(files).toContain('prisma/migrations/add-m9-meeting-schedule/migration.sql');
    expect(files.some((f) => f.endsWith('.down.sql') || f.endsWith('/down.sql'))).toBe(false);
  });

  test('a commented-out CREATE TABLE is not counted as a table', () => {
    // add-lifetime-licence.sql:11 describes its idempotency with the words
    // "CREATE TABLE / INDEX IF NOT EXISTS" inside a comment; a plain grep reads
    // that file as creating two tables.
    const raw = readFileSync(resolve(process.cwd(), 'prisma/migrations/add-lifetime-licence.sql'), 'utf8');
    expect(raw.match(/CREATE TABLE/g)?.length).toBe(2);
    expect(stripSqlComments(raw).match(/CREATE TABLE/g)?.length).toBe(1);
  });

  test('the canonical wording is read from prisma/rls.sql, not copied', () => {
    const canon = canonicalPolicyClauses();
    expect(canon.using).toBe(`"tenantId" = current_setting('app.tenant_id', true)`);
    expect(canon.check).toBe(canon.using);
    expect(rlsSql).toContain(`USING (${canon.using})`);
  });

  test('mutation probe — an unprotected tenant table in a fake migration is caught', () => {
    const root = mkdtempSync(join(tmpdir(), 'rls-4b-'));
    mkdirSync(join(root, 'prisma', 'migrations'), { recursive: true });
    writeFileSync(join(root, 'prisma', 'rls.sql'), rlsSql);
    writeFileSync(
      join(root, 'prisma', 'migrations', 'add-probe.sql'),
      `CREATE TABLE "ProbeSecret" (\n  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL\n);\n`
    );

    const { findings } = scanMigrations(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.table).toBe('ProbeSecret');
    expect(findings[0]?.problem).toContain('no policy in the same file');

    // …and the same file with the policy stated is clean.
    writeFileSync(
      join(root, 'prisma', 'migrations', 'add-probe.sql'),
      `CREATE TABLE "ProbeSecret" (\n  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL\n);\n` +
        `ALTER TABLE "ProbeSecret" ENABLE ROW LEVEL SECURITY;\n` +
        `ALTER TABLE "ProbeSecret" FORCE ROW LEVEL SECURITY;\n` +
        `CREATE POLICY tenant_isolation ON "ProbeSecret"\n` +
        `  USING ("tenantId" = current_setting('app.tenant_id', true))\n` +
        `  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));\n`
    );
    expect(scanMigrations(root).findings).toEqual([]);

    rmSync(root, { recursive: true, force: true });
  });
});
