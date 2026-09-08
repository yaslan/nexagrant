/**
 * E11.3 — G0 canonical scorer, calibration maths, sample parsing and survey ingest.
 *
 * No database: every unit here is a pure function on purpose, so the numbers the calibration report
 * prints are the same numbers a test can pin.
 */

import fs from 'fs';
import path from 'path';
import { describe, test, expect } from 'vitest';

import { DEFAULT_SCORING_WEIGHTS } from '../src/lib/scoring/defaults';
import {
  BASE_RATE_FULL_MARKS_PCT,
  DEFAULT_G0_RULES,
  SPEC_LITERAL_G0_RULES,
  baseRateToScore,
  decideG0,
  g0Contributions,
  scoreG0,
  weightsTotal,
  type G0Features,
} from '../src/lib/scoring/g0-canonical';
import {
  bestSweepPoint,
  confusionMatrix,
  metrics,
  sweepThreshold,
  wilsonInterval,
  type LabelledPrediction,
} from '../src/lib/scoring/calibration';
import { labelForOutcome, parseEsrSamples, isFixtureSampleSet } from '../src/lib/beta/esr-samples';
import {
  assignSamplesToPartners,
  coveragePerSample,
  parseSurveyResponses,
  rollUpVerdicts,
  buildResponseTemplateCsv,
} from '../src/lib/beta/esr-survey';
import { parseBetaRoster } from '../src/lib/beta/roster';
import {
  daysBetween,
  evaluateEsrReadiness,
  type EsrReadinessInput,
} from '../src/lib/beta/esr-readiness';
import {
  maskEmail,
  mergeRecipients,
  parseSendReceipt,
  partitionBySent,
  type SurveySendRecipient,
} from '../src/lib/beta/esr-send-receipt';

const SAMPLES_CSV = path.join(__dirname, '../docs/BETA_DATA/esr-calibration-samples.csv');
const ROSTER_CSV = path.join(__dirname, '../docs/BETA_DATA/beta-partners.csv');

const flat = (value: number): G0Features => ({
  alignment: value,
  baseRate: value,
  coordinatorHistory: value,
  researchAndEndUser: value,
  networkCentrality: value,
  budgetRoleEconomy: value,
  lumpSumTwoStage: value,
});

