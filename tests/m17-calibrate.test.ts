import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MAX_CREDITS,
  DEFAULT_RUBRIC,
  FAILED_CREDIT_CEILING,
  parseArgs,
  renderMarkdown,
  requireAnthropicKey,
  runCalibration,
  stats,
  summarize,
  type RunOutcome,
} from '../scripts/m17-calibrate-lib';

/** A finished run with the given marks and flags; the model is never called. */
function okOutcome(run: number, rawScore: number, marks: Record<string, number>, knockouts: string[] = []): RunOutcome {
  return {
    creditsCharged: 3,
    record: {
      run,
      status: 'ok',
      analysisId: `an-${run}`,
      rawScore,
      maxRaw: 42,
      score100: Math.round((rawScore / 42) * 1000) / 10,
      passesThresholds: rawScore >= 21,
      knockouts,
      marks: Object.entries(marks).map(([criterionKey, mark]) => ({
        criterionKey,
        mark,
        maxMark: 3,
        evidence: [{ quote: `quote ${criterionKey}`, location: 'C.4' }],
      })),
      model: 'claude-sonnet-test',
      credits: 3,
      inputTokens: 1000,
      outputTokens: 500,
      durationMs: 1200,
    },
  };
}

function failedOutcome(run: number): RunOutcome {
  return { creditsCharged: 0, record: { run, status: 'failed', analysisId: `an-${run}`, error: 'evaluation_failed', durationMs: 90 } };
}

describe('parseArgs', () => {
  test('defaults: locale tr, 3 runs, budget 9, the seeded rubric', () => {
    const args = parseArgs(['--project', 'p.md', '--call', 'c.docx']);
    expect(args).toEqual({
      project: 'p.md',
      call: 'c.docx',
      locale: 'tr',
      runs: 3,
      out: 'm17-calibration.json',
      maxCredits: DEFAULT_MAX_CREDITS,
      rubric: DEFAULT_RUBRIC,
    });
    expect(DEFAULT_MAX_CREDITS).toBe(9);
  });

  test('reads every flag', () => {
    const args = parseArgs(['--project', 'p.md', '--call', 'c.pdf', '--locale', 'en', '--runs', '2', '--out', 'x.json', '--max-credits', '6', '--rubric', 'r1']);
    expect(args).toMatchObject({ locale: 'en', runs: 2, out: 'x.json', maxCredits: 6, rubric: 'r1' });
  });

  test('ignores a leading "--" separator that pnpm may pass through', () => {
    expect(parseArgs(['--', '--project', 'p.md', '--call', 'c.docx'])).toMatchObject({ project: 'p.md', call: 'c.docx' });
  });

  test('refuses a missing input, a bad locale, and run counts outside 1-5', () => {
    expect(() => parseArgs(['--call', 'c.docx'])).toThrow(/usage/);
    expect(() => parseArgs(['--project', 'p.md'])).toThrow(/usage/);
    expect(() => parseArgs(['--project', 'p.md', '--call', 'c.docx', '--locale', 'de'])).toThrow(/locale/);
    expect(() => parseArgs(['--project', 'p.md', '--call', 'c.docx', '--runs', '0'])).toThrow(/--runs/);
    expect(() => parseArgs(['--project', 'p.md', '--call', 'c.docx', '--runs', '6'])).toThrow(/--runs/);
    expect(() => parseArgs(['--project', 'p.md', '--call', 'c.docx', '--runs', '2.5'])).toThrow(/--runs/);
  });
});

describe('requireAnthropicKey', () => {
  test('stops with the plain message when the key is missing or blank, and never echoes a value', () => {
    expect(() => requireAnthropicKey({})).toThrow('ANTHROPIC_API_KEY tanımlı değil');
    expect(() => requireAnthropicKey({ ANTHROPIC_API_KEY: '   ' })).toThrow('ANTHROPIC_API_KEY tanımlı değil');
  });

  test('returns the key when it is set', () => {
    expect(requireAnthropicKey({ ANTHROPIC_API_KEY: 'test-value' })).toBe('test-value');
  });
});

