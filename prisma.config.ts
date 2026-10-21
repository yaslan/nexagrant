import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';
import { toPrismaCliUrl } from './prisma/cli-url';
dotenv.config();

// TASK-MVBFDSUSE5QCY — prisma/migrations is not a Prisma Migrate history: the
// migrations sit on top of `prisma db push` and never create the base tables.
// Migrate sees only the six folder ones, and on an empty database add-m10 fails
// with `relation "FollowupDoc" does not exist` after add-calendar-connections
// has already been applied. Stop before anything runs and point at the real
// path. `migrate diff` and `migrate status` only read, so they stay.
// Every token after `migrate` counts, flags and their values included, so
// `--config prisma.config.ts migrate deploy` is refused too (crw2-fb O-2).
const args = process.argv.slice(2);
const at = args.indexOf('migrate');
const blocked = at >= 0 ? args.slice(at + 1).find((a) => a === 'deploy' || a === 'dev' || a === 'reset') : undefined;
if (blocked) {
  console.error(
    `prisma migrate ${blocked} is not how this repository builds a database: prisma/migrations ` +
      'is applied by scripts/apply-migrations.sh on top of `prisma db push`.\n' +
      '  Local / CI / worktree database: pnpm db:setup (scripts/db-setup.sh)\n' +
      '  Production: docs/RELEASE_CHECKLIST.md §3.1\n' +
      'Nothing was applied.',
  );
  process.exit(1);
}

export default defineConfig({
  
  datasource: {
    // Y-1 (R-S7): verify-full+sslrootcert → Prisma's own strict TLS spelling.
    // CLI only; node-pg keeps reading the unconverted DATABASE_URL.
    url: toPrismaCliUrl(process.env.DATABASE_URL)
  }
});
