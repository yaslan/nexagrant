#!/usr/bin/env tsx
/**
 * E11.3 — G0 ↔ ESR calibration (TASK-MTQ2KL3JO4MK2).
 *
 * Seeds the calibration sample set, scores every sample with the canonical G0 scorer, compares the
 * gate's answer against the recorded evaluation outcome, and writes the confusion matrix, the
 * threshold sweep and the partner survey to disk.
 *
 * Safety model — same as scripts/beta-onboarding.ts, deliberately:
 *   • `--dry-run` is the DEFAULT. Nothing is written to the database and nothing is emailed unless
 *     you pass `--apply` and/or `--send`.
 *   • Every database write is an upsert on a deterministic id, so a second run converges instead of
 *     duplicating. Running twice is safe and is part of the definition of done.
 *   • Everything lands in its own tenant (`esr-calibration`), so calibration rows can never show up
 *     in a design partner's pipeline or KPI dashboard.
 *   • `--send` refuses while any roster address sits on a reserved, undeliverable domain.
 *   • `--send` resumes rather than repeats: partners already in the send receipt are skipped, and a
 *     run with nothing left to deliver refuses instead of mailing everyone twice (`--resend` to
 *     override on purpose). The receipt is machine-local, so it can only speak for this machine.
 *
 * ROLLBACK
 *   pnpm tsx scripts/esr-calibration.ts --rollback --apply
 *   Deletes the calibration tenant (cascading its workspace, opportunities, proposals and gate
 *   decisions) and the SAMPLE-* CordisProject rows this script created. Nothing outside the
 *   `esr-calibration` tenant and the reserved `SAMPLE-` id namespace is touched. Emails already
 *   sent cannot be recalled.
 *
 * Usage
 *   pnpm tsx scripts/esr-calibration.ts --preflight              # read-only: can E11.3 be closed?
 *   pnpm tsx scripts/esr-calibration.ts                          # dry run: score + report only
 *   pnpm tsx scripts/esr-calibration.ts --apply                  # …and write the samples to the DB
 *   pnpm tsx scripts/esr-calibration.ts --apply --survey         # …and render the partner survey
 *   pnpm tsx scripts/esr-calibration.ts --apply --survey --send  # …and deliver it via SMTP
 *   pnpm tsx scripts/esr-calibration.ts --responses=<csv>        # re-label from partner verdicts
 *   pnpm tsx scripts/esr-calibration.ts --rollback --apply       # undo
 *
 * Flags
 *   --preflight         read-only readiness gate: prints every precondition of the E11.3 acceptance
 *                       criterion and exits 1 while any of them blocks. Writes nothing, sends
 *                       nothing, and refuses to combine with --apply/--survey/--send/--rollback.
 *   --samples=<path>    default docs/BETA_DATA/esr-calibration-samples.csv
 *   --roster=<path>     default docs/BETA_DATA/beta-partners.csv
 *   --responses=<path>  partner verdicts; when given they override the provisional labels
 *   --out=<dir>         default docs/BETA_DATA/generated/esr-calibration
 *   --report=<path>     default docs/CORDIS-SAMPLE-CALIBRATION.md
 *   --per-partner=<n>   survey items per partner, default 4 (20 samples × 10 partners = 2 each)
 *   --deadline=<date>   survey deadline, YYYY-MM-DD; default ESR_SURVEY_DEADLINE (pinned, so a
 *                       re-run never moves a date the partners were already given)
 *   --resend            deliver a SECOND copy to partners already recorded in the send receipt.
 *                       Without it a re-run resumes: it mails only the partners the receipt does not
 *                       list, and refuses outright when there is nobody left to deliver to.
 */

import 'dotenv/config';

import fs from 'fs';
import path from 'path';

import { prisma } from '../src/lib/db';
import { DEFAULT_SCORING_WEIGHTS } from '../src/lib/scoring/defaults';
import {
  DEFAULT_G0_RULES,
  SPEC_LITERAL_G0_RULES,
  decideG0,
  weightsTotal,
  type G0Decision,
  type G0Result,
  type G0Rules,
} from '../src/lib/scoring/g0-canonical';
import {
  bestSweepPoint,
  formatPercent,
  metrics,
  sweepThreshold,
  wilsonInterval,
  type CalibrationMetrics,
  type LabelledPrediction,
} from '../src/lib/scoring/calibration';
import { isFixtureSampleSet, parseEsrSamples, type EsrSample } from '../src/lib/beta/esr-samples';
import { parseBetaRoster, isPlaceholderEmail, type BetaPartner } from '../src/lib/beta/roster';
import {
  maskEmail,
  mergeRecipients,
  parseSendReceipt,
  partitionBySent,
  type SurveySendReceipt,
  type SurveySendRecipient,
} from '../src/lib/beta/esr-send-receipt';
import { deadlineWindow, evaluateEsrReadiness, type CalibrationRowCounts } from '../src/lib/beta/esr-readiness';
import {
  assignSamplesToPartners,
  buildResponseTemplateCsv,
  coveragePerSample,
  parseSurveyResponses,
  reconcileResponses,
  renderEsrSurveyEmail,
  rollUpVerdicts,
  surveyUrlFor,
  type SurveyResponse,
} from '../src/lib/beta/esr-survey';
import { BETA_SUPPORT_EMAIL, ESR_SURVEY_DEADLINE, ESR_SURVEY_WINDOW_DAYS } from '../src/lib/beta/constants';

const REPO_ROOT = path.resolve(__dirname, '..');
const TENANT_ID = 'esr-calibration';
const WORKSPACE_ID = 'esr-calibration-ws';
const RULE_VERSION = 'g0-canonical-1.0';
const ACTOR = 'esr-calibration-cli';
const FIXTURE_PREFIX = 'SAMPLE-';

