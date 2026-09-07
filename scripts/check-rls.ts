/**
 * Static RLS gate: does prisma/rls.sql *declare* a policy for every
 * tenant-scoped model in the schema?
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

checkRlsCoverage();
