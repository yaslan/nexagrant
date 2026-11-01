/**
 * M17 Hakem calibration harness (FO-278): runs the real evaluation N times on the same call and
 * project, and writes each run's marks, flags, tokens and credits, plus the spread across runs.
 *
 *   pnpm m17:calibrate -- --project <file> --call <file> --locale tr --runs 3 --out <json>
 *
 * Run it only on an isolated database (`pnpm gate:isolated pnpm m17:calibrate -- …`). The guard
 * refuses the shared :5433 database in any spelling (URL port, `?port=`, PGPORT). The model is the
 * production path: `runEvaluation` → `generateCompletion` in `src/lib/llm.ts`; nothing here calls
 * a provider directly. Unknown flags are refused, so a typo cannot fall back to the default budget.
 *
 * Why `process.env` is read directly here, not through `src/lib/env.ts`: this script is a dev
 * harness that runs before the app is loaded, and the guard must check the raw DATABASE_URL and
 * PGPORT that the process will actually connect with. The API key is read from the process
 * environment, which `dotenv/config` fills from `.env` (or from `DOTENV_CONFIG_PATH`). The value is
 * never printed or written to the report.
 *
 * Output is an internal pre-assessment (iç ön değerlendirme) and a calibration measurement, not an
 * official score.
 */
import 'dotenv/config';

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import {
  assertIsolatedDatabase,
  parseArgs,
  renderMarkdown,
  requireAnthropicKey,
  runCalibration,
  summarize,
  type RunRecord,
} from './m17-calibrate-lib';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  requireAnthropicKey(process.env);
  assertIsolatedDatabase(process.env);

  // Imported after dotenv has run: the app reads its config at import time.
  const { prisma } = await import('../src/lib/db');
  const { extractInterregDocument, InterregExtractError } = await import('../src/modules/m17/server/extract');
  const { createAnalysis, saveDocument } = await import('../src/modules/m17/server/analyses');
  const { runEvaluation, EVALUATE_MODULE, EVALUATE_PURPOSE } = await import('../src/modules/m17/server/evaluate');
  const { resolveCredits } = await import('../src/lib/llm');

  const price = resolveCredits(EVALUATE_MODULE, EVALUATE_PURPOSE).credits;
  const extract = async (path: string) => {
    try {
      return await extractInterregDocument(basename(path), await readFile(path));
    } catch (err) {
      if (err instanceof InterregExtractError) throw new Error(`${path}: ${err.message}`);
      throw err;
    }
  };
  const projectDoc = await extract(args.project);
  const callDoc = await extract(args.call);

  // One tenant, one member, and a credit grant equal to the budget: the product's own balance
  // check then refuses anything past it, on top of the harness's guard.
  const stamp = `m17cal-${Date.now().toString(36)}`;
  const tenant = await prisma.tenant.create({
    data: { name: stamp, slug: stamp, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  await prisma.creditLedger.create({ data: { tenantId: tenant.id, delta: args.maxCredits, reason: 'purchase' } });
  const user = await prisma.user.create({ data: { email: `${stamp}@example.com`, name: stamp } });
  await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'MEMBER' } });
  const owner = { tenantId: tenant.id, userId: user.id };

  const startedAt = new Date().toISOString();
  const loop = await runCalibration({
    runs: args.runs,
    price,
    maxCredits: args.maxCredits,
    runOnce: async (run): Promise<{ record: RunRecord; creditsCharged: number }> => {
      const started = Date.now();
      const fail = (analysisId: string | null, error: string) => ({
        record: { run, status: 'failed' as const, analysisId, error, durationMs: Date.now() - started },
        creditsCharged: 0,
      });

      // Every step after the analysis exists keeps its id in the record, and a throw in any step
      // becomes a failed run instead of ending the whole report.
      let id: string | null = null;
      let outcome: Awaited<ReturnType<typeof runEvaluation>>;
      try {
        const created = await createAnalysis(owner, args.rubric);
        if (!created.ok) return fail(null, created.error);
        id = created.analysis.id;
        const c = await saveDocument(owner, id, 'call', basename(args.call), callDoc);
        if (!c.ok) return fail(id, c.error);
        const p = await saveDocument(owner, id, 'project', basename(args.project), projectDoc);
        if (!p.ok) return fail(id, p.error);
        outcome = await runEvaluation(owner, id, { locale: args.locale });
      } catch (err) {
        // Only the error class is recorded: a provider message could echo request details.
        return fail(id, `exception: ${err instanceof Error ? err.name : 'unknown'}`);
      }
      if (!outcome.ok) return fail(id, outcome.error);

      const r = outcome.result;
      return {
        creditsCharged: r.credits,
        record: {
          run,
          status: 'ok',
          analysisId: id,
          rawScore: r.rawScore,
          maxRaw: r.maxRaw,
          score100: r.score100,
          passesThresholds: r.passesThresholds,
          knockouts: r.knockouts,
          marks: r.marks.map((m) => ({ criterionKey: m.criterionKey, mark: m.mark, maxMark: m.maxMark, evidence: m.evidence })),
          model: r.model,
          credits: r.credits,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          durationMs: Date.now() - started,
        },
      };
    },
  });

  const summary = summarize(loop, args.runs);
  const meta = {
    rubric: args.rubric,
    locale: args.locale,
    project: basename(args.project),
    call: basename(args.call),
    pricePerRun: price,
    maxCredits: args.maxCredits,
    startedAt,
  };
  const report = { meta, runs: loop.records, summary };

  await writeFile(args.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  const mdPath = args.out.replace(/\.json$/, '') + '.md';
  const markdown = renderMarkdown(meta, loop, summary);
  await writeFile(mdPath, markdown, 'utf8');
  process.stdout.write(markdown);
  process.stdout.write(`\njson: ${args.out}\nmarkdown: ${mdPath}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`m17-calibrate: ${message}\n`);
  process.exitCode = 1;
});
