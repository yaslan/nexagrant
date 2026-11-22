/**
 * NG-316 — pure guards for scripts/seed-st6-empty-e2e.ts (no Prisma import, so the unit
 * test runs without a database).
 *
 *  - assertThrowawayDatabase: the seed may write (and delete CORDIS rows) only on a
 *    throwaway database. The rule is the one tests/jobs-enqueue-force.live.test.ts uses
 *    (isThrowawayDbName): fabrika_gate, fabrika_test, fabrika_test_ng<n>, and plain
 *    `fabrika` only on a GitHub Actions runner.
 *  - chunkRows / rowsPerChunk: the restore inserts in slices, never one createMany of
 *    1,1 M rows (NG-313 N0: that path failed and left CordisCoParticipation at 0).
 *  - countMismatches: the restore is only accepted when every table's row count matches
 *    the backup; otherwise the backup file is kept.
 */
import { isThrowawayDbName } from '../tests/helpers/live-db-role';

/** Upper bound on rows in one createMany slice. */
export const RESTORE_MAX_ROWS = 10_000;

/**
 * Upper bound on bind parameters in one createMany (rows x columns). Postgres caps a
 * statement at 65 535 parameters; Prisma batches far below that, so 30 000 keeps headroom.
 */
export const RESTORE_MAX_PARAMS = 30_000;

/** Database name from a connection URL (`postgresql://u:p@h:port/<name>?...`), or undefined. */
export function databaseNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    return name === '' ? undefined : name;
  } catch {
    return undefined;
  }
}

/** Throws unless `name` is a throwaway database (see the header). */
export function assertThrowawayDatabase(
  name: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (name === undefined) {
    throw new Error('[seed-st6-empty-e2e] refusing: no database name in DATABASE_URL');
  }
  if (!isThrowawayDbName(name, env)) {
    throw new Error(
      `[seed-st6-empty-e2e] refusing to write on database "${name}": it is not a test or isolated-gate database ` +
        '(the shared dev database is "fabrika"). Point DATABASE_URL at `fabrika_gate` (pnpm gate:isolated) ' +
        'or `fabrika_test` / `fabrika_test_ng<number>`.',
    );
  }
}

/** Rows per createMany slice for a table with `columnCount` columns. */
export function rowsPerChunk(columnCount: number): number {
  const byParams = Math.floor(RESTORE_MAX_PARAMS / Math.max(1, columnCount));
  return Math.max(1, Math.min(RESTORE_MAX_ROWS, byParams));
}

/** Splits `rows` into consecutive slices of at most `size` rows. Empty input gives no slices. */
export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += step) {
    out.push(rows.slice(i, i + step));
  }
  return out;
}

/** Table-by-table differences between the backup's counts and the restored counts. */
export function countMismatches(expected: Record<string, number>, actual: Record<string, number>): string[] {
  return Object.keys(expected)
    .filter((table) => expected[table] !== actual[table])
    .map((table) => `${table}: yedek ${expected[table]}, geri yüklenen ${actual[table] ?? 'yok'}`);
}
