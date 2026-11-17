import type { DealStage } from '@prisma/client';

/**
 * NG-137 (M18-F2). Which stage a deal may move to, and which follow-up tasks entering a stage
 * creates. Pure: the caller (F3 server action) checks the move, writes `Deal.stage`, a
 * `stage_change` activity and the returned tasks inside one `withTenant` transaction.
 *
 * Written fresh (decision K-581471): HibeLead's `pipeline-rules.ts` is gone and its one
 * recovered auto task ("İlk iletişim için takip et", `auto_rule_key` null) is all that is
 * known of its rules. That task is `new.first-contact` below.
 */

/** The forward path. WON / REJECTED / LOST are outcomes, not steps on it. */
export const STAGE_ORDER: readonly DealStage[] = [
  'NEW',
  'QUALIFIED',
  'CONTACTED',
  'DISCOVERY_MEETING',
  'ELIGIBILITY_ANALYSIS',
  'PROPOSAL',
  'CONTRACT',
  'APPLICATION_PREP',
  'SUBMITTED',
];

/** Terminal: the evaluator's answer (WON / REJECTED) or the client walked away (LOST). */
export const TERMINAL_STAGES: ReadonlySet<DealStage> = new Set<DealStage>(['WON', 'REJECTED', 'LOST']);

export type TransitionRefusal =
  | 'SAME_STAGE'
  | 'TERMINAL'
  | 'SKIPS_STAGES'
  | 'OUTCOME_BEFORE_SUBMISSION'
  | 'LOST_REASON_REQUIRED'
  | 'REOPEN_ONLY_TO_NEW';

export type TransitionCheck = { ok: true } | { ok: false; reason: TransitionRefusal };

export interface TransitionInput {
  from: DealStage;
  to: DealStage;
  /** Required, non-blank, when `to` is LOST. */
  lostReason?: string | null;
}

/**
 * The rule table, in words:
 * - forward one step at a time, back one step to correct a mistake;
 * - LOST from any open stage, with a reason;
 * - WON / REJECTED only from SUBMITTED (only the funder can answer an application);
 * - LOST may be reopened, and only to NEW (it is re-qualified from the start);
 * - WON / REJECTED are final.
 */
export function checkStageTransition({ from, to, lostReason }: TransitionInput): TransitionCheck {
  if (from === to) return { ok: false, reason: 'SAME_STAGE' };
  if (from === 'LOST') return to === 'NEW' ? { ok: true } : { ok: false, reason: 'REOPEN_ONLY_TO_NEW' };
  if (TERMINAL_STAGES.has(from)) return { ok: false, reason: 'TERMINAL' };
  if (to === 'LOST') {
    return lostReason?.trim() ? { ok: true } : { ok: false, reason: 'LOST_REASON_REQUIRED' };
  }
  if (to === 'WON' || to === 'REJECTED') {
    return from === 'SUBMITTED' ? { ok: true } : { ok: false, reason: 'OUTCOME_BEFORE_SUBMISSION' };
  }
  const step = STAGE_ORDER.indexOf(to) - STAGE_ORDER.indexOf(from);
  return step === 1 || step === -1 ? { ok: true } : { ok: false, reason: 'SKIPS_STAGES' };
}

/** Every stage reachable from `from` in one move (LOST listed; it still needs a reason). */
export function allowedNextStages(from: DealStage): DealStage[] {
  const all: DealStage[] = [...STAGE_ORDER, 'WON', 'REJECTED', 'LOST'];
  return all.filter((to) => checkStageTransition({ from, to, lostReason: 'x' }).ok);
}

/**
 * Tasks created when a deal ENTERS a stage. No title text here: F3 renders
 * `m18.autoTasks.<ruleKey>` in the user's locale (CLAUDE.md rule 8) and stores the rendered
 * title on `DealTask.title`, the key on `DealTask.autoRuleKey`.
 */
export interface AutoTaskRule {
  ruleKey: string;
  dueInDays: number;
}

export const AUTO_TASK_RULES: Readonly<Partial<Record<DealStage, readonly AutoTaskRule[]>>> = {
  NEW: [{ ruleKey: 'new.first-contact', dueInDays: 2 }],
  QUALIFIED: [{ ruleKey: 'qualified.contact-decision-maker', dueInDays: 3 }],
  CONTACTED: [{ ruleKey: 'contacted.book-discovery-meeting', dueInDays: 5 }],
  DISCOVERY_MEETING: [{ ruleKey: 'discovery.send-meeting-notes', dueInDays: 1 }],
  ELIGIBILITY_ANALYSIS: [{ ruleKey: 'eligibility.check-call-rules', dueInDays: 3 }],
  PROPOSAL: [
    { ruleKey: 'proposal.send-quote', dueInDays: 2 },
    { ruleKey: 'proposal.follow-up', dueInDays: 7 },
  ],
  CONTRACT: [{ ruleKey: 'contract.collect-signature', dueInDays: 5 }],
  APPLICATION_PREP: [{ ruleKey: 'application.document-checklist', dueInDays: 2 }],
  SUBMITTED: [{ ruleKey: 'submitted.record-reference', dueInDays: 1 }],
  WON: [{ ruleKey: 'won.kickoff', dueInDays: 5 }],
  LOST: [{ ruleKey: 'lost.reengage', dueInDays: 90 }],
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlannedAutoTask {
  autoRuleKey: string;
  dueAt: Date;
}

/**
 * Tasks to create on entering `stage` at `now`. Idempotent: a rule whose key already sits on
 * one of the deal's open (not deleted) tasks is skipped, so a retried transaction or a
 * NEW → QUALIFIED → NEW correction does not pile up duplicates.
 */
export function autoTasksForStage(
  stage: DealStage,
  now: Date,
  existingAutoRuleKeys: Iterable<string | null>
): PlannedAutoTask[] {
  const existing = new Set(existingAutoRuleKeys);
  return (AUTO_TASK_RULES[stage] ?? [])
    .filter((rule) => !existing.has(rule.ruleKey))
    .map((rule) => ({ autoRuleKey: rule.ruleKey, dueAt: new Date(now.getTime() + rule.dueInDays * DAY_MS) }));
}