interface Options {
  samples: string;
  roster: string;
  responses: string | null;
  out: string;
  report: string;
  perPartner: number;
  deadline: string;
  apply: boolean;
  survey: boolean;
  send: boolean;
  resend: boolean;
  rollback: boolean;
  preflight: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    samples: path.join(REPO_ROOT, 'docs/BETA_DATA/esr-calibration-samples.csv'),
    roster: path.join(REPO_ROOT, 'docs/BETA_DATA/beta-partners.csv'),
    responses: null,
    out: path.join(REPO_ROOT, 'docs/BETA_DATA/generated/esr-calibration'),
    report: path.join(REPO_ROOT, 'docs/CORDIS-SAMPLE-CALIBRATION.md'),
    perPartner: 4,
    deadline: ESR_SURVEY_DEADLINE,
    apply: false,
    survey: false,
    send: false,
    resend: false,
    rollback: false,
    preflight: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--preflight') opts.preflight = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--survey') opts.survey = true;
    else if (arg === '--send') opts.send = true;
    else if (arg === '--resend') opts.resend = true;
    else if (arg === '--rollback') opts.rollback = true;
    else if (arg.startsWith('--samples=')) opts.samples = path.resolve(arg.slice('--samples='.length));
    else if (arg.startsWith('--roster=')) opts.roster = path.resolve(arg.slice('--roster='.length));
    else if (arg.startsWith('--responses=')) opts.responses = path.resolve(arg.slice('--responses='.length));
    else if (arg.startsWith('--out=')) opts.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--report=')) opts.report = path.resolve(arg.slice('--report='.length));
    else if (arg.startsWith('--per-partner=')) {
      const n = Number(arg.slice('--per-partner='.length));
      if (!Number.isInteger(n) || n < 1) throw new Error('--per-partner must be a positive integer');
      opts.perPartner = n;
    } else if (arg.startsWith('--deadline=')) {
      const value = arg.slice('--deadline='.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('--deadline must look like YYYY-MM-DD');
      opts.deadline = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (opts.send && !opts.survey) throw new Error('--send requires --survey');
  if (opts.resend && !opts.send) throw new Error('--resend only means anything with --send');
  // The preflight is a read-only gate. Letting it combine with a mode that writes would make its
  // one guarantee — "running this changes nothing" — untrue, so the combination is refused rather
  // than silently ignored.
  if (opts.preflight && (opts.apply || opts.survey || opts.send || opts.rollback)) {
    throw new Error('--preflight is read-only and cannot be combined with --apply, --survey, --send or --rollback');
  }
  return opts;
}

function log(scope: string, message: string): void {
  console.log(`  [${scope}] ${message}`);
}

// ───────────────────────── scoring ─────────────────────────

interface ScoredSample {
  sample: EsrSample;
  result: G0Result;
  predicted: G0Decision;
  actual: G0Decision;
  correct: boolean;
}

function scoreAll(samples: EsrSample[], rules: G0Rules): ScoredSample[] {
  return samples.map((sample) => {
    const result = decideG0(sample.features, sample.facts, rules, DEFAULT_SCORING_WEIGHTS);
    return {
      sample,
      result,
      predicted: result.decision,
      actual: sample.expertLabel,
      correct: result.decision === sample.expertLabel,
    };
  });
}

/**
 * The committed response sheet is a harness self-test, not partner answers, and its own header says
 * so. Detecting it by that header rather than by filename means a copy of the file cannot be passed
 * off as a finding just by renaming it.
 */
const SELF_TEST_MARKER = 'HARNESS SELF-TEST';

/** A response file the ingest step will not fold in, and every reason why. */
class ResponseFileRefused extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(
      `--responses refused: ${file} cannot be folded in as it stands.\n` +
        problems.map((problem) => `   • ${problem}`).join('\n'),
    );
    this.name = 'ResponseFileRefused';
  }
}

/** Repo-relative where that reads well, absolute where the file lives outside the repo. */
function displayPath(target: string): string {
  const relative = path.relative(REPO_ROOT, target);
  return relative.startsWith('..') ? target : relative;
}

interface RelabelResult {
  effective: EsrSample[];
  responses: SurveyResponse[];
  relabelled: string[];
  /** Samples a partner majority actually confirms — a tie confirms nothing. */
  confirmed: string[];
  isSelfTest: boolean;
}

/**
 * Fold partner verdicts into the sample labels. Pure apart from reading the responses file.
 *
 * Throws when the file cannot be understood row for row. Skipping the odd bad row would be
 * friendlier, and that is exactly what the old `.find` did by accident: a mistyped sampleId matched
 * nothing, changed no label, and still counted toward "N verdicts ingested". A partly-understood
 * file measures the acceptance criterion against labels nobody confirmed, so the file is either
 * clean or it is refused.
 */
function applyResponses(
  samples: EsrSample[],
  responsesPath: string | null,
  partnerSlugs: string[],
): RelabelResult {
  if (!responsesPath)
    return { effective: samples, responses: [], relabelled: [], confirmed: [], isSelfTest: false };

  const raw = fs.readFileSync(responsesPath, 'utf8');
  const reconciled = reconcileResponses(parseSurveyResponses(raw), {
    sampleIds: samples.map((s) => s.sampleId),
    partnerSlugs,
  });
  if (reconciled.problems.length > 0) {
    throw new ResponseFileRefused(displayPath(responsesPath), reconciled.problems);
  }
  if (reconciled.collapsed > 0) {
    log('responses', `${reconciled.collapsed} identical repeat row(s) collapsed — a re-sent sheet does not vote twice`);
  }

  const responses = reconciled.accepted;
  const relabelled: string[] = [];
  const confirmed: string[] = [];
  const provisional = scoreAll(samples, DEFAULT_G0_RULES);
  const predicted = new Map(provisional.map((s) => [s.sample.sampleId, s.predicted]));
  const rollups = rollUpVerdicts(responses, predicted);
  const effective = samples.map((sample) => {
    const rollup = rollups.find((r) => r.sampleId === sample.sampleId);
    if (!rollup?.majority) return sample;
    confirmed.push(sample.sampleId);
    if (rollup.majority === sample.expertLabel) return sample;
    relabelled.push(`${sample.sampleId} ${sample.expertLabel}→${rollup.majority}`);
    return { ...sample, expertLabel: rollup.majority, labelSource: 'beta-survey' as const };
  });
  log(
    'responses',
    `${responses.length} verdicts, ${confirmed.length}/${samples.length} sample(s) confirmed, ${relabelled.length} label(s) changed`,
  );
  return { effective, responses, relabelled, confirmed, isSelfTest: raw.includes(SELF_TEST_MARKER) };
}

function toPredictions(scored: ScoredSample[]): LabelledPrediction[] {
  return scored.map((s) => ({
    id: s.sample.sampleId,
    predicted: s.predicted,
    actual: s.actual,
    score: s.result.score,
  }));
}

