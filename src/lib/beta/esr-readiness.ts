/**
 * E11.3 readiness gate — "can the ESR calibration criterion be closed yet?" (TASK-MTQ2KL3JO4MK2).
 *
 * The card sat in "waiting for partner responses" for days while the chain that produces those
 * responses was never connected: the roster is a placeholder, so `--send` refuses, so no partner
 * was ever asked, so 2026-09-21 could not have produced data no matter who waited. A wait nobody
 * can falsify is not a plan, so the preconditions are checked by a machine instead:
 *
 *   pnpm beta:esr-preflight     # read-only, writes nothing, exits 1 while E11.3 is blocked
 *
 * Every check names the human action that clears it. `blocked` is deliberately conservative — an
 * unreachable database or an unreadable receipt reports as "cannot verify", never as a pass,
 * because the point of the gate is to stop a criterion being closed on an assumption.
 */

import type { SurveySendReceipt } from './esr-send-receipt';

/** Sample count the calibration set is specified at (docs/CORDIS-SAMPLE-CALIBRATION.md). */
export const ESR_EXPECTED_SAMPLES = 20;

/** E11.3 acceptance criterion: G0 ↔ ESR agreement. */
export const ESR_REQUIRED_ACCURACY = 0.85;

/**
 * The blocked checks that form a single causal chain, head first. Each one is a precondition of the
 * next, so the whole tail clears from one human action at the head.
 */
export const CHAIN: readonly string[] = ['roster', 'survey-sent', 'responses', 'accuracy'];

export type ReadinessSeverity = 'ok' | 'warn' | 'blocked';

export interface ReadinessCheck {
  id: string;
  label: string;
  severity: ReadinessSeverity;
  detail: string;
  /** The human action that clears this check. Empty when it passes. */
  fix: string;
}

export interface CalibrationRowCounts {
  opportunities: number;
  proposals: number;
  gateDecisions: number;
  cordisProjects: number;
}

export interface EsrReadinessInput {
  sampleCount: number;
  /** Labels are the curated `SAMPLE-*` fixture rather than confirmed ESR outcomes. */
  isFixture: boolean;
  /** `null` when the database could not be reached — reported as "cannot verify". */
  dbRows: CalibrationRowCounts | null;
  rosterSize: number;
  /** Roster addresses on a reserved, undeliverable domain. */
  undeliverable: number;
  sendReceipt: SurveySendReceipt | null;
  responseCount: number;
  /** The responses came from the committed self-test file, not from partners. */
  responsesAreSelfTest: boolean;
  /** Rule A accuracy, 0–1. `null` when it could not be measured. */
  accuracy: number | null;
  /** Survey deadline the partners are (or would be) given, YYYY-MM-DD. */
  deadline: string;
  /** Today, YYYY-MM-DD — passed in so the gate is testable on any date. */
  today: string;
}

