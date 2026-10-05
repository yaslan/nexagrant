/**
 * CHECK 4b — does each migration protect the table it creates?
 *
 * The two file-level RLS gates both read `prisma/rls.sql` and ask whether a
 * policy is *declared* there (scripts/check-rls.ts, tests/rls-coverage.test.ts);
 * the live gate (scripts/check-rls-live.ts) asks the database, which by then has
 * had `pnpm db:rls` run against it. None of them reads a migration, so a
 * migration that creates a tenant table and leaves the policy to rls.sql was
 * invisible to the whole apparatus — three of them were (TASK-MTVDSSJTZCY4T).
 *
 * The window that opens is not hypothetical: docs/RELEASE_CHECKLIST.md §1 says
 * the flat `prisma/migrations/*.sql` files are applied **by hand, one at a
 * time**, before the code ships, and `pnpm db:rls` is a separate step. Between
 * the two, such a table exists holding one tenant's rows with no policy and
 * without even `ENABLE ROW LEVEL SECURITY` — every tenant connection reads all
 * of it.
 *
 * So the rule this module enforces is the convention the repo already follows in
 * six of its nine migrations: a migration that creates a tenant-scoped table
 * ENABLEs, FORCEs and CREATEs the policy for it *in the same file*, in the exact
 * wording of prisma/rls.sql. rls.sql stays the source of truth and re-creates
 * everything idempotently; the migration only closes the gap before it runs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { NULLABLE_TENANT, SYSTEM_WIDE } from './rls-models';

export interface CreatedTable {
  /** Repo-relative path of the migration that creates it. */
  file: string;
  table: string;
  /** 1-indexed line of the CREATE TABLE, for a message a human can act on. */
  line: number;
  /** Its `tenantId` column is NOT NULL: strict `tenant_isolation` applies. */
  strict: boolean;
}

export interface MigrationFinding {
  file: string;
  table: string;
  line: number;
  problem: string;
}

const MIGRATIONS_DIR = 'prisma/migrations';

/**
 * Forward migrations only, in both shapes the repo uses: a flat
 * `add-thing.sql` and a folder's `add-thing/migration.sql`. The third finding of
 * TASK-MTVDSSJTZCY4T was in the folder shape, which a scan of `*.sql` at the top
 * level alone would have missed.
 */
export function forwardMigrationFiles(root = process.cwd()): string[] {
  const dir = resolve(root, MIGRATIONS_DIR);
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const inner of readdirSync(full).sort()) {
        if (inner.endsWith('.sql') && inner !== 'down.sql' && !inner.endsWith('.down.sql')) {
          out.push(relative(root, join(full, inner)));
        }
      }
      continue;
    }
    if (entry.endsWith('.sql') && !entry.endsWith('.down.sql')) out.push(relative(root, full));
  }
  return out;
}

/**
 * Blank out `--` and block comments, leaving every other byte (and every
 * newline) where it was so line numbers stay true.
 *
 * Needed, not tidy: `add-lifetime-licence.sql:11` explains its idempotency with
 * the words "CREATE TABLE / INDEX IF NOT EXISTS" inside a comment, and a plain
 * grep counts that as a second table. String and dollar-quoted bodies are
 * respected so an `--` inside SQL text is never mistaken for a comment.
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    const dollar = /^\$[A-Za-z0-9_]*\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (rest.startsWith('--')) {
      const nl = sql.indexOf('\n', i);
      const stop = nl === -1 ? sql.length : nl;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql
        .slice(i, stop)
        .replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The canonical policy body, read out of prisma/rls.sql rather than copied here,
 * so the gate re-baselines itself if the source of truth ever changes and the
 * two can never drift. Deviation in the wording is the failure this card is
 * about, so it is measured, not trusted.
 */
export function canonicalPolicyClauses(root = process.cwd()): { using: string; check: string } {
  const sql = readFileSync(resolve(root, 'prisma/rls.sql'), 'utf8');
  const block = /CREATE POLICY tenant_isolation ON %I([\s\S]*?)\$p\$/.exec(sql);
  if (!block?.[1]) throw new Error('prisma/rls.sql: could not read the tenant_isolation policy body');
  const using = /USING\s*\(([\s\S]*?)\)\s*WITH CHECK/.exec(block[1]);
  const check = /WITH CHECK\s*\(([\s\S]*)/.exec(block[1]);
  if (!using?.[1] || !check?.[1]) throw new Error('prisma/rls.sql: tenant_isolation body has no USING / WITH CHECK');
  return { using: norm(using[1]), check: norm(check[1].trim().replace(/\)\s*$/, '')) };
}

