/**
 * Pure part of the M17 calibration harness (FO-278): argument parsing, the budget guard,
 * the run loop, statistics across runs and the report. No database, no model, no env reads
 * here — `scripts/m17-calibrate.ts` supplies those, and the unit test drives this with a fake run.
 *
 * Internal pre-assessment only: the output is a calibration measurement, not an official score.
 */

export const DEFAULT_MAX_CREDITS = 9;
/** Failed runs may cost at most this much in total before the harness stops (card FO-278). */
export const FAILED_CREDIT_CEILING = 4;
export const DEFAULT_RUBRIC = 'interreg-next-bsb.call2.regular';
export const MAX_RUNS = 5;

export type CalibrateLocale = 'tr' | 'en';

export interface CalibrateArgs {
  project: string;
  call: string;
  locale: CalibrateLocale;
  runs: number;
  out: string;
  maxCredits: number;
  rubric: string;
}

export const USAGE =
  'usage: pnpm m17:calibrate -- --project <md|txt|docx|pdf> --call <md|txt|docx|pdf> ' +
  '[--locale tr|en] [--runs 1-5] [--out <json>] [--max-credits 9] [--rubric <id>]';

/** Reads `--key value` pairs. Throws with the usage line on anything malformed. */
export function parseArgs(argv: string[]): CalibrateArgs {
  // `pnpm m17:calibrate -- --project …` can hand the separator on to the script; it is not a flag.
  const tokens = argv[0] === '--' ? argv.slice(1) : argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += 2) {
    const key = tokens[i];
    const value = tokens[i + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(USAGE);
    flags.set(key.slice(2), value);
  }
  const project = flags.get('project');
  const call = flags.get('call');
  if (!project || !call) throw new Error(USAGE);

  const locale = flags.get('locale') ?? 'tr';
  if (locale !== 'tr' && locale !== 'en') throw new Error(`--locale must be tr or en (got "${locale}")`);

  const runs = integerFlag(flags, 'runs', 3, 1, MAX_RUNS);
  const maxCredits = integerFlag(flags, 'max-credits', DEFAULT_MAX_CREDITS, 1, Number.MAX_SAFE_INTEGER);

  return {
    project,
    call,
    locale,
    runs,
    out: flags.get('out') ?? 'm17-calibration.json',
    maxCredits,
    rubric: flags.get('rubric') ?? DEFAULT_RUBRIC,
  };
}

