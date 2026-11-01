/**
 * `tsx scripts/check-live-skips.ts <vitest-report.json>` — exits 1 when a
 * `*.live.test.ts` test was skipped. Why: scripts/live-skip-gate.ts. Run by the
 * Test step of .github/workflows/ci.yml after vitest writes its JSON report.
 */
import { readFileSync } from 'node:fs';
import { checkLiveSkips, type VitestJsonReport } from './live-skip-gate';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/check-live-skips.ts <vitest-report.json>');
  process.exit(2);
}

let report: VitestJsonReport;
try {
  report = JSON.parse(readFileSync(file, 'utf8')) as VitestJsonReport;
} catch (e) {
  console.error(`live-skip gate: cannot read ${file}: ${(e as Error).message}`);
  process.exit(1);
}

const v = checkLiveSkips(report);
console.log(`live-skip gate: ${v.liveFiles} live files, ${v.livePassed} live tests passed, ${v.allowed.length} allowed skip(s)`);
for (const a of v.allowed) console.log(`  allowed: ${a}`);
for (const p of v.problems) console.error(`  PROBLEM: ${p}`);
for (const s of v.skipped) console.error(`  SKIPPED: ${s}`);
if (!v.ok) {
  console.error('live-skip gate: FAILED — a live test did not run. In CI that is a false green; see scripts/live-skip-gate.ts.');
  // TASK-MUOEY2GBFHY7U: a laptop run without `CI` skips on purpose the suites
  // that refuse the shared "fabrika" database (`DB_NAME === 'fabrika' &&
  // !isCi()`), and this gate then fails where GitHub Actions (which sets
  // CI=true) passes. The verdict stays the same; the note says how to get the
  // CI result.
  const ci = (process.env.CI ?? '').trim().toLowerCase();
  if (v.skipped.length > 0 && ['', '0', 'false'].includes(ci)) {
    console.error(
      'live-skip gate: note — CI is not set. Suites that guard the shared "fabrika" database skip outside CI; to reproduce the CI job run vitest with CI=true against a throwaway database.',
    );
  }
  process.exit(1);
}
