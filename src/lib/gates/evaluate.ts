import { prisma } from '../db';
import { DEFAULT_GATE_RULES } from '../scoring/defaults';
import { computeG0ForOpportunity, g0EvidencePayload, persistG0 } from '../scoring/g0-compute';

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

  const inputs: Record<string, unknown> = {
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
      const rules = DEFAULT_GATE_RULES.G0;
      // The gate scores the opportunity itself rather than trusting whatever `g0Score` happens to
      // sit in the column. That column used to be filled by a seed literal or by
      // `Math.random() * 15 + 80`, so the gate was deciding on an invented number; now the number
      // is derived here, from stored evidence, by the canonical scorer, and written back with its
      // breakdown so the decision can be audited afterwards.
      //
      // `rules.minScore` is on the 0–100 scale of PROJECT.md:81. Which reading of PROJECT.md:75 is
      // the real gate — this composite minimum, or the three hard rules — is still open
      // (docs/ROADMAP.md · Açık kararlar #8), so the pass/fail rule is left exactly as it was and
      // `decideG0`'s hard-rule findings are recorded as advisory evidence, not enforced here.
      const computation = await computeG0ForOpportunity(prisma, tenantId, opportunityId);

      if (computation) {
        inputs.g0Evidence = g0EvidencePayload(computation);
        if (computation.score !== null) {
          await persistG0(prisma, computation);
        }
      }

      const g0Score = computation?.score ?? null;
      inputs.calculatedG0Score = g0Score;

      if (g0Score === null) {
        // Not a failure on merit: there is no evidence to score this opportunity on. Saying that
        // is the difference between "we assessed you and you fell short" and "we cannot assess
        // you yet"; the outcome (no pass) is unchanged either way.
        passed = false;
        reasons.push('G0 score could not be calculated: no scoring evidence for this opportunity yet');
        break;
      }

      if (g0Score < rules.minScore) {
        passed = false;
        reasons.push(`G0 score ${g0Score} is below minimum threshold ${rules.minScore}`);
      }
      break;
    }
    case 'G1': {
      const rules = DEFAULT_GATE_RULES.G1;
      if (rules.requireCoordinatorHistoryIfCoordinator && opp.intendedRole === 'coordinator') {
        inputs.coordinatorRoleCheck = true;
      }
      break;
    }
    case 'G2': {
      const rules = DEFAULT_GATE_RULES.G2;
      const openSeats = opp.seats.filter((s: { status: string }) => s.status === 'OPEN');
      if (rules.requireAllSeatsFilled && openSeats.length > 0) {
        passed = false;
        reasons.push(`Consortium lock failed: ${openSeats.length} seats are still OPEN`);
      }
      break;
    }
    case 'G3': {
      const rules = DEFAULT_GATE_RULES.G3;
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
      // DEFAULT_GATE_RULES.G4.minHoursBeforeDeadline is not checked here — the
      // gate only refuses withdrawn and rejected opportunities. Recorded in the
      // TASK-MTQ60SGW45T0X report rather than added silently.
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
      gate: gateId,
      passed,
      inputs,
      ruleVersion: '1.0',
      decidedBy,
    }
  });

  if (passed) {
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: { stage: gateId }
    });
  }

  return { passed, reasons };
}
