import { isCi } from './live-db-role';

/**
 * TASK-MUN7B4ZIEBJML — for tests that read reference rows only `pnpm db:seed`
 * (prisma/seed.ts) writes: the ModuleCatalog, Topic rows, the demo tenant.
 *
 * CI seeds in "Prepare database" (.github/workflows/ci.yml), so there a
 * missing row is a broken setup and the test fails. Locally an unseeded
 * database used to give seven red tests that looked like bugs; now each one
 * says what it needs and is skipped.
 *
 * These rows are not built as per-test fixtures on purpose: they are global,
 * and a suite creating and deleting its own ModuleCatalog or Topic rows would
 * change what parallel files count.
 */
export function skipUnlessSeeded(
  ctx: { skip: (note?: string) => void },
  suite: string,
  seeded: boolean,
  what: string
): void {
  if (!seededOrSkipping(suite, seeded, what)) ctx.skip(`${what}: run \`pnpm db:seed\``);
}

/** The same check for a whole file: pass the result to `describe.skipIf(!…)`. */
export function seededOrSkipping(suite: string, seeded: boolean, what: string): boolean {
  if (seeded) return true;
  const reason = `${what}: run \`pnpm db:seed\``;
  if (isCi()) {
    throw new Error(`${suite}: refusing to skip in CI — ${reason} ("Prepare database" in ci.yml does).`);
  }
  console.warn(`${suite} skipped: ${reason}`);
  return false;
}
