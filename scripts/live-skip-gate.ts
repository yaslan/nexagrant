/**
 * CI gate: no `*.live.test.ts` test may be skipped (İNCELEME-62 O-1,
 * TASK-MUNRAZC9Q758W).
 *
 * The live suites guard themselves with `skipOrFailInCi` / `requireTestEnv`
 * (tests/helpers/live-db-role.ts): in CI a missing database or AUTH_SECRET
 * throws instead of skipping. That guard sits in each file's own set-up, so a
 * suite that builds its skip some other way — or a guard broken so it returns
 * `undefined` — puts the job back to "38 skipped, step green". This check reads
 * vitest's JSON report after the run and fails on any skipped live test,
 * whatever the mechanism, so the guard is no longer the only thing between a
 * skipped suite and a green step.
 *
 * It also refuses a report with no live tests in it: a gate over nothing is not
 * a gate (a renamed glob or a wrong report path would otherwise pass).
 */

/** `file suffix :: full test name` of the skips that are on purpose. */
export const ALLOWED_LIVE_SKIPS: readonly { file: string; namePrefix: string; why: string }[] = [
  {
    file: 'tests/k1-embeddings.live.test.ts',
    namePrefix: 'K1 embeddings (live, REAL OpenAI)',
    why: 'paid opt-in: K1_EMBEDDINGS_REAL_OPENAI=1',
  },
  {
    // Found by this gate on its first full run: the whole file skips in CI, on
    // purpose, because the job has no S3 service (TASK-MUNODY0DVDWC5, see the
    // file's header). Listed so the gap is written down; a MinIO service in
    // ci.yml would let this entry go.
    file: 'tests/evidence-upload-s3.live.test.ts',
    namePrefix: '',
    why: 'no S3-compatible store in the CI job (EVIDENCE_S3_TEST_* unset)',
  },
  {
    // The same MinIO behind a fault-injecting proxy (TASK-MUO122UPRPJQH): it
    // skips in CI for the same reason and goes with the entry above.
    file: 'tests/evidence-confirm-store-faults.live.test.ts',
    namePrefix: '',
    why: 'no S3-compatible store in the CI job (EVIDENCE_S3_TEST_* unset)',
  },
];

type AssertionResult = { fullName?: string; title?: string; status?: string };
type FileResult = { name?: string; assertionResults?: AssertionResult[] };
export type VitestJsonReport = { testResults?: FileResult[] };

export type LiveSkipVerdict = {
  ok: boolean;
  liveFiles: number;
  livePassed: number;
  skipped: string[];
  allowed: string[];
  problems: string[];
};

const LIVE_FILE = /(^|\/)[^/]+\.live\.test\.tsx?$/;

/** Anything that is not a run to a verdict counts as a skip. */
const RAN = new Set(['passed', 'failed']);

function relative(name: string): string {
  const i = name.lastIndexOf('/tests/');
  return i >= 0 ? name.slice(i + 1) : name;
}

export function checkLiveSkips(report: VitestJsonReport): LiveSkipVerdict {
  const files = (report.testResults ?? []).filter((f) => LIVE_FILE.test(f.name ?? ''));
  const skipped: string[] = [];
  const allowed: string[] = [];
  const problems: string[] = [];
  let livePassed = 0;

  for (const file of files) {
    const rel = relative(file.name ?? '');
    const results = file.assertionResults ?? [];
    if (results.length === 0) problems.push(`${rel}: no test results (did the file load?)`);
    for (const t of results) {
      if (t.status === 'passed') livePassed += 1;
      if (RAN.has(t.status ?? '')) continue;
      const label = `${rel} :: ${t.fullName ?? t.title ?? '?'} [${t.status ?? 'no status'}]`;
      const ok = ALLOWED_LIVE_SKIPS.some(
        (a) => rel === a.file && (t.fullName ?? '').startsWith(a.namePrefix),
      );
      (ok ? allowed : skipped).push(label);
    }
  }
  if (files.length === 0) problems.push('the report has no *.live.test.ts files');
  else if (livePassed === 0) problems.push('no live test passed');

  return {
    ok: skipped.length === 0 && problems.length === 0,
    liveFiles: files.length,
    livePassed,
    skipped,
    allowed,
    problems,
  };
}
