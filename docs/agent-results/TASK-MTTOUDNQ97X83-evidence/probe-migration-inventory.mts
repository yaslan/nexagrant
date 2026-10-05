/**
 * QA probe — TASK-MTTOUDNQ97X83, F-1 (release checklist half).
 *
 * Counts the .sql files in prisma/migrations that no command in this repo
 * applies, and asks the local database which migrations Prisma believes it has
 * run. Read-only: it writes nothing and changes no schema.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../../../src/lib/db';

const ROOT = 'prisma/migrations';

function inventory(): { bare: string[]; foldered: string[] } {
  const bare: string[] = [];
  const foldered: string[] = [];
  for (const entry of readdirSync(ROOT).sort()) {
    const full = join(ROOT, entry);
    if (statSync(full).isDirectory()) {
      if (readdirSync(full).includes('migration.sql')) foldered.push(`${entry}/migration.sql`);
      continue;
    }
    if (entry.endsWith('.sql') && !entry.endsWith('.down.sql')) bare.push(entry);
  }
  return { bare, foldered };
}

async function main() {
  const { bare, foldered } = inventory();
  console.log(`forward .sql files, bare:     ${bare.length}`);
  bare.forEach((f) => console.log(`  ${f}`));
  console.log(`forward .sql files, foldered: ${foldered.length}`);
  foldered.forEach((f) => console.log(`  ${f}`));
  console.log(`TOTAL forward migrations in the tree: ${bare.length + foldered.length}`);

  const lock = readdirSync(ROOT).includes('migration_lock.toml');
  console.log(`prisma/migrations/migration_lock.toml present: ${lock}`);

  const [reg] = (await prisma.$queryRawUnsafe(
    `select to_regclass('public._prisma_migrations')::text as t`
  )) as Array<{ t: string | null }>;
  console.log(`_prisma_migrations table in this database: ${reg?.t ?? 'ABSENT'}`);
  if (reg?.t) {
    const rows = (await prisma.$queryRawUnsafe(
      `select migration_name from _prisma_migrations order by started_at`
    )) as Array<{ migration_name: string }>;
    console.log(`rows Prisma has recorded as applied: ${rows.length}`);
    rows.forEach((r) => console.log(`  ${r.migration_name}`));
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