function integerFlag(flags: Map<string, string>, name: string, fallback: number, min: number, max: number): number {
  const raw = flags.get(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer ${min}-${max} (got "${raw}")`);
  return n;
}

/**
 * The API key comes from the process environment, loaded by dotenv before this runs.
 * Missing is a hard stop with a plain message; the value is never echoed.
 */
export function requireAnthropicKey(env: Record<string, string | undefined>): string {
  const key = env.ANTHROPIC_API_KEY;
  if (!key || key.trim() === '') throw new Error('ANTHROPIC_API_KEY tanımlı değil');
  return key;
}

export interface CriterionMarkRecord {
  criterionKey: string;
  mark: number;
  maxMark: number;
  evidence: { quote: string; location: string }[];
}

export interface RunRecord {
  run: number;
  status: 'ok' | 'failed';
  analysisId: string | null;
  error?: string;
  rawScore?: number;
  maxRaw?: number;
  score100?: number;
  passesThresholds?: boolean;
  knockouts?: string[];
  marks?: CriterionMarkRecord[];
  model?: string;
  credits?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}

/** What one run returns to the loop: a finished record, and the credits the ledger actually moved. */
export interface RunOutcome {
  record: RunRecord;
  creditsCharged: number;
}

export interface LoopInput {
  runs: number;
  price: number;
  maxCredits: number;
  runOnce: (run: number) => Promise<RunOutcome>;
}

export type StopReason = 'completed' | 'budget' | 'failed_budget';

export interface LoopResult {
  records: RunRecord[];
  creditsSpent: number;
  failedCredits: number;
  stoppedBy: StopReason;
}

/**
 * Runs up to `runs` times. Before each run: stop when the next run would take the spend past
 * `maxCredits`. After a failed run: its price counts against the failure ceiling, and the loop
 * stops once that total goes past {@link FAILED_CREDIT_CEILING}.
 */
export async function runCalibration(input: LoopInput): Promise<LoopResult> {
  const records: RunRecord[] = [];
  let creditsSpent = 0;
  let failedCredits = 0;
  let stoppedBy: StopReason = 'completed';

  for (let run = 1; run <= input.runs; run++) {
    if (creditsSpent + input.price > input.maxCredits) {
      stoppedBy = 'budget';
      break;
    }
    const outcome = await input.runOnce(run);
    records.push(outcome.record);
    creditsSpent += outcome.creditsCharged;
    if (outcome.record.status === 'failed') {
      // A failed run is charged its price here even though the ledger refunds it: the ceiling is
      // about how many paid model calls were burnt, not what the tenant was left with.
      failedCredits += input.price;
      if (failedCredits > FAILED_CREDIT_CEILING) {
        stoppedBy = 'failed_budget';
        break;
      }
    }
  }
  return { records, creditsSpent, failedCredits, stoppedBy };
}

export interface Stats {
  n: number;
  min: number;
  max: number;
  mean: number;
  /** Sample standard deviation (n-1); 0 for fewer than two values. */
  std: number;
}

export function stats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { n, min: Math.min(...values), max: Math.max(...values), mean, std: Math.sqrt(variance) };
}

export interface Summary {
  runsRequested: number;
  runsCompleted: number;
  runsFailed: number;
  stoppedBy: StopReason;
  creditsSpent: number;
  failedCredits: number;
  rawScore: Stats | null;
  score100: Stats | null;
  perCriterion: Record<string, Stats>;
  flags: { everyRun: string[]; someRuns: string[] };
}

/** Across the successful runs: the score spread, each criterion's mark spread, and the flags. */
export function summarize(loop: LoopResult, runsRequested: number): Summary {
  const ok = loop.records.filter((r): r is RunRecord & { status: 'ok' } => r.status === 'ok');
  const perCriterionValues = new Map<string, number[]>();
  for (const r of ok) {
    for (const m of r.marks ?? []) {
      const list = perCriterionValues.get(m.criterionKey) ?? [];
      list.push(m.mark);
      perCriterionValues.set(m.criterionKey, list);
    }
  }
  const perCriterion: Record<string, Stats> = {};
  for (const [key, values] of perCriterionValues) {
    const s = stats(values);
    if (s) perCriterion[key] = s;
  }

  const flagSets = ok.map((r) => new Set(r.knockouts ?? []));
  const all = new Set(flagSets.flatMap((s) => [...s]));
  const everyRun = [...all].filter((f) => flagSets.every((s) => s.has(f))).sort();
  const someRuns = [...all].filter((f) => !flagSets.every((s) => s.has(f))).sort();

  return {
    runsRequested,
    runsCompleted: ok.length,
    runsFailed: loop.records.length - ok.length,
    stoppedBy: loop.stoppedBy,
    creditsSpent: loop.creditsSpent,
    failedCredits: loop.failedCredits,
    rawScore: stats(ok.map((r) => r.rawScore ?? 0)),
    score100: stats(ok.map((r) => r.score100 ?? 0)),
    perCriterion,
    flags: { everyRun, someRuns },
  };
}

export function renderMarkdown(meta: Record<string, string | number>, loop: LoopResult, summary: Summary): string {
  const lines: string[] = [];
  lines.push('# M17 kalibrasyon koşusu (iç ön değerlendirme, resmî skor değildir)');
  lines.push('');
  for (const [k, v] of Object.entries(meta)) lines.push(`- **${k}:** ${v}`);
  lines.push('');
  lines.push('| koşu | durum | ham puan | 100 üzerinden | eşik | eleme | kredi | token (giriş/çıkış) | süre (sn) |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of loop.records) {
    if (r.status === 'ok') {
      lines.push(
        `| ${r.run} | ok | ${r.rawScore}/${r.maxRaw} | ${r.score100} | ${r.passesThresholds ? 'geçti' : 'geçmedi'} | ` +
          `${(r.knockouts ?? []).join(', ') || '—'} | ${r.credits} | ${r.inputTokens}/${r.outputTokens} | ${(r.durationMs / 1000).toFixed(1)} |`,
      );
    } else {
      lines.push(`| ${r.run} | başarısız: ${r.error ?? 'bilinmiyor'} | — | — | — | — | 0 | — | ${(r.durationMs / 1000).toFixed(1)} |`);
    }
  }
  lines.push('');
  lines.push(`- **durdurulma:** ${summary.stoppedBy}; harcanan kredi ${summary.creditsSpent}; başarısız koşu kredisi ${summary.failedCredits} (tavan ${FAILED_CREDIT_CEILING})`);
  if (summary.rawScore) {
    const s = summary.rawScore;
    lines.push(`- **ham puan (n=${s.n}):** min ${s.min}, maks ${s.max}, ortalama ${s.mean.toFixed(2)}, std ${s.std.toFixed(2)}`);
  }
  for (const [key, s] of Object.entries(summary.perCriterion)) {
    lines.push(`- **kriter ${key}:** min ${s.min}, maks ${s.max}, std ${s.std.toFixed(2)}`);
  }
  lines.push(`- **bayrak, her koşuda:** ${summary.flags.everyRun.join(', ') || '—'}`);
  lines.push(`- **bayrak, yalnız bazı koşularda:** ${summary.flags.someRuns.join(', ') || '—'}`);
  return lines.join('\n') + '\n';
}