export interface EsrReadinessReport {
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  blocked: boolean;
  summary: string;
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function ok(id: string, label: string, detail: string): ReadinessCheck {
  return { id, label, severity: 'ok', detail, fix: '' };
}

export function evaluateEsrReadiness(input: EsrReadinessInput): EsrReadinessReport {
  const checks: ReadinessCheck[] = [];

  // 1 — the sample set itself.
  checks.push(
    input.sampleCount === ESR_EXPECTED_SAMPLES
      ? ok('samples', 'Sample set parsed', `${input.sampleCount}/${ESR_EXPECTED_SAMPLES} samples`)
      : {
          id: 'samples',
          label: 'Sample set parsed',
          severity: 'blocked',
          detail: `${input.sampleCount}/${ESR_EXPECTED_SAMPLES} samples parsed`,
          fix: 'Restore docs/BETA_DATA/esr-calibration-samples.csv (or point --samples= at the real set).',
        },
  );

  // 2 — the fixture in the database, so the seeded rows a reviewer inspects still exist.
  if (input.dbRows === null) {
    checks.push({
      id: 'fixture-db',
      label: 'Fixture rows in the database',
      severity: 'warn',
      detail: 'database unreachable — cannot verify',
      fix: 'Start Postgres and re-run; the counts are not a pass until they can be read.',
    });
  } else {
    const { opportunities, proposals, gateDecisions, cordisProjects } = input.dbRows;
    const complete =
      opportunities === input.sampleCount &&
      proposals === input.sampleCount &&
      gateDecisions === input.sampleCount &&
      cordisProjects === input.sampleCount;
    checks.push(
      complete
        ? ok('fixture-db', 'Fixture rows in the database', `${opportunities}/${proposals}/${gateDecisions}/${cordisProjects}`)
        : {
            id: 'fixture-db',
            label: 'Fixture rows in the database',
            severity: 'blocked',
            detail: `opportunities ${opportunities}, proposals ${proposals}, gateDecisions ${gateDecisions}, SAMPLE-* projects ${cordisProjects} — expected ${input.sampleCount} of each`,
            fix: 'pnpm beta:esr-calibration --apply   # idempotent upserts, re-runs converge',
          },
    );
  }

  // 3 — a roster that can actually receive mail. This is the head of the blocked chain.
  if (input.rosterSize === 0) {
    checks.push({
      id: 'roster',
      label: 'Design-partner roster is deliverable',
      severity: 'blocked',
      detail: 'roster is empty or missing',
      fix: 'Point --roster= at the real roster (keep it outside the repo — it is PII).',
    });
  } else if (input.undeliverable > 0) {
    checks.push({
      id: 'roster',
      label: 'Design-partner roster is deliverable',
      severity: 'blocked',
      detail: `${input.undeliverable}/${input.rosterSize} addresses sit on a reserved, undeliverable domain — --send refuses`,
      fix: 'HUMAN ACTION: supply the real design-partner addresses. Keep them out of git: docs/BETA_DATA/beta-partners.local.csv (gitignored) or --roster=/secure/path/partners.csv.',
    });
  } else {
    checks.push(ok('roster', 'Design-partner roster is deliverable', `${input.rosterSize} deliverable addresses`));
  }

  // 4 — proof the survey left the building. Rendered worksheets are not proof.
  checks.push(
    input.sendReceipt
      ? ok(
          'survey-sent',
          'Survey actually sent',
          `${input.sendReceipt.recipients.length} recipient(s), last accepted ${input.sendReceipt.sentAt}`,
        )
      : {
          id: 'survey-sent',
          label: 'Survey actually sent',
          severity: 'blocked',
          detail: 'no send receipt — the survey has never been delivered to anyone',
          fix: 'After the roster is real, with explicit approval: pnpm beta:esr-calibration --roster=<real> --survey --send (this sends real mail and cannot be undone).',
        },
  );

  // 5 — partner verdicts. The self-test file must never be mistaken for them.
  if (input.responsesAreSelfTest) {
    checks.push({
      id: 'responses',
      label: 'Partner verdicts ingested',
      severity: 'blocked',
      detail: `${input.responseCount} verdicts read from the committed self-test file — these are not partner answers`,
      fix: 'Ingest the returned worksheets instead: --responses=/secure/path/responses.csv',
    });
  } else if (input.responseCount === 0) {
    checks.push({
      id: 'responses',
      label: 'Partner verdicts ingested',
      severity: 'blocked',
      detail: 'no verdicts ingested — labels are still provisional',
      fix: 'cat <out>/survey/*.responses.csv > /secure/path/responses.csv && pnpm beta:esr-calibration --responses=/secure/path/responses.csv --apply',
    });
  } else {
    checks.push(ok('responses', 'Partner verdicts ingested', `${input.responseCount} verdicts`));
  }

  // 6 — labels the criterion may be closed on.
  checks.push(
    input.isFixture
      ? {
          id: 'labels',
          label: 'Labels are ESR-confirmed',
          severity: 'warn',
          detail: 'sample ids are the curated SAMPLE-* fixture; any accuracy below is provisional',
          fix: 'Re-measure once partner verdicts (or real ESR outcomes) replace the provisional labels.',
        }
      : ok('labels', 'Labels are ESR-confirmed', 'sample set is not the curated fixture'),
  );

  // 7 — the acceptance criterion itself.
  if (input.accuracy === null) {
    checks.push({
      id: 'accuracy',
      label: `Accuracy ≥ ${(ESR_REQUIRED_ACCURACY * 100).toFixed(0)}%`,
      severity: 'blocked',
      detail: 'accuracy could not be measured',
      fix: 'Run pnpm beta:esr-calibration and read the rule A line.',
    });
  } else if (input.accuracy < ESR_REQUIRED_ACCURACY) {
    checks.push({
      id: 'accuracy',
      label: `Accuracy ≥ ${(ESR_REQUIRED_ACCURACY * 100).toFixed(0)}%`,
      severity: 'blocked',
      detail: `rule A ${(input.accuracy * 100).toFixed(1)}% < ${(ESR_REQUIRED_ACCURACY * 100).toFixed(0)}%`,
      fix: 'Rule B is NOT an escape hatch: açık karar #8 closed on 2026-09-06 (patron approval) — the gate rule is rule A (composite ≥ 70 + hard rules) and SPEC_LITERAL_G0_RULES is comparison-only. The only honest route to ≥85% is ESR-confirmed labels, i.e. the blockers above. Moving minScore to fit 20 fixture rows is overfitting and would need a NEW boss decision, not a re-read of #8.',
    });
  } else {
    checks.push(ok('accuracy', `Accuracy ≥ ${(ESR_REQUIRED_ACCURACY * 100).toFixed(0)}%`, `rule A ${(input.accuracy * 100).toFixed(1)}%`));
  }

  // 8 — the deadline. A date nobody was given is not a deadline.
  const daysLeft = daysBetween(input.today, input.deadline);
  if (!input.sendReceipt) {
    checks.push({
      id: 'deadline',
      label: 'Deadline is a real commitment',
      severity: 'warn',
      detail: `${input.deadline} is ${daysLeft >= 0 ? `${daysLeft} day(s) away` : `${-daysLeft} day(s) past`}, but nothing has been sent — no partner has ever seen this date`,
      fix: 'Re-pin ESR_SURVEY_DEADLINE (src/lib/beta/constants.ts) to send-day + 14 when the survey actually goes out.',
    });
  } else if (daysLeft < 0) {
    checks.push({
      id: 'deadline',
      label: 'Deadline is a real commitment',
      severity: 'warn',
      detail: `${input.deadline} passed ${-daysLeft} day(s) ago with ${input.responseCount} verdict(s) in`,
      fix: 'Chase the outstanding partners or re-pin the deadline; do not close the criterion on a short return.',
    });
  } else {
    checks.push(ok('deadline', 'Deadline is a real commitment', `${input.deadline}, ${daysLeft} day(s) left`));
  }

  const blockers = checks.filter((c) => c.severity === 'blocked');
  const warnings = checks.filter((c) => c.severity === 'warn');

  // Checks 3–7 are one chain, not four independent problems: no survey reaches a roster that cannot
  // receive mail, no verdicts come back from a survey nobody got, and — since açık karar #8 closed on
  // 2026-09-06 — the only honest route to ≥85% is verdict-confirmed labels. Naming the head keeps the
  // card from being read as four items needing four owners when one human action clears all of them.
  const chained = blockers.filter((b) => CHAIN.includes(b.id));
  const chainNote =
    chained.length > 1 && chained[0]?.id === CHAIN[0]
      ? ` — one chain, head: ${CHAIN[0]} (human action); ${chained
          .slice(1)
          .map((c) => c.id)
          .join(', ')} cannot clear before it does`
      : '';

  const summary = blockers.length
    ? `E11.3 BLOCKED — ${blockers.length} blocker(s): ${blockers.map((b) => b.id).join(', ')}${chainNote}`
    : warnings.length
      ? `E11.3 has no blockers, ${warnings.length} warning(s): ${warnings.map((w) => w.id).join(', ')}`
      : 'E11.3 acceptance criterion can be closed — every check passes';

  return { checks, blockers, blocked: blockers.length > 0, summary };
}
