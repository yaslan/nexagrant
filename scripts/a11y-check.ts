/**
 * Lighthouse accessibility gate.
 *
 * `docs/ROADMAP.md` E10 accepts the milestone at "Lighthouse a11y >= 90", but
 * until now that number was only ever produced by hand, so a regression only
 * surfaced when somebody remembered to measure. This script runs the same
 * audit headlessly over the public pages and exits non-zero below the
 * threshold, which is what makes it usable as a CI gate.
 *
 *   pnpm a11y:check                       # against http://localhost:3000
 *   A11Y_BASE_URL=... pnpm a11y:check     # against another origin
 *   A11Y_MIN_SCORE=95 pnpm a11y:check     # tighten (or, temporarily, prove) the gate
 *   A11Y_PATHS=/tr,/en pnpm a11y:check    # audit a different page set
 *
 * The pages audited are locale-public and hit no database, so the gate needs a
 * running server but not a seeded one. Two application-wide defects have
 * historically driven this score below 95 — a missing `<html lang>` and white
 * text on `bg-accent` in the dark theme; see
 * .agentspace/memory/shared/fabrika-lighthouse-a11y-two-recurring-defects.md
 */
import { launch, type LaunchedChrome } from 'chrome-launcher';

const BASE_URL = (process.env.A11Y_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const MIN_SCORE = Number(process.env.A11Y_MIN_SCORE ?? '90');

const DEFAULT_PATHS = ['/tr', '/tr/privacy', '/en', '/en/privacy'];
const PATHS = (process.env.A11Y_PATHS ?? DEFAULT_PATHS.join(','))
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

interface PageResult {
  path: string;
  score: number;
  failures: string[];
}

/** Waits for the server to answer, so `next start` has time to come up in CI. */
async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt made';

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms (last error: ${lastError})`);
}

async function auditPage(port: number, path: string): Promise<PageResult> {
  // Lighthouse is ESM-only; a static import would break the CJS-flavoured
  // `scripts/` build. The dynamic import keeps it out of the module graph.
  const lighthouse = (await import('lighthouse')).default;

  const url = `${BASE_URL}${path}`;
  const runnerResult = await lighthouse(
    url,
    { port, output: 'json', logLevel: 'error', onlyCategories: ['accessibility'] }
  );

  if (!runnerResult) throw new Error(`Lighthouse returned no result for ${url}`);

  const { lhr } = runnerResult;
  const rawScore = lhr.categories.accessibility?.score;
  if (rawScore === null || rawScore === undefined) {
    throw new Error(`Lighthouse produced no accessibility score for ${url}`);
  }

  // Audits scored below 1 are the ones dragging the category down; `null`
  // scores are "not applicable" and are not defects.
  const failures = Object.values(lhr.audits)
    .filter((audit) => audit.score !== null && audit.score !== undefined && audit.score < 1)
    .map((audit) => `${audit.id} — ${audit.title}`);

  return { path, score: Math.round(rawScore * 100), failures };
}

async function main(): Promise<void> {
  console.log(`Lighthouse accessibility gate — threshold ${MIN_SCORE}, base ${BASE_URL}`);

  await waitForServer(`${BASE_URL}${PATHS[0] ?? '/'}`);

  let chrome: LaunchedChrome | undefined;
  const results: PageResult[] = [];

  try {
    chrome = await launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    for (const path of PATHS) {
      results.push(await auditPage(chrome.port, path));
    }
  } finally {
    await chrome?.kill();
  }

  const failed = results.filter((r) => r.score < MIN_SCORE);

  console.log('');
  for (const r of results) {
    const mark = r.score < MIN_SCORE ? '❌' : '✅';
    console.log(`${mark} ${r.score.toString().padStart(3)}  ${r.path}`);
  }

  if (failed.length === 0) {
    console.log(`\n✅ SUCCESS: all ${results.length} pages scored >= ${MIN_SCORE}.`);
    return;
  }

  console.error(`\n❌ ERROR: ${failed.length} page(s) scored below ${MIN_SCORE}.`);
  for (const r of failed) {
    console.error(`\n  ${r.path} — ${r.score}`);
    for (const failure of r.failures) console.error(`    · ${failure}`);
  }
  console.error('\nRun `pnpm dev` and re-run this check locally to reproduce.');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\n❌ ERROR: accessibility gate could not run — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
