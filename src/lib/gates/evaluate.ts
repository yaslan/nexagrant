import { prisma } from '../db';
import { DEFAULT_GATE_RULES, DEFAULT_SCORING_WEIGHTS } from '../scoring/defaults';
import { calculateG0Score } from '../scoring/g0';

export type GateEvaluationResult = {
  passed: boolean;
  reasons: string[];
};

export async function evaluateGate(
  opportunityId: string, 
  gateId: 'G0' | 'G1' | 'G2' | 'G3' | 'G4',
  tenantId: string,
  decidedBy: string = 'system'
): Promise<GateEvaluationResult> {
  const rules: any = DEFAULT_GATE_RULES[gateId];
  let passed = true;
  const reasons: string[] = [];

  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      seats: true,
      proposal: true,
      evaluations: true,
    }
  });

  if (!opp) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  const inputs: Record<string, any> = {
    opportunityId: opp.id,
    stage: opp.stage,
    intendedRole: opp.intendedRole,
    g0Score: opp.g0Score,
    seatsCount: opp.seats.length,
    openSeatsCount: opp.seats.filter((s: { status: string }) => s.status === 'OPEN').length,
    evaluationsCount: opp.evaluations.length,
  };

  switch (gateId) {
    case 'G0': {
      const g0Score = opp.g0Score ?? calculateG0Score({
        strategicAlignmentScore: 8,
        technicalCapabilityScore: 8,
        budgetMatchScore: 7,
        partnershipPotentialScore: 7
      }, {
        strategicAlignment: 0.3,
        technicalCapability: 0.3,
        budgetMatch: 0.2,
        partnershipPotential: 0.2
      });
      inputs.calculatedG0Score = g0Score;

      if (g0Score < rules.minScore) {
        passed = false;
        reasons.push(`G0 score ${g0Score} is below minimum threshold ${rules.minScore}`);
      }
      break;
    }
    case 'G1': {
      if (rules.requireCoordinatorHistoryIfCoordinator && opp.intendedRole === 'coordinator') {
        inputs.coordinatorRoleCheck = true;
      }
      break;
    }
    case 'G2': {
      const openSeats = opp.seats.filter((s: { status: string }) => s.status === 'OPEN');
      if (rules.requireAllSeatsFilled && openSeats.length > 0) {
        passed = false;
        reasons.push(`Consortium lock failed: ${openSeats.length} seats are still OPEN`);
      }
      break;
    }
    case 'G3': {
      if (opp.evaluations.length > 0) {
        const latestEval = opp.evaluations[opp.evaluations.length - 1];
        const minScore = Math.min(latestEval.excellence, latestEval.impact, latestEval.implementation);
        const totalScore = latestEval.excellence + latestEval.impact + latestEval.implementation;
        
        inputs.minCriterionScore = minScore;
        inputs.totalScore = totalScore;

        if (minScore < rules.minCriterionScore) {
          passed = false;
          reasons.push(`Criterion score ${minScore} is below minimum required ${rules.minCriterionScore}`);
        }
        if (totalScore < rules.minTotalScore) {
          passed = false;
          reasons.push(`Total evaluation score ${totalScore} is below minimum required ${rules.minTotalScore}`);
        }
      } else {
        inputs.mockEvaluation = true;
      }
      break;
    }
    case 'G4': {
      if (opp.status === 'WITHDRAWN' || opp.status === 'REJECTED') {
        passed = false;
        reasons.push(`Opportunity status is ${opp.status}, submission not permitted`);
      }
      break;
    }
  }

  await prisma.gateDecision.create({
    data: {
      tenantId,
      opportunityId,
      gate: gateId as any,
      passed,
      inputs,
      ruleVersion: '1.0',
      decidedBy,
    }
  });

  if (passed) {
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { stage: gateId as any }
    });
  }

  return { passed, reasons };
}
