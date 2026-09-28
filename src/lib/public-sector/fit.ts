import type { PublicSectorProgramme } from './catalog';

/**
 * "Size uygun mu?" — the three yes/no questions a municipality answers on the
 * radar, and the verdict they lead to. Pure and deterministic: no AI call, no
 * I/O, so the same answers always give the same verdict.
 */

export interface FitAnswers {
  /** Has a Participant Identification Code on the F&T portal. */
  hasPic: boolean;
  /** Has at least one partner organisation lined up. */
  hasPartner: boolean;
  /** Can reserve own budget for co-financing. */
  canCofinance: boolean;
}

export type FitGap = 'pic' | 'partner' | 'cofinancing';

export type FitVerdict = 'fit' | 'prepare' | 'not_eligible';

export interface FitResult {
  verdict: FitVerdict;
  gaps: FitGap[];
}

export type FitRequirements = Pick<
  PublicSectorProgramme,
  'needsPic' | 'needsPartners' | 'cofinancingPct' | 'turkeyEligibility'
>;

/**
 * Which of the three answers does this programme actually need?
 * A `null` co-financing rate means the source did not state one, so the
 * question is still asked — assuming "no co-financing" would tell an
 * unprepared applicant they are ready.
 */
export function requiredChecks(req: FitRequirements): FitGap[] {
  const checks: FitGap[] = [];
  if (req.needsPic) checks.push('pic');
  if (req.needsPartners !== 'none') checks.push('partner');
  if (req.cofinancingPct !== 0) checks.push('cofinancing');
  return checks;
}

export function assessFit(req: FitRequirements, answers: FitAnswers): FitResult {
  if (req.turkeyEligibility === 'not_eligible') return { verdict: 'not_eligible', gaps: [] };
  const have: Record<FitGap, boolean> = {
    pic: answers.hasPic,
    partner: answers.hasPartner,
    cofinancing: answers.canCofinance,
  };
  const gaps = requiredChecks(req).filter((g) => !have[g]);
  return { verdict: gaps.length === 0 ? 'fit' : 'prepare', gaps };
}