// ───────────────────────── database ─────────────────────────

async function ensureCalibrationTenant(): Promise<void> {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { name: 'ESR Calibration (internal)' },
    create: {
      id: TENANT_ID,
      name: 'ESR Calibration (internal)',
      slug: TENANT_ID,
      country: 'BE',
      orgType: 'RESEARCH',
      locale: 'tr',
      timezone: 'Europe/Brussels',
    },
  });
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: { name: 'ESR calibration samples' },
    create: { id: WORKSPACE_ID, tenantId: TENANT_ID, name: 'ESR calibration samples', slug: 'samples' },
  });
}

async function seedSample(scored: ScoredSample): Promise<void> {
  const { sample, result } = scored;
  const oppId = `esr-cal-${sample.sampleId}`;

  await prisma.cordisProject.upsert({
    where: { id: sample.cordisProjectId },
    update: { acronym: sample.acronym, title: sample.title, framework: sample.framework },
    create: {
      id: sample.cordisProjectId,
      acronym: sample.acronym,
      title: sample.title,
      framework: sample.framework,
      masterCall: sample.topicCode,
      status: sample.outcome === 'funded' ? 'SIGNED' : 'NOT_FUNDED',
    },
  });
  await prisma.cordisProjectTopic.upsert({
    where: { projectId_topicCode: { projectId: sample.cordisProjectId, topicCode: sample.topicCode } },
    update: { topicTitle: sample.title },
    create: { projectId: sample.cordisProjectId, topicCode: sample.topicCode, topicTitle: sample.title },
  });

  await prisma.opportunity.upsert({
    where: { id: oppId },
    update: { title: sample.title, g0Score: result.score, stage: 'G0', notes: sample.notes },
    create: {
      id: oppId,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      title: sample.title,
      stage: 'G0',
      status: sample.outcome === 'funded' ? 'FUNDED' : sample.outcome === 'below' ? 'REJECTED' : 'ACTIVE',
      intendedRole: 'coordinator',
      g0Score: result.score,
      notes: sample.notes,
    },
  });

  await prisma.proposal.upsert({
    where: { opportunityId: oppId },
    update: {
      acronym: sample.acronym,
      outcome: sample.outcome,
      esrScores: esrScoresJson(sample),
    },
    create: {
      id: `esr-cal-prop-${sample.sampleId}`,
      tenantId: TENANT_ID,
      opportunityId: oppId,
      acronym: sample.acronym,
      outcome: sample.outcome,
      esrScores: esrScoresJson(sample),
    },
  });

  // Deterministic id so the decision is upserted, not appended to on every run. The features live
  // in `inputs` because that is the column the gate engine already uses to make a decision
  // reproducible — the calibration report and the audit trail then read the same numbers.
  await prisma.gateDecision.upsert({
    where: { id: `esr-cal-gd-${sample.sampleId}` },
    update: {
      passed: result.decision === 'GO',
      inputs: gateInputsJson(scored),
      ruleVersion: RULE_VERSION,
      decidedBy: ACTOR,
    },
    create: {
      id: `esr-cal-gd-${sample.sampleId}`,
      tenantId: TENANT_ID,
      opportunityId: oppId,
      gate: 'G0',
      passed: result.decision === 'GO',
      inputs: gateInputsJson(scored),
      ruleVersion: RULE_VERSION,
      decidedBy: ACTOR,
    },
  });
}

function esrScoresJson(sample: EsrSample) {
  return {
    total: sample.esrTotal,
    threshold: sample.esrThreshold,
    outcome: sample.outcome,
    labelSource: sample.labelSource,
  };
}

function gateInputsJson(scored: ScoredSample) {
  return {
    sampleId: scored.sample.sampleId,
    features: scored.sample.features,
    baseRatePct: scored.sample.facts.baseRatePct,
    countryEligible: scored.sample.facts.countryEligible,
    weights: DEFAULT_SCORING_WEIGHTS,
    score: scored.result.score,
    contributions: scored.result.contributions,
    reasons: scored.result.reasons,
    predicted: scored.predicted,
    expertLabel: scored.actual,
    labelSource: scored.sample.labelSource,
  };
}

async function rollback(): Promise<void> {
  const oppIds = (
    await prisma.opportunity.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } })
  ).map((o: { id: string }) => o.id);
  const gd = await prisma.gateDecision.deleteMany({ where: { tenantId: TENANT_ID } });
  const props = await prisma.proposal.deleteMany({ where: { tenantId: TENANT_ID } });
  const opps = await prisma.opportunity.deleteMany({ where: { tenantId: TENANT_ID } });
  const topics = await prisma.cordisProjectTopic.deleteMany({
    where: { projectId: { startsWith: FIXTURE_PREFIX } },
  });
  const projects = await prisma.cordisProject.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  const ws = await prisma.workspace.deleteMany({ where: { tenantId: TENANT_ID } });
  const tenants = await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  log('rollback', `opportunities seen: ${oppIds.length}`);
  log(
    'rollback',
    `deleted gateDecision=${gd.count} proposal=${props.count} opportunity=${opps.count} ` +
      `cordisProjectTopic=${topics.count} cordisProject=${projects.count} workspace=${ws.count} tenant=${tenants.count}`,
  );
}

async function countCalibrationRows() {
  const [opportunities, proposals, gateDecisions, cordisProjects] = await Promise.all([
    prisma.opportunity.count({ where: { tenantId: TENANT_ID } }),
    prisma.proposal.count({ where: { tenantId: TENANT_ID } }),
    prisma.gateDecision.count({ where: { tenantId: TENANT_ID } }),
    prisma.cordisProject.count({ where: { id: { startsWith: FIXTURE_PREFIX } } }),
  ]);
  return { opportunities, proposals, gateDecisions, cordisProjects };
}

// ───────────────────────── report ─────────────────────────

function matrixTable(m: CalibrationMetrics): string {
  return [
    '| | Gerçek: GO | Gerçek: NO_GO |',
    '|---|---:|---:|',
    `| **Tahmin: GO** | ${m.truePositive} (TP) | ${m.falsePositive} (FP) |`,
    `| **Tahmin: NO_GO** | ${m.falseNegative} (FN) | ${m.trueNegative} (TN) |`,
  ].join('\n');
}