describe('runCalibration: budget guard', () => {
  test('5 requested runs at 3 credits against a budget of 9 start exactly 3', async () => {
    let calls = 0;
    const loop = await runCalibration({
      runs: 5,
      price: 3,
      maxCredits: 9,
      runOnce: async (run) => {
        calls++;
        return okOutcome(run, 30, { c1: 3 });
      },
    });
    expect(calls).toBe(3);
    expect(loop.records).toHaveLength(3);
    expect(loop.creditsSpent).toBe(9);
    expect(loop.stoppedBy).toBe('budget');
  });

  test('a run that would take the spend past the budget is never started', async () => {
    let calls = 0;
    const loop = await runCalibration({
      runs: 3,
      price: 3,
      maxCredits: 5,
      runOnce: async (run) => {
        calls++;
        return okOutcome(run, 30, {});
      },
    });
    expect(calls).toBe(1);
    expect(loop.stoppedBy).toBe('budget');
  });

  test('failed runs stop the loop once their total passes the ceiling of 4 (two failures at 3 each)', async () => {
    expect(FAILED_CREDIT_CEILING).toBe(4);
    let calls = 0;
    const loop = await runCalibration({
      runs: 3,
      price: 3,
      maxCredits: 9,
      runOnce: async (run) => {
        calls++;
        return failedOutcome(run);
      },
    });
    expect(calls).toBe(2);
    expect(loop.failedCredits).toBe(6);
    expect(loop.stoppedBy).toBe('failed_budget');
  });

  test('all runs completing ends as completed, spend equal to the sum of the runs', async () => {
    const loop = await runCalibration({
      runs: 3,
      price: 3,
      maxCredits: 9,
      runOnce: async (run) => okOutcome(run, 30, {}),
    });
    expect(loop.stoppedBy).toBe('completed');
    expect(loop.creditsSpent).toBe(9);
    expect(loop.failedCredits).toBe(0);
  });
});

describe('statistics and the report shape', () => {
  test('sample standard deviation: [2, 4] has mean 3 and std √2', () => {
    const s = stats([2, 4]);
    expect(s?.mean).toBe(3);
    expect(s?.std).toBeCloseTo(Math.SQRT2, 10);
    expect(stats([5])?.std).toBe(0);
    expect(stats([])).toBeNull();
  });

  test('summary gives the score spread, each criterion spread, and the flags in every run vs some runs', async () => {
    const loop = await runCalibration({
      runs: 3,
      price: 3,
      maxCredits: 9,
      runOnce: async (run) => {
        if (run === 1) return okOutcome(run, 24, { c1: 3, c2: 2 }, ['budget-missing', 'partner-count']);
        if (run === 2) return okOutcome(run, 30, { c1: 3, c2: 3 }, ['budget-missing']);
        return okOutcome(run, 27, { c1: 2, c2: 3 }, ['budget-missing']);
      },
    });
    const summary = summarize(loop, 3);

    expect(summary.runsCompleted).toBe(3);
    expect(summary.runsFailed).toBe(0);
    expect(summary.rawScore).toMatchObject({ n: 3, min: 24, max: 30 });
    expect(summary.perCriterion.c1).toMatchObject({ n: 3, min: 2, max: 3 });
    expect(summary.flags.everyRun).toEqual(['budget-missing']);
    expect(summary.flags.someRuns).toEqual(['partner-count']);
  });

  test('the JSON report carries the run records, and no key value or secret appears in it', async () => {
    const secret = 'sk-ant-TEST-SECRET-VALUE';
    const loop = await runCalibration({
      runs: 2,
      price: 3,
      maxCredits: 9,
      runOnce: async (run) => (run === 1 ? okOutcome(run, 30, { c1: 3 }) : failedOutcome(run)),
    });
    const report = { meta: { rubric: DEFAULT_RUBRIC, locale: 'tr', pricePerRun: 3 }, runs: loop.records, summary: summarize(loop, 2) };
    const json = JSON.stringify(report);

    expect(report.runs).toHaveLength(2);
    expect(report.runs[0]).toMatchObject({ status: 'ok', rawScore: 30, credits: 3, inputTokens: 1000, outputTokens: 500 });
    expect(report.runs[1]).toMatchObject({ status: 'failed', error: 'evaluation_failed' });
    expect(json).not.toContain(secret);
    expect(json).not.toMatch(/sk-ant-/);
  });

  test('the markdown says it is an internal pre-assessment and lists each run', async () => {
    const loop = await runCalibration({
      runs: 1,
      price: 3,
      maxCredits: 9,
      runOnce: async (run) => okOutcome(run, 30, { c1: 3 }, ['budget-missing']),
    });
    const md = renderMarkdown({ rubric: DEFAULT_RUBRIC }, loop, summarize(loop, 1));
    expect(md).toContain('iç ön değerlendirme, resmî skor değildir');
    expect(md).toContain('| 1 | ok | 30/42 |');
    expect(md).toContain('bayrak, her koşuda:** budget-missing');
  });
});