/** `CREATE TABLE [IF NOT EXISTS] "T" ( … )` — name, line, and column list. */
function createdTables(sql: string): { table: string; line: number; body: string }[] {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?\s*\(/g;
  const out: { table: string; line: number; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1] as string;
    const line = sql.slice(0, m.index).split('\n').length;
    let depth = 1;
    let i = re.lastIndex;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth += 1;
      else if (sql[i] === ')') depth -= 1;
      i += 1;
    }
    out.push({ table, line, body: sql.slice(re.lastIndex, i - 1) });
  }
  return out;
}

/** Statements a `FOREACH t IN ARRAY ARRAY[…] LOOP … END LOOP` applies, per table. */
function loopBlocks(sql: string): { tables: string[]; body: string }[] {
  const re = /FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]\s*LOOP([\s\S]*?)END\s+LOOP/g;
  const out: { tables: string[]; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const tables = [...(m[1] ?? '').matchAll(/'([A-Za-z0-9_]+)'/g)].map((t) => t[1] as string);
    out.push({ tables, body: m[2] ?? '' });
  }
  return out;
}

interface Protection {
  enabled: boolean;
  forced: boolean;
  policy: string | null;
}

/** What one migration file does to table `t`, counting both direct and loop form. */
function protectionFor(sql: string, t: string): Protection {
  const q = `["']?${t}["']?`;
  const enabled = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${q}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(sql);
  const forced = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${q}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(sql);
  const direct = new RegExp(`CREATE\\s+POLICY\\s+([A-Za-z0-9_]+)\\s+ON\\s+${q}([\\s\\S]*?);`, 'i').exec(sql);

  let loopEnabled = false;
  let loopForced = false;
  let loopPolicy: string | null = null;
  for (const block of loopBlocks(sql)) {
    if (!block.tables.includes(t)) continue;
    if (/ALTER\s+TABLE\s+%I\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(block.body)) loopEnabled = true;
    if (/ALTER\s+TABLE\s+%I\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(block.body)) loopForced = true;
    const p = /CREATE\s+POLICY\s+[A-Za-z0-9_]+\s+ON\s+%I([\s\S]*?)\$p\$/i.exec(block.body);
    if (p?.[1]) loopPolicy = p[1];
  }

  return {
    enabled: enabled || loopEnabled,
    forced: forced || loopForced,
    policy: direct?.[2] ?? loopPolicy,
  };
}

/**
 * Every table a forward migration creates that carries a `tenantId`, with what
 * the same file does to protect it.
 *
 * A table is judged tenant-scoped from the migration itself — the column it
 * declares — not from schema.prisma, so a table is caught on the day its
 * migration is written, before any model exists to classify. `SYSTEM_WIDE` and
 * `NULLABLE_TENANT` (scripts/rls-models.ts) still decide the exceptions, so the
 * three files never disagree about what "covered" means.
 */
export function scanMigrations(root = process.cwd()): {
  tables: CreatedTable[];
  findings: MigrationFinding[];
} {
  const canon = canonicalPolicyClauses(root);
  const tables: CreatedTable[] = [];
  const findings: MigrationFinding[] = [];

  for (const file of forwardMigrationFiles(root)) {
    const sql = stripSqlComments(readFileSync(resolve(root, file), 'utf8'));
    for (const { table, line, body } of createdTables(sql)) {
      if (SYSTEM_WIDE.has(table)) continue;
      // Anywhere in the column list, not only at the start of a line: a
      // migration whose columns are written on one line must not escape the
      // check (measured — an early version of this scanner let exactly that
      // through, and the mutation probe is what caught it).
      const col = /(?:^|,)\s*"?tenantId"?\s+([A-Za-z0-9_]+)([^,]*)/.exec(body);
      if (!col) continue;
      const strict = /NOT\s+NULL/i.test(col[2] ?? '') && !NULLABLE_TENANT.has(table);
      tables.push({ file, table, line, strict });

      const p = protectionFor(sql, table);
      if (!p.policy) {
        findings.push({ file, table, line, problem: `creates tenant table "${table}" and no policy in the same file` });
        continue;
      }
      if (!p.enabled) {
        findings.push({ file, table, line, problem: `"${table}" has a policy but no ENABLE ROW LEVEL SECURITY (a policy on a table without RLS enabled is never applied)` });
      }
      if (strict && !p.forced) {
        findings.push({ file, table, line, problem: `"${table}" is not FORCEd, so the table owner bypasses its own policy` });
      }
      if (strict) {
        const text = norm(p.policy);
        if (!text.includes(`USING (${canon.using})`) || !text.includes(`WITH CHECK (${canon.check})`)) {
          findings.push({ file, table, line, problem: `"${table}" policy wording differs from prisma/rls.sql — expected USING (${canon.using}) and WITH CHECK (${canon.check})` });
        }
      }
    }
  }
  return { tables, findings };
}