function metricsLine(m: CalibrationMetrics): string {
  const wilson = wilsonInterval(m.truePositive + m.trueNegative, m.total);
  const ci = wilson ? ` (Wilson %95 GA: ${formatPercent(wilson.low)} – ${formatPercent(wilson.high)})` : '';
  return (
    `- **Doğruluk (accuracy):** ${formatPercent(m.accuracy)}${ci}\n` +
    `- **Kesinlik (precision, GO dediklerimizin doğruluğu):** ${formatPercent(m.precision)}\n` +
    `- **Duyarlılık (recall, kaçırmadıklarımız):** ${formatPercent(m.recall)}\n` +
    `- **F1:** ${formatPercent(m.f1)}`
  );
}

/**
 * The report has to end in a recommendation, and the recommendation has to be computed from this
 * run rather than typed in — otherwise it goes stale the first time the sample set changes.
 *
 * The shape of the recommendation is a judgement (a review band beats moving one threshold when the
 * sample is this small); the numbers in it are not.
 */
function buildRecommendation(
  scored: ScoredSample[],
  scoredLiteral: ScoredSample[],
  best: ReturnType<typeof bestSweepPoint>,
): string {
  const m = metrics(toPredictions(scored));
  const strict = DEFAULT_G0_RULES.minScore ?? 70;
  const reviewLow = best ? best.threshold : strict;

  // Samples the strict rule rejects on the composite alone — i.e. every hard rule passed and only
  // the threshold stopped them. These are exactly the cases a human review band would catch.
  const compositeOnlyRejects = scored.filter(
    (s) => s.predicted === 'NO_GO' && s.result.reasons.length === 1 && s.result.reasons[0]!.startsWith('composite'),
  );
  const inBand = compositeOnlyRejects.filter((s) => s.result.score >= reviewLow);
  const bandWouldHaveBeenRight = inBand.filter((s) => s.actual === 'GO');
  const falsePositives = scored.filter((s) => s.predicted === 'GO' && s.actual === 'NO_GO');

  const lines: string[] = [];

  lines.push(
    m.falseNegative > m.falsePositive
      ? `Bu koşuda hata dağılımı **kaçırma yönünde**: ${m.falseNegative} yanlış negatif (kaçırılan hibe) ` +
          `karşısında ${m.falsePositive} yanlış pozitif (boşa emek). Bileşik eşik ${strict} olduğu gibi bırakılırsa ` +
          `eşiği geçen tekliflerin bir kısmı hiç denenmeden eleniyor.`
      : `Bu koşuda hata dağılımı **fazla cömert** yönde: ${m.falsePositive} yanlış pozitif karşısında ` +
          `${m.falseNegative} yanlış negatif. Eşiği gevşetmek maliyeti artırır.`,
  );

  if (best && best.threshold < strict) {
    lines.push(
      `Tarama en yüksek doğruluğu eşik **${best.threshold}**'te veriyor (${formatPercent(best.metrics.accuracy)}). ` +
        `Ancak n=${m.total} için Wilson aralığı çok geniş; eşiği tek hamlede ${strict}'ten ${best.threshold}'e ` +
        `çekmek bu örnek setine aşırı uyum (overfit) olur.`,
    );
  }

  lines.push(
    `**Önerilen tasarım — üç bant, tek eşik yerine:**\n` +
      `- \`GO\` : bileşik skor ≥ ${strict} (bugünkü davranış korunur)\n` +
      `- \`İNCELE\` : ${reviewLow} ≤ skor < ${strict} — otomatik eleme yok, insan kararı ister\n` +
      `- \`NO_GO\` : skor < ${reviewLow} ya da herhangi bir sert kural düşmüş\n\n` +
      `Bu setde inceleme bandına ${inBand.length} örnek düşüyor` +
      (inBand.length
        ? ` (${inBand.map((s) => s.sample.sampleId).join(', ')}); bunların ${bandWouldHaveBeenRight.length} tanesi ` +
          `gerçekte eşiği geçmiş tekliflerdi, yani bugün sessizce kaybediliyorlar.`
        : '.'),
  );

  if (falsePositives.length) {
    lines.push(
      `Kalan yanlış pozitif${falsePositives.length > 1 ? 'ler' : ''} eşik meselesi değil: ` +
        falsePositives
          .map(
            (s) =>
              `**${s.sample.sampleId} ${s.sample.acronym}** (skor ${s.result.score.toFixed(2)}, taban oran %${s.sample.facts.baseRatePct})`,
          )
          .join(', ') +
        `. Yüksek taban oranlı çağrı tipleri bileşik skoru şişiriyor; \`baseRate\` ağırlığının çağrı tipine göre ` +
        `sınırlandırılması ayrı bir iş olarak açılmalı.`,
    );
  }

  const gap = Math.abs(
    ((metrics(toPredictions(scoredLiteral)).accuracy ?? 0) - (m.accuracy ?? 0)) * 100,
  );
  lines.push(
    `**Karar KAPANDI (2026-09-06, patron onayı — docs/ROADMAP.md · Açık kararlar #8):** eşik **bileşik skora** ` +
      `uygulanır; kapı kuralı **A**'dır (\`DEFAULT_G0_RULES\`). **B kapıda kullanılmaz, yalnız karşılaştırma içindir** ` +
      `(\`SPEC_LITERAL_G0_RULES\`). Bu koşuda A ile B arasında **${gap.toFixed(1)} puanlık** doğruluk farkı çıkıyor; ` +
      `bu bir seçenek değil, iki kural setinin ölçüm farkıdır — **E11.3 doğruluk kriteri B'ye geçilerek kapatılamaz.** ` +
      `Eşiği değiştirmek yeni bir patron kararı gerektirir, #8'in yeniden okunmasını değil.`,
  );
  lines.push(
    `**Kalan tutarsızlık (karar değil, etiket hatası):** \`/settings/gates\` aynı sayıyı hâlâ "Minimum AI Alignment ` +
      `Score" diye etiketliyor (\`src/app/[locale]/(app)/[workspace]/settings/gates/page.tsx:35\`, alan \`minG0Score\`), ` +
      `oysa \`gates/evaluate.ts\` onu bileşik skora uyguluyor. #8'in öngördüğü etiket düzeltmesi yapılmadı; sahibi ` +
      `board **TASK-MTQ63RR8Z0G8E**. Kalibrasyonu etkilemez, kullanıcıya yanlış şeyi söyler.`,
  );

  return lines.join('\n\n');
}

