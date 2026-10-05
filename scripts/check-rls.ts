/**
 * Static RLS gate. Two questions, both answered from files:
 *
 *   CHECK 4  — does prisma/rls.sql *declare* a policy for every tenant-scoped
 *              model in the schema?
 *   CHECK 4b — does each migration protect the table it creates, in the same
 *              file (scripts/rls-migrations.ts)?
 *
 * This check reads two files and never touches the database, so it stays green
 * even when the database has no policies at all — on 2026-09-07 it reported
 * SUCCESS while postgres held 1 of 38 policies. The live counterpart is
 * scripts/check-rls-live.ts (`pnpm rls:verify`); both are in `pnpm gate`.
 *
 *   pnpm rls:check
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanMigrations } from './rls-migrations';
import { tenantScopedModels } from './rls-models';

function checkRlsCoverage() {
  const rlsSql = readFileSync(resolve(process.cwd(), 'prisma/rls.sql'), 'utf8');
  const models = tenantScopedModels();

  console.log(`Found ${models.length} tenant-scoped models requiring RLS policies:`);
  console.log(models.join(', '));

  const missing = models.filter((model) => !rlsSql.includes(`'${model}'`));

  if (missing.length > 0) {
    console.error(`\n❌ ERROR: The following tenant-scoped models are missing from prisma/rls.sql:`);
    console.error(missing.join(', '));
    console.error(`\nAdd these to the FOREACH array in prisma/rls.sql (line ~7)`);
    console.error(`Declaring a policy is not the same as having one: run \`pnpm rls:verify\` too.`);
    process.exit(1);
  }

  console.log(`\n✅ SUCCESS: All ${models.length} tenant-scoped models have RLS policies registered.`);
  console.log(`   (Declared, not measured — \`pnpm rls:verify\` asks the database.)`);
}

/**
 * CHECK 4b: a migration that creates a tenant table protects it in the same file.
 *
 * CHECK 4 above is satisfied by a line in prisma/rls.sql, and rls.sql is applied
 * by `pnpm db:rls` — a step that comes *after* the migrations and, for the flat
 * files, after a human has applied them one by one (docs/RELEASE_CHECKLIST.md
 * §1). In between, a table created without a policy holds one tenant's rows
 * with row level security not even enabled. Three migrations were in that state
 * and both file gates were green (TASK-MTVDSSJTZCY4T).
 */
function checkMigrationCoverage() {
  const { tables, findings } = scanMigrations();

  console.log(`\nCHECK 4b — ${tables.length} tenant-scoped tables are created by migrations.`);

  if (findings.length > 0) {
    console.error(`\n❌ ERROR: a migration creates a tenant-scoped table it does not protect:`);
    for (const f of findings) console.error(`  ${f.file}:${f.line} — ${f.problem}`);
    console.error(
      `\nState the policy in the migration itself, byte-identical to prisma/rls.sql:19-21:\n` +
        `  ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;\n` +
        `  ALTER TABLE "<T>" FORCE ROW LEVEL SECURITY;\n` +
        `  DROP POLICY IF EXISTS tenant_isolation ON "<T>";\n` +
        `  CREATE POLICY tenant_isolation ON "<T>"\n` +
        `    USING ("tenantId" = current_setting('app.tenant_id', true))\n` +
        `    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));\n` +
        `prisma/rls.sql stays the source of truth and re-creates it; the migration\n` +
        `only closes the window before \`pnpm db:rls\` runs. See docs/DATA_MODEL.md §16.`
    );
    process.exit(1);
  }

  console.log(`✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.`);
}

checkRlsCoverage();
checkMigrationCoverage();