describe('G0 canonical scorer (PROJECT.md:81)', () => {
  test('the shipped weights sum to 100', () => {
    expect(weightsTotal(DEFAULT_SCORING_WEIGHTS)).toBe(100);
  });

  test('an all-100 feature vector scores 100 and an all-zero one scores 0', () => {
    expect(scoreG0(flat(100))).toBe(100);
    expect(scoreG0(flat(0))).toBe(0);
  });

  test('the composite is the weighted mean of the seven features', () => {
    const features: G0Features = {
      alignment: 88,
      baseRate: 70,
      coordinatorHistory: 60,
      researchAndEndUser: 80,
      networkCentrality: 55,
      budgetRoleEconomy: 75,
      lumpSumTwoStage: 100,
    };
    // 0.30*88 + 0.15*70 + 0.15*60 + 0.12*80 + 0.10*55 + 0.10*75 + 0.08*100
    expect(scoreG0(features)).toBeCloseTo(76.5, 6);
  });

  test('weights that do not sum to 100 are normalised, not clipped', () => {
    const doubled = Object.fromEntries(
      Object.entries(DEFAULT_SCORING_WEIGHTS).map(([k, v]) => [k, v * 2]),
    ) as typeof DEFAULT_SCORING_WEIGHTS;
    expect(scoreG0(flat(64), doubled)).toBe(scoreG0(flat(64)));
  });

  test('out-of-range features are clamped instead of blowing the 0–100 scale', () => {
    expect(scoreG0(flat(500))).toBe(100);
    expect(scoreG0(flat(-40))).toBe(0);
  });

  test('contributions sum back to the composite', () => {
    const features = { ...flat(50), alignment: 91, lumpSumTwoStage: 12 };
    const total = Object.values(g0Contributions(features)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(scoreG0(features), 1);
  });

  test('base rate reaches full marks at the documented ceiling and never exceeds it', () => {
    expect(baseRateToScore(0)).toBe(0);
    expect(baseRateToScore(BASE_RATE_FULL_MARKS_PCT)).toBe(100);
    expect(baseRateToScore(BASE_RATE_FULL_MARKS_PCT * 2)).toBe(100);
    expect(baseRateToScore(10)).toBe(50);
    expect(baseRateToScore(-3)).toBe(0);
  });
});

describe('G0 hard rules (PROJECT.md:75)', () => {
  const strong = { ...flat(90), alignment: 90 };

  test('a strong opportunity in an eligible country passes', () => {
    const result = decideG0(strong, { baseRatePct: 15, countryEligible: true });
    expect(result.decision).toBe('GO');
    expect(result.reasons).toEqual([]);
  });

  test('an ineligible country fails however good the score is', () => {
    const result = decideG0(strong, { baseRatePct: 15, countryEligible: false });
    expect(result.decision).toBe('NO_GO');
    expect(result.reasons.join(' ')).toContain('country not eligible');
  });

  test('a base rate under 8% fails', () => {
    const result = decideG0(strong, { baseRatePct: 7.9, countryEligible: true });
    expect(result.decision).toBe('NO_GO');
    expect(result.reasons.join(' ')).toContain('base rate');
  });

  test('every failing rule is reported, not just the first', () => {
    const weak = { ...flat(20), alignment: 20 };
    const result = decideG0(weak, { baseRatePct: 2, countryEligible: false });
    expect(result.reasons).toHaveLength(4); // composite + alignment + base rate + eligibility
    expect(result.reasons.join(' ')).toContain('composite score');
    expect(result.reasons.join(' ')).toContain('alignment');
    expect(result.reasons.join(' ')).toContain('base rate');
    expect(result.reasons.join(' ')).toContain('country not eligible');
  });

  test('the spec-literal rule set drops the composite threshold but keeps the three hard rules', () => {
    const midScore = { ...flat(30), alignment: 75 };
    expect(decideG0(midScore, { baseRatePct: 12, countryEligible: true }, DEFAULT_G0_RULES).decision).toBe('NO_GO');
    expect(decideG0(midScore, { baseRatePct: 12, countryEligible: true }, SPEC_LITERAL_G0_RULES).decision).toBe('GO');
    expect(decideG0(midScore, { baseRatePct: 4, countryEligible: true }, SPEC_LITERAL_G0_RULES).decision).toBe('NO_GO');
  });
});

describe('calibration maths', () => {
  const predictions: LabelledPrediction[] = [
    { id: 'a', predicted: 'GO', actual: 'GO', score: 90 },
    { id: 'b', predicted: 'GO', actual: 'NO_GO', score: 80 },
    { id: 'c', predicted: 'NO_GO', actual: 'NO_GO', score: 40 },
    { id: 'd', predicted: 'NO_GO', actual: 'GO', score: 60 },
  ];

  test('confusion matrix counts each quadrant', () => {
    expect(confusionMatrix(predictions)).toEqual({
      truePositive: 1,
      falsePositive: 1,
      trueNegative: 1,
      falseNegative: 1,
      total: 4,
    });
  });

  test('accuracy, precision, recall and F1', () => {
    const m = metrics(predictions);
    expect(m.accuracy).toBe(0.5);
    expect(m.precision).toBe(0.5);
    expect(m.recall).toBe(0.5);
    expect(m.f1).toBe(0.5);
  });

  test('an empty set yields nulls rather than NaN', () => {
    const m = metrics([]);
    expect(m.accuracy).toBeNull();
    expect(m.precision).toBeNull();
    expect(m.recall).toBeNull();
  });

  test('the sweep finds the threshold with the best accuracy', () => {
    const rows = [
      { id: 'p1', score: 80, actual: 'GO' as const },
      { id: 'p2', score: 60, actual: 'GO' as const },
      { id: 'p3', score: 30, actual: 'NO_GO' as const },
    ];
    const points = sweepThreshold([70, 55, 20], (threshold) =>
      rows.map((r) => ({ id: r.id, score: r.score, actual: r.actual, predicted: r.score >= threshold ? 'GO' : 'NO_GO' })),
    );
    const best = bestSweepPoint(points);
    expect(best?.threshold).toBe(55);
    expect(best?.metrics.accuracy).toBe(1);
  });

  test('a tie in the sweep breaks toward the stricter threshold', () => {
    const rows = [{ id: 'p1', score: 80, actual: 'GO' as const }];
    const points = sweepThreshold([50, 70], (threshold) =>
      rows.map((r) => ({ id: r.id, score: r.score, actual: r.actual, predicted: r.score >= threshold ? 'GO' : 'NO_GO' })),
    );
    expect(bestSweepPoint(points)?.threshold).toBe(70);
  });

  test('the Wilson interval brackets the point estimate and stays inside [0,1]', () => {
    const ci = wilsonInterval(18, 20)!;
    expect(ci.low).toBeGreaterThan(0);
    expect(ci.low).toBeLessThan(0.9);
    expect(ci.high).toBeGreaterThan(0.9);
    expect(ci.high).toBeLessThanOrEqual(1);
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe('sample set', () => {
  const csv = fs.readFileSync(SAMPLES_CSV, 'utf8');

  test('parses 20 samples and they are all fixture rows', () => {
    const samples = parseEsrSamples(csv);
    expect(samples).toHaveLength(20);
    expect(isFixtureSampleSet(samples)).toBe(true);
  });

  test('outcomes map to the ground-truth label the way the report claims', () => {
    expect(labelForOutcome('funded')).toBe('GO');
    expect(labelForOutcome('reserve')).toBe('GO');
    expect(labelForOutcome('above_threshold')).toBe('GO');
    expect(labelForOutcome('below')).toBe('NO_GO');
    expect(labelForOutcome('ineligible')).toBe('NO_GO');
  });

  test('a label that silently contradicts its own outcome is rejected', () => {
    const bad = csv.replace(
      'below,NO_GO,cordis-outcome,Weak on every feature',
      'below,GO,cordis-outcome,Weak on every feature',
    );
    expect(() => parseEsrSamples(bad)).toThrow(/contradicts outcome/);
  });

  test('a deliberate human override is allowed when labelSource says so', () => {
    const overridden = csv.replace(
      'below,NO_GO,cordis-outcome,Weak on every feature',
      'below,GO,expert-review,Weak on every feature',
    );
    expect(() => parseEsrSamples(overridden)).not.toThrow();
  });

  test('a duplicate sampleId is rejected', () => {
    const duped = `${csv}\n${csv.trim().split('\n').at(-1)}`;
    expect(() => parseEsrSamples(duped)).toThrow(/duplicate sampleId/);
  });

  test('the committed set is the one the report is generated from and is not all-positive', () => {
    const samples = parseEsrSamples(csv);
    const go = samples.filter((s) => s.expertLabel === 'GO').length;
    expect(go).toBeGreaterThan(0);
    expect(go).toBeLessThan(samples.length);
  });
});

describe('beta survey', () => {
  const samples = parseEsrSamples(fs.readFileSync(SAMPLES_CSV, 'utf8'));
  const partners = parseBetaRoster(fs.readFileSync(ROSTER_CSV, 'utf8'));

  test('every sample is reviewed by more than one partner', () => {
    const assignments = assignSamplesToPartners(samples, partners, 4);
    const coverage = coveragePerSample(assignments);
    expect(coverage.size).toBe(samples.length);
    for (const count of coverage.values()) expect(count).toBeGreaterThanOrEqual(2);
  });

  test('assignment is deterministic — a re-run gives a partner the same worksheet', () => {
    const a = assignSamplesToPartners(samples, partners, 4);
    const b = assignSamplesToPartners(samples, partners, 4);
    expect(a.map((x) => x.items.map((i) => i.sampleId))).toEqual(b.map((x) => x.items.map((i) => i.sampleId)));
  });

  test('the response template round-trips through the parser once filled in', () => {
    const assignment = assignSamplesToPartners(samples, partners, 2)[0]!;
    const filled = buildResponseTemplateCsv(assignment)
      .split('\n')
      .map((line) =>
        line.startsWith(assignment.partner.slug) ? `${line.replace(/,,,$/, ',true,,')}` : line,
      )
      .join('\n');
    const responses = parseSurveyResponses(filled);
    expect(responses).toHaveLength(assignment.items.length);
    expect(responses.every((r) => r.agrees)).toBe(true);
  });

  test('unanswered rows are skipped rather than counted as agreement', () => {
    const assignment = assignSamplesToPartners(samples, partners, 3)[0]!;
    expect(parseSurveyResponses(buildResponseTemplateCsv(assignment))).toHaveLength(0);
  });

  test('a disagreement without a verdict is rejected', () => {
    const csv = 'partnerSlug,sampleId,agrees,verdict,comment\np1,S01,false,,no reason given\n';
    expect(() => parseSurveyResponses(csv)).toThrow(/verdict of GO or NO_GO/);
  });

  test('agreement votes for whatever the scorer said, disagreement for the partner verdict', () => {
    const responses = parseSurveyResponses(
      'partnerSlug,sampleId,agrees,verdict,comment\n' +
        'p1,S04,true,,looks right\n' +
        'p2,S04,false,GO,threshold is too strict here\n' +
        'p3,S04,false,GO,agreed with p2\n',
    );
    const rollup = rollUpVerdicts(responses, new Map([['S04', 'NO_GO']]))[0]!;
    expect(rollup.responses).toBe(3);
    expect(rollup.noGo).toBe(1);
    expect(rollup.go).toBe(2);
    expect(rollup.majority).toBe('GO');
  });

  test('a tie produces no majority instead of silently picking a side', () => {
    const responses = parseSurveyResponses(
      'partnerSlug,sampleId,agrees,verdict,comment\np1,S04,true,,\np2,S04,false,GO,\n',
    );
    expect(rollUpVerdicts(responses, new Map([['S04', 'NO_GO']]))[0]!.majority).toBeNull();
  });
});

describe('E11.3 readiness gate', () => {
  const READY: EsrReadinessInput = {
    sampleCount: 20,
    isFixture: false,
    dbRows: { opportunities: 20, proposals: 20, gateDecisions: 20, cordisProjects: 20 },
    rosterSize: 10,
    undeliverable: 0,
    sendReceipt: {
      sentAt: '2026-09-10T09:00:00.000Z',
      deadline: '2026-09-24',
      ruleVersion: 'g0-canonical-1.0',
      rosterPath: '(external)',
      recipients: [
        { slug: 'p1', emailMasked: 'p*@partner.example', messageId: 'abc', items: 4, sentAt: '2026-09-10T09:00:00.000Z' },
      ],
    },
    responseCount: 24,
    responsesAreSelfTest: false,
    accuracy: 0.9,
    deadline: '2026-09-24',
    windowDays: 14,
    today: '2026-09-20',
  };

  test('every precondition met — the criterion may be closed', () => {
    const report = evaluateEsrReadiness(READY);
    expect(report.blocked).toBe(false);
    expect(report.blockers).toHaveLength(0);
    expect(report.summary).toMatch(/can be closed/);
  });

  test('the state E11.3 is actually in — four blockers, named', () => {
    const report = evaluateEsrReadiness({
      ...READY,
      isFixture: true,
      rosterSize: 10,
      undeliverable: 10,
      sendReceipt: null,
      responseCount: 0,
      accuracy: 0.8,
      today: '2026-09-08',
      deadline: '2026-09-21',
    });
    expect(report.blocked).toBe(true);
    expect(report.blockers.map((b) => b.id)).toEqual(['roster', 'survey-sent', 'responses', 'accuracy']);
    // Every blocker has to tell a human what clears it, otherwise the gate is just an alarm.
    for (const blocker of report.blockers) expect(blocker.fix).not.toBe('');
  });

  // Açık karar #8 closed on 2026-09-06: rule A is the gate rule, rule B is comparison-only. The
  // remediation text used to send the operator off to "close #8", which both was already done and
  // implied rule B's higher number could close the criterion. It cannot.
  test('the accuracy blocker does not offer rule B as a way out', () => {
    const report = evaluateEsrReadiness({ ...READY, accuracy: 0.8 });
    const check = report.checks.find((c) => c.id === 'accuracy')!;
    expect(check.severity).toBe('blocked');
    expect(check.fix).toMatch(/#8 closed on 2026-09-06/);
    expect(check.fix).toMatch(/NOT an escape hatch/);
    expect(check.fix).not.toMatch(/Close açık karar #8/);
  });

  test('the summary names the head of the blocked chain, not four separate problems', () => {
    const report = evaluateEsrReadiness({
      ...READY,
      isFixture: true,
      undeliverable: 10,
      sendReceipt: null,
      responseCount: 0,
      accuracy: 0.8,
      today: '2026-09-08',
      deadline: '2026-09-21',
    });
    expect(report.summary).toMatch(/one chain, head: roster \(human action\)/);
    expect(report.summary).toMatch(/survey-sent, responses, accuracy cannot clear before it does/);
  });

  test('a lone blocker is not dressed up as a chain', () => {
    const report = evaluateEsrReadiness({ ...READY, undeliverable: 10 });
    expect(report.blockers.map((b) => b.id)).toEqual(['roster']);
    expect(report.summary).not.toMatch(/one chain/);
  });

  test('the self-test response file cannot close the criterion even when it scores ≥ 85%', () => {
    const report = evaluateEsrReadiness({ ...READY, responsesAreSelfTest: true, responseCount: 8, accuracy: 0.85 });
    expect(report.checks.find((c) => c.id === 'accuracy')?.severity).toBe('ok');
    expect(report.blockers.map((b) => b.id)).toEqual(['responses']);
  });

  test('an unreachable database reads as "cannot verify", never as a pass', () => {
    const report = evaluateEsrReadiness({ ...READY, dbRows: null });
    const check = report.checks.find((c) => c.id === 'fixture-db')!;
    expect(check.severity).toBe('warn');
    expect(check.detail).toMatch(/cannot verify/);
    expect(report.blocked).toBe(false);
  });

  test('a partly seeded fixture blocks and names the idempotent repair', () => {
    const report = evaluateEsrReadiness({
      ...READY,
      dbRows: { opportunities: 20, proposals: 0, gateDecisions: 20, cordisProjects: 20 },
    });
    const check = report.checks.find((c) => c.id === 'fixture-db')!;
    expect(check.severity).toBe('blocked');
    expect(check.fix).toMatch(/--apply/);
  });

  test('a deadline nobody was sent is a warning, not a pass', () => {
    const report = evaluateEsrReadiness({ ...READY, sendReceipt: null });
    expect(report.checks.find((c) => c.id === 'deadline')?.severity).toBe('warn');
  });

  test('daysBetween counts whole days in both directions', () => {
    expect(daysBetween('2026-09-08', '2026-09-21')).toBe(13);
    expect(daysBetween('2026-09-21', '2026-09-08')).toBe(-13);
    expect(daysBetween('2026-09-08', '2026-09-08')).toBe(0);
  });
});

describe('E11.3 survey send receipt', () => {
  test('an address is masked down to one visible character', () => {
    expect(maskEmail('partner@fabrika.example')).toBe('p******@fabrika.example');
    expect(maskEmail('a@fabrika.example')).toBe('a*@fabrika.example');
    expect(maskEmail('not-an-address')).toBe('***');
    expect(maskEmail('@fabrika.example')).toBe('***');
  });

  test('a receipt round-trips', () => {
    const receipt = {
      sentAt: '2026-09-10T09:00:00.000Z',
      deadline: '2026-09-24',
      ruleVersion: 'g0-canonical-1.0',
      rosterPath: '(external)',
      recipients: [
        { slug: 'p1', emailMasked: 'p*@partner.example', messageId: 'abc', items: 4, sentAt: '2026-09-10T09:00:00.000Z' },
      ],
    };
    expect(parseSendReceipt(JSON.stringify(receipt))).toEqual(receipt);
  });

  test('an unusable receipt reads as no proof of a send, not as a crash', () => {
    expect(parseSendReceipt('{ truncated')).toBeNull();
    expect(parseSendReceipt('null')).toBeNull();
    expect(parseSendReceipt('{"sentAt":"2026-09-10T09:00:00.000Z"}')).toBeNull();
    expect(parseSendReceipt('{"sentAt":"2026-09-10T09:00:00.000Z","recipients":[]}')).toBeNull();
  });
});

describe('E11.3 survey send is resumable, not repeatable', () => {
  const receiptFor = (slugs: string[]) => ({
    sentAt: '2026-09-10T09:00:00.000Z',
    deadline: '2026-09-24',
    ruleVersion: 'g0-canonical-1.0',
    rosterPath: '(external)',
    recipients: slugs.map((slug) => ({
      slug,
      emailMasked: 'p*@partner.example',
      messageId: 'abc',
      items: 4,
      sentAt: '2026-09-10T09:00:00.000Z',
    })),
  });

  test('a run with no receipt has to mail everyone', () => {
    const { pending, alreadySent } = partitionBySent(['a', 'b', 'c'], null);
    expect(pending).toEqual(['a', 'b', 'c']);
    expect(alreadySent).toEqual([]);
  });

  // The recovery case that made this necessary: the provider rejected partner `c`, so the operator
  // re-runs. Without the split, `a` and `b` get the survey a second time.
  test('a resumed run mails only the partners the receipt does not list', () => {
    const { pending, alreadySent } = partitionBySent(['a', 'b', 'c'], receiptFor(['a', 'b']));
    expect(pending).toEqual(['c']);
    expect(alreadySent).toEqual(['a', 'b']);
  });

  test('a fully delivered roster leaves nothing pending — the caller must refuse, not re-mail', () => {
    const { pending, alreadySent } = partitionBySent(['a', 'b'], receiptFor(['a', 'b']));
    expect(pending).toEqual([]);
    expect(alreadySent).toEqual(['a', 'b']);
  });

  test('a resumed run keeps the proof that the earlier partners were mailed', () => {
    const previous = receiptFor(['a', 'b']).recipients;
    const fresh: SurveySendRecipient[] = [
      { slug: 'c', emailMasked: 'c*@partner.example', messageId: 'zzz', items: 4, sentAt: '2026-09-11T09:00:00.000Z' },
    ];
    const merged = mergeRecipients(previous, fresh);
    expect(merged.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
  });

  test('a deliberate re-send replaces that partner entry rather than duplicating it', () => {
    const previous = receiptFor(['a']).recipients;
    const fresh: SurveySendRecipient[] = [
      { slug: 'a', emailMasked: 'a*@partner.example', messageId: 'new', items: 4, sentAt: '2026-09-12T09:00:00.000Z' },
    ];
    const merged = mergeRecipients(previous, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.messageId).toBe('new');
    expect(merged[0]!.sentAt).toBe('2026-09-12T09:00:00.000Z');
  });
});

describe('E11.3 gate does not overclaim what it can see', () => {
  const BLOCKED_TODAY: EsrReadinessInput = {
    sampleCount: 20,
    isFixture: true,
    dbRows: { opportunities: 20, proposals: 20, gateDecisions: 20, cordisProjects: 20 },
    rosterSize: 10,
    undeliverable: 10,
    sendReceipt: null,
    responseCount: 0,
    responsesAreSelfTest: false,
    accuracy: 0.8,
    deadline: '2026-09-21',
    windowDays: 14,
    today: '2026-09-08',
  };

  // The receipt lives in a gitignored directory, so "no receipt" is a statement about this machine
  // and nothing more. Claiming it was "never delivered to anyone" invites a second real send.
  test('a missing receipt is reported as no local proof, not as proof of no send', () => {
    const check = evaluateEsrReadiness(BLOCKED_TODAY).checks.find((c) => c.id === 'survey-sent')!;
    expect(check.detail).not.toMatch(/never been delivered to anyone/);
    expect(check.detail).toMatch(/on this machine/);
    expect(check.detail).toMatch(/gitignored/);
  });

  // 2026-09-21 is 13 days out while partners are owed 14: sending today already breaks it.
  test('a pinned deadline closer than the answering window is reported as unreachable', () => {
    const check = evaluateEsrReadiness(BLOCKED_TODAY).checks.find((c) => c.id === 'deadline')!;
    expect(check.detail).toMatch(/can no longer give partners the 14-day window/);
    expect(check.detail).not.toMatch(/^2026-09-21 is 13 day\(s\) away/);
  });

  test('a deadline that still fits the window is not called unreachable', () => {
    const check = evaluateEsrReadiness({ ...BLOCKED_TODAY, deadline: '2026-09-30' })
      .checks.find((c) => c.id === 'deadline')!;
    expect(check.detail).toMatch(/22 day\(s\) away/);
    expect(check.detail).not.toMatch(/can no longer give/);
  });
});