function buildReport(args: {
  scoredDefault: ScoredSample[];
  scoredLiteral: ScoredSample[];
  sweep: ReturnType<typeof sweepThreshold>;
  isFixture: boolean;
  samplesPath: string;
  responsesPath: string | null;
  responseCount: number;
  relabelled: string[];
  coverage: Map<string, number>;
  partnerCount: number;
  /** true only when this run actually handed the survey to the SMTP server. */
  surveySent: boolean;
  /** roster addresses on a reserved, undeliverable domain — `--send` refuses while > 0. */
  undeliverable: number;
  deadline: string;
}): string {
  const mDefault = metrics(toPredictions(args.scoredDefault));
  const mLiteral = metrics(toPredictions(args.scoredLiteral));
  const best = bestSweepPoint(args.sweep);
  const generatedAt = new Date().toISOString();

  // The criterion is "sent", not "rendered". Rendering an HTML file nobody receives used to tick
  // this box green, which hid the real blocker: the committed roster is a placeholder, so `--send`
  // refuses and no verdict can ever come back.
  const surveyStatus =
    args.surveySent
      ? `✅ ${args.partnerCount} ortağa gönderildi`
      : args.undeliverable > 0
        ? `❌ GÖNDERİLMEDİ — roster'daki ${args.undeliverable} adres teslim edilemez alan adında ` +
          '(`.invalid`); `--send` reddediyor. Gerçek roster girilmeden yanıt gelmez.'
        : args.partnerCount > 0
          ? '❌ hazırlandı, gönderilmedi (`--send` verilmedi)'
          : '❌';

  const rows = args.scoredDefault
    .map((s) => {
      const literal = args.scoredLiteral.find((l) => l.sample.sampleId === s.sample.sampleId)!;
      const esr =
        s.sample.esrTotal === null
          ? '—'
          : `${s.sample.esrTotal}/${s.sample.esrThreshold ?? '—'}`;
      return `| ${s.sample.sampleId} | ${s.sample.acronym} | ${s.result.score.toFixed(2)} | ${s.sample.features.alignment} | ${s.sample.facts.baseRatePct}% | ${s.predicted} | ${literal.predicted} | ${s.actual} | ${esr} | ${s.sample.outcome} | ${s.correct ? '✅' : '❌'} |`;
    })
    .join('\n');

  const sweepRows = args.sweep
    .map(
      (p) =>
        `| ${p.threshold} | ${p.metrics.truePositive} | ${p.metrics.falsePositive} | ${p.metrics.trueNegative} | ${p.metrics.falseNegative} | ${formatPercent(p.metrics.accuracy)} |`,
    )
    .join('\n');

  const misses = args.scoredDefault.filter((s) => !s.correct);

  return `# CORDIS örnek seti — G0 ↔ ESR kalibrasyonu

> Üretilmiş dosya. Elle düzenlemeyin; \`pnpm tsx scripts/esr-calibration.ts\` yeniden üretir.
> Üretim zamanı: ${generatedAt} · Kural sürümü: \`${RULE_VERSION}\` · Örnek seti: \`${path.relative(REPO_ROOT, args.samplesPath)}\`

${
  args.isFixture
    ? `> ⚠️ **Bu koşu KÜRATE EDİLMİŞ bir fixture üzerinde yapıldı** (tüm \`cordisProjectId\` değerleri rezerve
> \`SAMPLE-*\` ad alanında). Buradaki doğruluk oranı **kalibrasyon hattının** çalıştığını gösterir;
> modelin gerçek dünyadaki doğruluğunu **göstermez**. Gerçek sayı, beta tasarım ortaklarının kendi
> ESR'leri geldiğinde \`--samples=\` ile bu dosyanın yerine konarak üretilir.`
    : `> ✅ Bu koşu gerçek ESR verisi üzerinde yapıldı (fixture ad alanı dışında satırlar mevcut).`
}

## 1. Ne ölçülüyor

G0 triyaj kapısının kararı ile teklifin gerçek değerlendirme sonucu karşılaştırılıyor.

- **Pozitif sınıf = GO** ("bu fırsatın peşinden gidilir"). Sekiz haftalık emeği harcatan karar bu.
- **Gerçek etiket**: ESR sonucu \`funded | reserve | above_threshold\` → GO; \`below | ineligible\` → NO_GO.
- **Yanlış pozitif (FP)** = boşa harcanan emek. **Yanlış negatif (FN)** = kaçırılan hibe. Maliyetleri
  simetrik değil; eşik seçimi bu asimetriyi bilerek yapılmalı.

Puanlama PROJECT.md:81'deki ağırlıklarla (toplam ${weightsTotal(DEFAULT_SCORING_WEIGHTS)}):
${Object.entries(DEFAULT_SCORING_WEIGHTS)
  .map(([k, v]) => `\`${k}\`=${v}`)
  .join(' · ')}

## 2. Örnek başına sonuç (n=${args.scoredDefault.length})

| Örnek | Kısaltma | G0 skoru | Uyum | Taban oran | Karar (A) | Karar (B) | Gerçek | ESR | Sonuç | ✓ |
|---|---|---:|---:|---:|---|---|---|---|---|:-:|
${rows}

**A** = uygulanan kural: bileşik skor ≥ ${DEFAULT_G0_RULES.minScore} **ve** uyum ≥ ${DEFAULT_G0_RULES.minAlignment} **ve** taban oran ≥ %${DEFAULT_G0_RULES.minBaseRate} **ve** ülke uygun.
**B** = PROJECT.md:75'in düz okunuşu: bileşik skor eşiği **yok**; yalnız uyum ≥ ${SPEC_LITERAL_G0_RULES.minAlignment}, taban oran ≥ %${SPEC_LITERAL_G0_RULES.minBaseRate}, ülke uygun.

## 3. Karışıklık matrisi

### 3.1 A — bugün uygulanan kural (\`DEFAULT_GATE_RULES.G0\`)

${matrixTable(mDefault)}

${metricsLine(mDefault)}

### 3.2 B — PROJECT.md:75 düz okunuşu

${matrixTable(mLiteral)}

${metricsLine(mLiteral)}

## 4. Eşik taraması

Yalnız bileşik skor eşiği değiştirildi; üç sert kural (uyum, taban oran, ülke) sabit tutuldu.

