import { prisma } from '@/lib/db';
import { skipOrFailInCi } from './live-db-role';

/**
 * NG-180 — tests that need the database skip themselves when there is none, and say so.
 *
 * With no `DATABASE_URL`, `src/lib/db.ts` makes `prisma` a proxy that throws on the first
 * property access (FO-141: no silent fallback to a default Postgres). A test file that touched
 * `prisma` at module scope or in a hook then failed as a whole file, so a bare `npm test` on a
 * machine without a database was red on every branch. Here the probe is a try/catch, so a
 * missing or unreachable database is a `false`, not an exception.
 *
 * Locally the caller skips with a warning (see `skipOrFailInCi`). In CI — where the gate always
 * has a database — the same call throws, so a missing database can never turn into a green run
 * that measured nothing. The gate (`pnpm gate`) therefore still runs every one of these tests.
 */
export async function databaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Module-scope gate for a suite that needs the database. Use with `describe.skipIf(!hasDb)`
 * or `test.skipIf(!hasDb)`. `suite` names the file in the warning.
 */
export async function suiteHasDatabase(suite: string): Promise<boolean> {
  if (await databaseReachable()) return true;
  skipOrFailInCi(suite, 'no database answers (DATABASE_URL is not set, or Postgres is unreachable)');
  return false;
}
