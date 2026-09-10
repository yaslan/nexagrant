import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

describe('C-2 — AuditEvent may have no tenant and must still be writable', () => {
  test('its tenantId is optional in schema.prisma', () => {
    const body = modelBodies().get('AuditEvent') as string;
    expect(/^\s*tenantId\s+String\?/m.test(body)).toBe(true);
  });

  test('it takes tenant_or_shared, never tenant_isolation', () => {
    // Under `tenant_isolation`, `NULL = current_setting(...)` evaluates to NULL,
    // so a tenant-less erasure audit row is neither readable nor writable.
    expect(policyTables('tenant_or_shared')).toContain('AuditEvent');
    expect(policyTables('tenant_isolation')).not.toContain('AuditEvent');
  });

  test('the shared loop drops the strict policy it used to carry', () => {
    // Permissive policies OR together: a leftover tenant_isolation on an
    // already-migrated database would outlive this fix.
    const block = rlsSql
      .split('DO $$')
      .find((b) => b.includes('CREATE POLICY tenant_or_shared ON %I')) as string;
    expect(block).toContain("DROP POLICY IF EXISTS tenant_isolation ON %I");
  });

  test('it keeps FORCE ROW LEVEL SECURITY after leaving the strict loop', () => {
    // The strict loop FORCEs; the shared loop does not. Without this line the
    // C-2 fix would silently exempt the table owner.
    expect(rlsSql).toMatch(/ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY/);
  });

  test('it is classified as nullable-tenant, not strict and not exempt', () => {
    expect(NULLABLE_TENANT.has('AuditEvent')).toBe(true);
    expect(SYSTEM_WIDE.has('AuditEvent')).toBe(false);
    expect(tenantScopedModels()).not.toContain('AuditEvent');
  });

  /**
   * Three writers produce a tenant-less AuditEvent row, and `tenant_isolation`
   * was dropping all three. The one in users-scheduled-deletion is the record
   * that an irreversible purge happened — docs/DATA_MODEL.md §1 requires it.
   * If a call ever moves, the policy above stops being justified by it, so the
   * pairing is asserted rather than left in a comment.
   */
  test.each([
    ['src/actions/user/request-deletion.ts', 'user.erasure.requested / .cancelled'],
    ['src/lib/inngest/jobs/users-scheduled-deletion.ts', 'user.erased'],
    ['src/actions/user/export-data.ts', 'user.data.exported'],
  ])('%s still writes an AuditEvent with no tenantId (%s)', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    // A create() whose data has no `tenantId` key: the row C-2 rescued.
    const writesWithoutTenant =
      /auditEvent\.create\(\{\s*data:\s*\{(?![^}]*tenantId)[^}]*\}/s.test(src) ||
      /\.\.\.\(tenantId \? \{ tenantId \} : \{\}\)/.test(src);
    expect(writesWithoutTenant).toBe(true);
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
