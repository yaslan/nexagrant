import type { DealStage } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  AUTO_TASK_RULES,
  STAGE_ORDER,
  allowedNextStages,
  autoTasksForStage,
  checkStageTransition,
} from '@/modules/m18/server/pipeline-rules';

const ALL: DealStage[] = [...STAGE_ORDER, 'WON', 'REJECTED', 'LOST'];

describe('M18 pipeline — stage transitions', () => {
  it('covers all 12 DealStage values', () => {
    expect(new Set(ALL).size).toBe(12);
  });

  it('moves forward and back one step only', () => {
    expect(checkStageTransition({ from: 'NEW', to: 'QUALIFIED' })).toEqual({ ok: true });
    expect(checkStageTransition({ from: 'PROPOSAL', to: 'ELIGIBILITY_ANALYSIS' })).toEqual({ ok: true });
    expect(checkStageTransition({ from: 'NEW', to: 'CONTACTED' })).toEqual({ ok: false, reason: 'SKIPS_STAGES' });
    expect(checkStageTransition({ from: 'NEW', to: 'NEW' })).toEqual({ ok: false, reason: 'SAME_STAGE' });
  });

  it('LOST needs a non-blank reason', () => {
    expect(checkStageTransition({ from: 'CONTACTED', to: 'LOST' })).toEqual({ ok: false, reason: 'LOST_REASON_REQUIRED' });
    expect(checkStageTransition({ from: 'CONTACTED', to: 'LOST', lostReason: '  ' })).toEqual({ ok: false, reason: 'LOST_REASON_REQUIRED' });
    expect(checkStageTransition({ from: 'CONTACTED', to: 'LOST', lostReason: 'budget' })).toEqual({ ok: true });
  });

  it('WON and REJECTED only after SUBMITTED, and are final', () => {
    expect(checkStageTransition({ from: 'SUBMITTED', to: 'WON' })).toEqual({ ok: true });
    expect(checkStageTransition({ from: 'SUBMITTED', to: 'REJECTED' })).toEqual({ ok: true });
    expect(checkStageTransition({ from: 'PROPOSAL', to: 'WON' })).toEqual({ ok: false, reason: 'OUTCOME_BEFORE_SUBMISSION' });
    for (const from of ['WON', 'REJECTED'] as const) {
      for (const to of ALL.filter((s) => s !== from)) {
        expect(checkStageTransition({ from, to, lostReason: 'x' })).toEqual({ ok: false, reason: 'TERMINAL' });
      }
    }
  });

  it('LOST reopens only to NEW', () => {
    expect(checkStageTransition({ from: 'LOST', to: 'NEW' })).toEqual({ ok: true });
    expect(checkStageTransition({ from: 'LOST', to: 'QUALIFIED' })).toEqual({ ok: false, reason: 'REOPEN_ONLY_TO_NEW' });
  });

  it('lists the allowed next stages', () => {
    expect(allowedNextStages('NEW')).toEqual(['QUALIFIED', 'LOST']);
    expect(allowedNextStages('SUBMITTED')).toEqual(['APPLICATION_PREP', 'WON', 'REJECTED', 'LOST']);
    expect(allowedNextStages('WON')).toEqual([]);
    expect(allowedNextStages('LOST')).toEqual(['NEW']);
  });
});

describe('M18 pipeline — auto tasks', () => {
  const now = new Date('2026-11-13T09:00:00Z');

  it('rule keys are unique and dueInDays positive', () => {
    const rules = Object.values(AUTO_TASK_RULES).flat();
    expect(new Set(rules.map((r) => r!.ruleKey)).size).toBe(rules.length);
    for (const r of rules) expect(r!.dueInDays).toBeGreaterThan(0);
  });

  it('NEW creates the recovered HibeLead first-contact follow-up, due in 2 days', () => {
    expect(autoTasksForStage('NEW', now, [])).toEqual([
      { autoRuleKey: 'new.first-contact', dueAt: new Date('2026-11-15T09:00:00Z') },
    ]);
  });

  it('PROPOSAL creates two tasks; is idempotent per rule key', () => {
    expect(autoTasksForStage('PROPOSAL', now, []).map((t) => t.autoRuleKey)).toEqual(['proposal.send-quote', 'proposal.follow-up']);
    expect(autoTasksForStage('PROPOSAL', now, ['proposal.send-quote', null]).map((t) => t.autoRuleKey)).toEqual([
      'proposal.follow-up',
    ]);
  });

  it('a stage without rules creates nothing', () => {
    expect(autoTasksForStage('REJECTED', now, [])).toEqual([]);
  });
});
