/**
 * TASK-MTS9CEDCWKQQK — identify, measure and back up the two unregistered
 * `demo-tenant` opportunities before deleting them. Read-only: this script
 * never writes to the database. Run it before and after the delete.
 *
 * `prisma generate` does not run in this repo, so `$queryRaw` / `$queryRawUnsafe`
 * come back untyped; every result is given a row shape here rather than inferred,
 * the same reason src/lib/dashboard/fetch-metrics.ts declares `OppWithRelations`.
 */
import { writeFileSync } from 'node:fs';

import { prisma } from '../src/lib/db';

const IDS = ['cmtrmwgmy001493xkt7gyg4mm', 'cmtrmxtin0002d9xk0cif5ky6'];
const EXPECTED_TITLE = 'İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri';
const EXPECTED_TENANT = 'demo-tenant';
const EXPECTED_DAY = '2026-09-07';

type Row = Record<string, unknown>;

/** The two raw helpers, typed once so no call site has to cast. */
const rawSql = async <T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T[]> =>
  (await prisma.$queryRaw(query, ...values)) as T[];
const rawUnsafe = async <T>(sql: string, ...values: unknown[]): Promise<T[]> =>
  (await prisma.$queryRawUnsafe(sql, ...values)) as T[];

/** Every public column literally named `opportunityId` — the search is the schema's, not mine. */
const opportunityColumns = () =>
  rawSql<{ table: string }>`
    SELECT table_name AS "table"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'opportunityId'
    ORDER BY table_name`;

/** table → ON DELETE rule, so "cascade will handle it" is measured rather than assumed. */
async function fkDeleteRules(): Promise<Record<string, string>> {
  const rows = await rawSql<{ table: string; rule: string }>`
    SELECT tc.table_name AS "table", rc.delete_rule AS "rule"
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'opportunityId'`;
  return Object.fromEntries(rows.map((row) => [row.table, row.rule]));
}

async function main() {
  const backupPath = process.argv[2];

  const rows = await rawSql<Row>`SELECT * FROM "Opportunity" WHERE id = ANY(${IDS}::text[])`;

  console.log(`\n=== identity check (${rows.length} of ${IDS.length} rows found) ===`);
  let identityOk = rows.length === IDS.length;
  for (const id of IDS) {
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) {
      console.log(`  ${id}  MISSING`);
      identityOk = false;
      continue;
    }
    const tenantOk = row.tenantId === EXPECTED_TENANT;
    const titleOk = row.title === EXPECTED_TITLE;
    const created = new Date(row.createdAt as string);
    const dayOk = created.toISOString().slice(0, 10) === EXPECTED_DAY;
    if (!tenantOk || !titleOk || !dayOk) identityOk = false;
    console.log(
      `  ${id}\n    tenantId=${row.tenantId} ${tenantOk ? 'OK' : 'MISMATCH'}` +
        `\n    title=${JSON.stringify(row.title)} ${titleOk ? 'OK' : 'MISMATCH'}` +
        `\n    createdAt=${created.toISOString()} ${dayOk ? 'OK' : 'MISMATCH'}` +
        `\n    workspaceId=${row.workspaceId} stage=${row.stage} status=${row.status} deletedAt=${row.deletedAt}`,
    );
  }

  const rules = await fkDeleteRules();
  const columns = await opportunityColumns();
  const children: Record<string, Row[]> = {};
  console.log('\n=== dependent rows (every public column named "opportunityId") ===');
  for (const { table } of columns) {
    if (table === 'Opportunity') continue;
    const found = await rawUnsafe<Row>(
      `SELECT * FROM "${table}" WHERE "opportunityId" = ANY($1::text[])`,
      IDS,
    );
    children[table] = found;
    console.log(
      `  ${table.padEnd(20)} ${String(found.length).padStart(3)} row(s)   ` +
        `FK delete rule: ${rules[table] ?? 'NO FK — would orphan'}`,
    );
  }

  const totals = await rawSql<{ count: bigint }>`
    SELECT count(*) FROM "Opportunity" WHERE "tenantId" = ${EXPECTED_TENANT}`;
  const total = Number(totals[0]?.count ?? 0);
  console.log(`\n=== SELECT count(*) FROM "Opportunity" WHERE "tenantId"='demo-tenant' → ${total} ===`);

  const demoRows = await rawSql<{ id: string; title: string }>`
    SELECT id, title FROM "Opportunity" WHERE "tenantId" = ${EXPECTED_TENANT} ORDER BY "createdAt"`;
  console.log('--- all demo-tenant opportunities ---');
  for (const row of demoRows) console.log(`  ${row.id}  ${row.title}`);

  if (backupPath) {
    writeFileSync(
      backupPath,
      JSON.stringify(
        {
          task: 'TASK-MTS9CEDCWKQQK',
          takenAt: new Date().toISOString(),
          note:
            'Backup of the two unregistered demo-tenant opportunities and every row keyed to ' +
            'them, taken immediately before deletion. Restore = INSERT these back, parents first.',
          opportunities: rows,
          children,
          foreignKeyDeleteRules: rules,
          demoTenantOpportunityCountBefore: total,
        },
        (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
        2,
      ),
    );
    console.log(`\nbackup written → ${backupPath}`);
  }

  console.log(`\nIDENTITY: ${identityOk ? 'ALL MATCH' : 'MISMATCH — DO NOT DELETE'}`);
  await prisma.$disconnect();
  if (!identityOk) process.exit(2);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
