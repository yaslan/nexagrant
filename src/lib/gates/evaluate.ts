import { withTenant, type TenantTx } from '../db';
import { DEFAULT_GATE_RULES } from '../scoring/defaults';
import { computeG0ForOpportunity, g0EvidencePayload, persistG0 } from '../scoring/g0-compute';

export type GateEvaluationResult = {
  passed: boolean;
  reasons: string[];
};

/**
 * The opportunity is not visible to this tenant — it does not exist, or it belongs to someone else.
 *
 * Deliberately one error for both cases: telling a caller "exists, but not yours" would confirm
 * that a guessed id is a live opportunity somewhere else in the system. Callers translate this into
 * their own user-facing message; the engine never returns a score or files a decision instead.
 */
export class GateOpportunityNotFoundError extends Error {
  readonly opportunityId: string;
  readonly tenantId: string;

  constructor(opportunityId: string, tenantId: string) {
    super(`Opportunity not visible to tenant: ${opportunityId}`);
    this.name = 'GateOpportunityNotFoundError';
    this.opportunityId = opportunityId;
    this.tenantId = tenantId;
  }
}

/**
 * Runs one stage gate for one opportunity and files the `GateDecision`.
 *
 * Every read and every write here is scoped to `tenantId` twice over: the whole body runs inside
 * `withTenant`, so `app.tenant_id` is set and the RLS policies apply at the database, and each
 * statement still carries its own `tenantId` clause so the engine is correct even against a role
 * that is exempt from RLS (the local `fabrika` superuser is — see `prisma/rls-app-role.sql`).
 *
 * This used to be `findUnique({ where: { id } })` with no tenant clause at all. It was safe only
 * because the single caller checked ownership first; the protection lived in the caller's memory,
 * so the second caller would have opened cross-tenant reads and, worse, cross-tenant *writes* —
 * the stage update below moved whichever opportunity carried the id. Both are closed here, and the
 * caller's check stays as a second layer.
 *
 * Soft-deleted opportunities: `deletedAt` is NOT filtered here. Running a gate is an audit event,
 * not a content edit, and a `GateDecision` that already exists for an archived opportunity must
 * still be explicable. Deciding whether an archived opportunity may be *newly* gated is a product
 * rule and belongs to the caller, which is where the user, the button and the message are; the
 * pipeline action already refuses (`deletedAt: null` in its ownership check). Recorded in
 * docs/agent-results/TASK-MTQZMLLZE1I29-blockzincir-pm.md.
 */
export async function evaluateGate(
  opportunityId: string,
  gateId: 'G0' | 'G1' | 'G2' | 'G3' | 'G4',
  tenantId: string,
  decidedBy: string = 'system'
): Promise<GateEvaluationResult> {
  return withTenant(tenantId, (tx) => runGate(tx, opportunityId, gateId, tenantId, decidedBy));
}

/** The gate itself, on a client that already carries the tenant's RLS context. */
async function runGate(
  tx: TenantTx,
  opportunityId: string,
  gateId: 'G0' | 'G1' | 'G2' | 'G3' | 'G4',
  tenantId: string,
  decidedBy: string
): Promise<GateEvaluationResult> {
  let passed = true;
  const reasons: string[] = [];

  const opp = await tx.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    include: {
      // The relations are reachable only through an opportunity this tenant owns, but they carry
      // their own `tenantId` and are filtered on it too: a mis-parented row must not be able to
      // change a gate outcome (an OPEN seat stamped with another tenant would fail G2 here).
      seats: { where: { tenantId } },
      evaluations: { where: { tenantId } },
    }
  });

  if (!opp) {
    throw new GateOpportunityNotFoundError(opportunityId, tenantId);
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
      const computation = await computeG0ForOpportunity(tx, tenantId, opportunityId);

      if (computation) {
        inputs.g0Evidence = g0EvidencePayload(computation);
        if (computation.score !== null) {
          await persistG0(tx, computation);
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

  await tx.gateDecision.create({
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
    // `updateMany` with the tenant clause, never `update` by id: `update({ where: { id } })` would
    // advance the stage of an opportunity belonging to another tenant if the id ever reached here
    // unchecked. The read above already refuses that id, so this is the second lock on the same
    // door — the write that actually mutates another tenant's row is the one worth double-locking.
    await tx.opportunity.updateMany({
      where: { id: opportunityId, tenantId },
      data: { stage: gateId }
    });
  }

  return { passed, reasons };
}
