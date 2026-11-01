import { mkdirSync } from 'node:fs';

/**
 * Where an e2e run is allowed to write its screenshots.
 *
 * Every spec used to hold its own literal — `const SHOTS =
 * 'docs/agent-results/TASK-…-screenshots'` — pointing straight at a *committed*
 * evidence folder. So `pnpm test:e2e` rewrote the proof frames of tasks that had
 * been closed weeks earlier: one full run left 27 tracked files modified, and
 * two of them were not PNG noise but a different picture entirely
 * (`02-empty-tenant-dashboard-en.png`, 74 927 → 41 503 bytes). Evidence that a
 * later, unrelated run can silently replace is not evidence.
 *
 * The run therefore writes under a git-ignored root by default. Publishing a
 * frame into a card's folder stays possible, but becomes a deliberate act:
 *
 *   npx playwright test tests/e2e/foo.spec.ts                       # → test-artifacts/
 *   E2E_SHOTS_ROOT=docs/agent-results npx playwright test …         # → the card's folder
 *
 * The folder name is passed through unchanged, so a published frame lands on
 * exactly the path it always had and older reports keep resolving.
 *
 * The directory is created here rather than by each caller. `page.screenshot()`
 * makes its own parents, but `writeFileSync` does not — the CSV in
 * `dashboard-outcome-case` only ever worked because the committed folder was
 * already on disk, and would have thrown ENOENT the moment the root moved.
 */

/** Git-ignored (see .gitignore, "Playwright artifacts"). */
export const DEFAULT_SHOTS_ROOT = 'test-artifacts';

export function shotsRoot(): string {
  return process.env.E2E_SHOTS_ROOT?.trim() || DEFAULT_SHOTS_ROOT;
}

/**
 * @param folder the evidence folder name, e.g. `TASK-MTQZMLLZE1I29-screenshots`
 *               — a bare name, never a path.
 */
export function shotsDir(folder: string): string {
  if (folder.includes('/')) {
    throw new Error(
      `shotsDir() takes a folder name, not a path (got "${folder}"). ` +
        'The root is chosen by E2E_SHOTS_ROOT so a run cannot overwrite committed evidence.',
    );
  }
  const dir = `${shotsRoot()}/${folder}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}