| Eşik | TP | FP | TN | FN | Doğruluk |
|---:|---:|---:|---:|---:|---:|
${sweepRows}

${
  best
    ? `**Bu örnek setinde en yüksek doğruluk: eşik ${best.threshold} → ${formatPercent(best.metrics.accuracy)}.**`
    : '**Tarama sonuç üretmedi.**'
}

## 5. Öneri

${buildRecommendation(args.scoredDefault, args.scoredLiteral, best)}

## 6. Yanlış sınıflandırılan örnekler (A kuralı)

${
  misses.length === 0
    ? '_Yok._'
    : misses
        .map(
          (s) =>
            `- **${s.sample.sampleId} ${s.sample.acronym}** — skor ${s.result.score.toFixed(2)}, tahmin ${s.predicted}, gerçek ${s.actual} (${s.sample.outcome}).\n` +
            `  Gerekçe: ${s.result.reasons.length ? s.result.reasons.join('; ') : 'tüm kurallar geçildi'}.\n` +
            `  Not: ${s.sample.notes}`,
        )
        .join('\n')
}

## 7. Beta ortak anketi

- Ankete çıkarılan ortak sayısı: **${args.partnerCount}**, ortak başına **${[...args.coverage.values()].length ? Math.round([...args.coverage.values()].reduce((a, b) => a + b, 0) / Math.max(1, args.partnerCount)) : 0}** örnek.
- Örnek başına bağımsız görüş: **${[...new Set(args.coverage.values())].sort().join(', ') || '—'}**.
- Yanıt son tarihi: **${args.deadline}**.
- Yanıt dosyası: ${args.responsesPath ? `\`${path.relative(REPO_ROOT, args.responsesPath)}\` — ${args.responseCount} yanıt işlendi.` : '_henüz yok._'}
${
  args.relabelled.length
    ? `- Ortak çoğunluğu ile etiketi değişen örnekler: ${args.relabelled.join(', ')}.`
    : '- Ortak çoğunluğu hiçbir etiketi değiştirmedi.'
}

## 8. Kabul kriteri karşısında durum

| Kriter | Durum |
|---|---|
| 20 örnek seed edildi ve puanlandı | ${args.scoredDefault.length === 20 ? '✅' : '⚠️'} ${args.scoredDefault.length}/20 |
| Karışıklık matrisi üretiliyor | ✅ |
| Doğruluk ≥ %85 | ${(mDefault.accuracy ?? 0) >= 0.85 ? '✅' : '❌'} A kuralı ${formatPercent(mDefault.accuracy)} · B kuralı ${formatPercent(mLiteral.accuracy)}${best ? ` · en iyi eşik ${best.threshold} → ${formatPercent(best.metrics.accuracy)}` : ''} |
| Ortak anketi gönderilmiş | ${surveyStatus} |

${
  args.isFixture
    ? '> Bu tablodaki doğruluk satırı fixture üzerinden okunmuştur; kabul kriteri gerçek ESR verisiyle tekrar ölçülmeden **kapatılmamalıdır**.'
    : ''
}

> Bu tablo bu koşumun fotoğrafıdır ve eskir. Kriterin **şu anda** kapatılıp kapatılamayacağını
> makineye sordurun — hiçbir şey yazmaz, bloke varken 1 ile çıkar:
>
> \`\`\`bash
> pnpm beta:esr-preflight
> \`\`\`
`;
}

// ───────────────────────── send receipt & preflight ─────────────────────────

function receiptPath(opts: Options): string {
  return path.join(opts.out, 'survey', 'send-receipt.json');
}

/**
 * Record what actually left the building.
 *
 * Deliberately NOT deleted by `--rollback`: the tenant rows can be dropped and re-seeded, but mail
 * that reached ten partners cannot be un-sent, and erasing the only proof it happened would make
 * the next preflight lie.
 */
function writeSendReceipt(opts: Options, recipients: SurveySendRecipient[]): void {
  const receipt: SurveySendReceipt = {
    sentAt: new Date().toISOString(),
    deadline: opts.deadline,
    ruleVersion: RULE_VERSION,
    rosterPath: path.relative(REPO_ROOT, opts.roster),
    recipients,
  };
  fs.writeFileSync(receiptPath(opts), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function readSendReceipt(opts: Options): SurveySendReceipt | null {
  const file = receiptPath(opts);
  if (!fs.existsSync(file)) return null;
  return parseSendReceipt(fs.readFileSync(file, 'utf8'));
}

/**
 * Read-only readiness gate. Writes nothing, sends nothing, touches no database row; exits non-zero
 * while the E11.3 acceptance criterion cannot honestly be closed.
 */
async function runPreflight(opts: Options): Promise<boolean> {
  const samples = parseEsrSamples(fs.readFileSync(opts.samples, 'utf8'));
  const isFixture = isFixtureSampleSet(samples);

  // Read before ingest: a verdict is only checkable against the roster it was supposed to come from.
  const partners: BetaPartner[] = fs.existsSync(opts.roster)
    ? parseBetaRoster(fs.readFileSync(opts.roster, 'utf8'))
    : [];

  // A refused response file must not crash the read-only gate — it is one more thing the gate is
  // here to report, so it lands in the `responses` check with the reason attached.
  let relabel: RelabelResult;
  let responseProblem: string | null = null;
  try {
    relabel = applyResponses(samples, opts.responses, partners.map((p) => p.slug));
  } catch (err) {
    // The gate reports the reasons, not the wrapper sentence: "the file was refused" without the
    // why is the same dead end the silent drop was.
    responseProblem =
      err instanceof ResponseFileRefused
        ? err.problems.join(' · ')
        : err instanceof Error
          ? err.message
          : String(err);
    relabel = { effective: samples, responses: [], relabelled: [], confirmed: [], isSelfTest: false };
  }
  const { effective, responses, confirmed, isSelfTest } = relabel;
  const scored = scoreAll(effective, DEFAULT_G0_RULES);
  const accuracy = metrics(toPredictions(scored)).accuracy;

  // An unreachable database must read as "cannot verify", never as a pass.
  let dbRows: CalibrationRowCounts | null = null;
  try {
    dbRows = await countCalibrationRows();
  } catch (err) {
    log('db', `unreachable — ${err instanceof Error ? err.message : String(err)}`);
  }

  const report = evaluateEsrReadiness({
    sampleCount: samples.length,
    isFixture,
    dbRows,
    rosterSize: partners.length,
    undeliverable: partners.filter((p) => isPlaceholderEmail(p.contactEmail)).length,
    sendReceipt: readSendReceipt(opts),
    windowDays: ESR_SURVEY_WINDOW_DAYS,
    responseCount: responses.length,
    responsesAreSelfTest: isSelfTest,
    responseProblem,
    samplesWithVerdicts: confirmed.length,
    accuracy: accuracy ?? null,
    deadline: opts.deadline,
    today: new Date().toISOString().slice(0, 10),
  });

  console.log('');
  for (const check of report.checks) {
    const mark = check.severity === 'ok' ? '✅' : check.severity === 'warn' ? '⚠️ ' : '❌';
    console.log(`${mark} ${check.label} — ${check.detail}`);
    if (check.fix) console.log(`      → ${check.fix}`);
  }
  console.log('');
  console.log(report.blocked ? `❌ ${report.summary}` : `✅ ${report.summary}`);
  return report.blocked;
}

// ───────────────────────── main ─────────────────────────

/** Resolves to the process exit code: 0 when everything the run was asked to do succeeded. */
async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  console.log('🎯 ESR calibration (E11.3)');
  console.log(
    `   mode      : ${opts.preflight ? 'PREFLIGHT (read-only)' : opts.rollback ? 'ROLLBACK' : opts.apply ? 'APPLY' : 'DRY RUN'}`,
  );
  console.log(`   samples   : ${path.relative(REPO_ROOT, opts.samples)}`);
  console.log(`   roster    : ${path.relative(REPO_ROOT, opts.roster)}`);
  if (!opts.preflight) console.log(`   report    : ${path.relative(REPO_ROOT, opts.report)}`);
  console.log('');

  if (opts.preflight) {
    const blocked = await runPreflight(opts);
    return blocked ? 1 : 0;
  }

  if (opts.rollback) {
    if (!opts.apply) {
      console.log('   --rollback without --apply does nothing. Re-run with --apply to delete.');
      return 0;
    }
    await rollback();
    return 0;
  }

  const samples = parseEsrSamples(fs.readFileSync(opts.samples, 'utf8'));
  const isFixture = isFixtureSampleSet(samples);
  log('samples', `${samples.length} parsed${isFixture ? ' — CURATED FIXTURE (SAMPLE-* ids)' : ''}`);

  // Read before ingest: a verdict is only checkable against the roster it was supposed to come from.
  const partners: BetaPartner[] = fs.existsSync(opts.roster)
    ? parseBetaRoster(fs.readFileSync(opts.roster, 'utf8'))
    : [];

  // Partner verdicts, when present, replace the provisional labels before anything is measured.
  const { effective, responses, relabelled } = applyResponses(
    samples,
    opts.responses,
    partners.map((p) => p.slug),
  );

  const scoredDefault = scoreAll(effective, DEFAULT_G0_RULES);
  const scoredLiteral = scoreAll(effective, SPEC_LITERAL_G0_RULES);
  const mDefault = metrics(toPredictions(scoredDefault));
  const mLiteral = metrics(toPredictions(scoredLiteral));

  log('score', `rule A (composite ≥ ${DEFAULT_G0_RULES.minScore}): accuracy ${formatPercent(mDefault.accuracy)}`);
  log('score', `rule B (spec literal, no composite): accuracy ${formatPercent(mLiteral.accuracy)}`);

  const thresholds: number[] = [];
  for (let t = 40; t <= 90; t += 2) thresholds.push(t);
  const sweep = sweepThreshold(thresholds, (threshold) =>
    toPredictions(scoreAll(effective, { ...DEFAULT_G0_RULES, minScore: threshold })),
  );
  const best = bestSweepPoint(sweep);
  if (best) log('sweep', `best threshold ${best.threshold} → accuracy ${formatPercent(best.metrics.accuracy)}`);

  // Survey — rendered whether or not the database is written, so the programme manager can review
  // the worksheets before anything is sent.
  const assignments = assignSamplesToPartners(effective, partners, opts.perPartner).map((assignment) => ({
    ...assignment,
    items: assignment.items.map((item) => {
      const scored = scoredDefault.find((s) => s.sample.sampleId === item.sampleId)!;
      return { ...item, score: scored.result.score, decision: scored.predicted, reasons: scored.result.reasons };
    }),
  }));
  const coverage = coveragePerSample(assignments);

  if (opts.survey) {
    // Who has already had this mail. `--send` is the only irreversible step here, and it was the
    // only one that repeated itself on a re-run: the header's "running twice is safe" covered the
    // database upserts, not the mailbox. A resumed run now skips the partners the receipt already
    // records, so the natural recovery from a provider rejection half way down the roster does not
    // put a second copy of the survey in front of everyone who already answered.
    const priorReceipt = opts.send ? readSendReceipt(opts) : null;
    const { alreadySent } = partitionBySent(
      assignments.map((a) => a.partner.slug),
      priorReceipt,
    );
    const skip = new Set(opts.resend ? [] : alreadySent);

    if (opts.send) {
      const placeholders = partners.filter((p) => isPlaceholderEmail(p.contactEmail));
      if (placeholders.length > 0) {
        throw new Error(
          `--send refused: ${placeholders.length} roster address(es) are on a reserved, undeliverable domain ` +
            `(${placeholders.map((p) => p.contactEmail).join(', ')}). Replace the roster with real partners first.`,
        );
      }
      if (alreadySent.length > 0 && skip.size >= assignments.length) {
        throw new Error(
          `--send refused: every partner on this roster (${alreadySent.length}) is already in the send receipt ` +
            `(last accepted ${priorReceipt?.sentAt}). There is nothing left to deliver, and re-sending would mail ` +
            `partners who have already answered. Pass --resend to deliver a second copy on purpose.`,
        );
      }
      // The date on the sheet is a promise to people who have not been written to yet, and this
      // mail cannot be recalled to correct it. The readiness gate has been warning that the pinned
      // deadline is closer than the answering window, but a warning on a separate read-only command
      // does not stop this one: without this guard the survey goes out on the day the roster lands
      // carrying a date that already owes the partners more time — or, if the roster arrives late
      // enough, a date in the past. Same arithmetic as the gate, deliberately shared.
      const window = deadlineWindow(new Date().toISOString().slice(0, 10), opts.deadline, ESR_SURVEY_WINDOW_DAYS);
      if (!window.givesFullWindow) {
        throw new Error(
          `--send refused: deadline ${opts.deadline} is ` +
            `${window.daysLeft >= 0 ? `only ${window.daysLeft} day(s) away` : `${-window.daysLeft} day(s) in the past`}, ` +
            `so it cannot give partners the ${ESR_SURVEY_WINDOW_DAYS}-day answering window ` +
            `(${window.shortfall} day(s) short). Mailing it would commit to a date already missed.\n` +
            `  Re-pin ESR_SURVEY_DEADLINE (src/lib/beta/constants.ts) to send-day + ${ESR_SURVEY_WINDOW_DAYS}, ` +
            `or pass --deadline=YYYY-MM-DD for a one-off run. Do not shorten the window to fit the old date.`,
        );
      }
      if (skip.size > 0) {
        log('survey', `resuming: ${skip.size} partner(s) already in the receipt will be skipped — ${[...skip].join(', ')}`);
      }
      if (opts.resend && alreadySent.length > 0) {
        log('survey', `--resend: mailing ${alreadySent.length} partner(s) a SECOND copy on purpose — this cannot be undone`);
      }
      if (!priorReceipt) {
        log(
          'survey',
          'no local receipt — note this only proves THIS machine has no record; the receipt dir is gitignored, ' +
            'so a send from another machine is invisible here. Confirm before delivering.',
        );
      }
    }

    fs.mkdirSync(path.join(opts.out, 'survey'), { recursive: true });
    // Written after every accepted send, not once at the end: a provider rejection half way through
    // still leaves a record of who already received mail that cannot be recalled.
    const sentRecipients: SurveySendRecipient[] = [...(priorReceipt?.recipients ?? [])];
    for (const assignment of assignments) {
      const email = renderEsrSurveyEmail({
        locale: assignment.partner.locale,
        contactName: assignment.partner.contactName,
        items: assignment.items,
        surveyUrl: surveyUrlFor(assignment.partner.slug),
        deadlineLabel: opts.deadline,
      });
      const base = path.join(opts.out, 'survey', assignment.partner.slug);
      fs.writeFileSync(`${base}.html`, email.html, 'utf8');
      fs.writeFileSync(
        `${base}.txt`,
        `Subject: ${email.subject}\nTo: ${assignment.partner.contactName} <${assignment.partner.contactEmail}>\n\n${email.text}\n`,
        'utf8',
      );
      fs.writeFileSync(`${base}.responses.csv`, buildResponseTemplateCsv(assignment), 'utf8');

      if (opts.send && skip.has(assignment.partner.slug)) {
        log('survey', `${assignment.partner.slug}: already sent ${priorReceipt?.recipients.find((r) => r.slug === assignment.partner.slug)?.sentAt} — skipped`);
      } else if (opts.send) {
        const { smtpConfigFromEnv, createSmtpTransport, sendMail } = await import('../src/lib/email/mailer');
        const smtp = smtpConfigFromEnv();
        if (!smtp) throw new Error('--send requires SMTP_HOST in the environment');
        const data = await sendMail(createSmtpTransport(smtp), smtp, {
          from: process.env.SMTP_FROM || `Fabrika Beta <${BETA_SUPPORT_EMAIL}>`,
          to: assignment.partner.contactEmail,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }).catch((error: unknown) => {
          throw new Error(`SMTP rejected ${maskEmail(assignment.partner.contactEmail)}: ${error instanceof Error ? error.message : error}`);
        });
        const fresh: SurveySendRecipient = {
          slug: assignment.partner.slug,
          emailMasked: maskEmail(assignment.partner.contactEmail),
          messageId: data.messageId,
          items: assignment.items.length,
          sentAt: new Date().toISOString(),
        };
        sentRecipients.splice(0, sentRecipients.length, ...mergeRecipients(sentRecipients, [fresh]));
        writeSendReceipt(opts, sentRecipients);
        log('survey', `${assignment.partner.slug} (${maskEmail(assignment.partner.contactEmail)}): sent (${assignment.items.length} items)`);
      } else {
        log(
          'survey',
          `${assignment.partner.slug}: rendered ${assignment.items.length} items → survey/${assignment.partner.slug}.html (not sent)`,
        );
      }
    }
  }

  if (opts.apply) {
    const before = await countCalibrationRows();
    await ensureCalibrationTenant();
    for (const scored of scoredDefault) await seedSample(scored);
    const after = await countCalibrationRows();
    log('db', `before: ${JSON.stringify(before)}`);
    log('db', `after : ${JSON.stringify(after)}`);
  } else {
    log('db', 'dry run — nothing written. Re-run with --apply to seed.');
  }

  const report = buildReport({
    scoredDefault,
    scoredLiteral,
    sweep,
    isFixture,
    samplesPath: opts.samples,
    responsesPath: opts.responses,
    responseCount: responses.length,
    relabelled,
    coverage,
    partnerCount: assignments.length,
    surveySent: opts.survey && opts.send,
    undeliverable: partners.filter((p) => isPlaceholderEmail(p.contactEmail)).length,
    deadline: opts.deadline,
  });
  fs.mkdirSync(path.dirname(opts.report), { recursive: true });
  fs.writeFileSync(opts.report, report, 'utf8');
  log('report', `written → ${path.relative(REPO_ROOT, opts.report)}`);

  fs.mkdirSync(opts.out, { recursive: true });
  fs.writeFileSync(
    path.join(opts.out, 'calibration-summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ruleVersion: RULE_VERSION,
        isFixture,
        sampleCount: scoredDefault.length,
        ruleA: mDefault,
        ruleB: mLiteral,
        bestThreshold: best,
        perSample: scoredDefault.map((s) => ({
          sampleId: s.sample.sampleId,
          score: s.result.score,
          predicted: s.predicted,
          actual: s.actual,
          outcome: s.sample.outcome,
          correct: s.correct,
          reasons: s.result.reasons,
        })),
        surveyCoverage: Object.fromEntries(coverage),
      },
      null,
      2,
    ),
    'utf8',
  );
  log('report', `written → ${path.relative(REPO_ROOT, path.join(opts.out, 'calibration-summary.json'))}`);
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
