import type { JsonObject } from '@/types/json';
import { withTenant, type TenantTx } from '../db';
import { isPresentId } from '../required-id';
import { DEFAULT_GATE_RULES } from '../scoring/defaults';
import { computeG0ForOpportunity, g0EvidencePayload, persistG0 } from '../scoring/g0-compute';

export type GateEvaluationResult = {
  passed: boolean;
  reasons: string[];
};

type G1Seat = {
  id: string;
  roleKey: string;
  required: boolean;
  status: string;
  organizationId: string | null;
  partnerOrgId: string | null;
};
type SeatCandidateRef = { seatId: string; organizationId: string | null; partnerOrgId: string | null };

/** A CONFIRMED seat with no organisation confirms nobody (src/modules/m8/server/seat-transitions.ts). */
function isSeatFilled(seat: G1Seat): boolean {
  return seat.status === 'CONFIRMED' && Boolean(seat.organizationId || seat.partnerOrgId);
}

/** A backup is someone other than whoever holds the seat; the matcher can list the holder too. */
function isBackupFor(candidate: SeatCandidateRef, seat: G1Seat): boolean {
  return (
    (candidate.organizationId !== null && candidate.organizationId !== seat.organizationId) ||
    (candidate.partnerOrgId !== null && candidate.partnerOrgId !== seat.partnerOrgId)
  );
}

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
  // Prisma drops an `undefined` key from `where`: the read below would find the tenant's first
  // opportunity and the stage write would advance all of them (TASK-MUN2KUHP1BP18).
  if (!isPresentId(opportunityId) || !isPresentId(tenantId)) throw new GateOpportunityNotFoundError(String(opportunityId), tenantId);
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

  const inputs: JsonObject = {
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
      // Açık karar #8 (2026-09-06): the gate is the composite score (minScore ≥ 70) PLUS the three
      // hard rules (minAlignment ≥ 70, minBaseRate ≥ 8%, country eligible). Both are enforced here,
      // drawn from the `computation.decision` which was already calculated in the canonical scorer.
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

      if (rules.minScore !== null && g0Score < rules.minScore) {
        passed = false;
        reasons.push(`G0 composite score ${g0Score} is below minimum threshold ${rules.minScore}`);
      }

      if (rules.minAlignment !== null && computation?.decision === 'NO_GO' && computation?.reasons?.length > 0) {
        passed = false;
        reasons.push(...computation.reasons);
      }
      break;
    }
    case 'G1': {
      const rules = DEFAULT_GATE_RULES.G1;
      if (rules.requireCoordinatorHistoryIfCoordinator && opp.intendedRole === 'coordinator') {
        inputs.coordinatorRoleCheck = true;
      }

      const criticalSeats = opp.seats.filter((s: G1Seat) => s.required);
      inputs.criticalSeatsCount = criticalSeats.length;
      if (criticalSeats.length === 0) {
        // `required` defaults to true, so this is an opportunity nobody has put a consortium on.
        // No critical role on file proves nothing about the roles being filled.
        passed = false;
        reasons.push('Consortium check failed: no critical seat is defined for this opportunity');
      }

      if (rules.requireCriticalSeatsFilled) {
        const unfilled = criticalSeats.filter((s: G1Seat) => !isSeatFilled(s));
        inputs.unfilledCriticalRoles = unfilled.map((s: G1Seat) => s.roleKey);
        for (const seat of unfilled) {
          passed = false;
          reasons.push(
            seat.status === 'CONFIRMED'
              ? `Critical role ${seat.roleKey} is not filled: the confirmed seat names no organisation`
              : `Critical role ${seat.roleKey} is not filled: seat status is ${seat.status}`,
          );
        }
      }

      if (rules.requireBackupForCriticalSeats) {
        const candidates: SeatCandidateRef[] = await tx.seatCandidate.findMany({
          where: { tenantId, seatId: { in: criticalSeats.map((s: G1Seat) => s.id) } },
          select: { seatId: true, organizationId: true, partnerOrgId: true },
        });
        const withoutBackup = criticalSeats.filter(
          (s: G1Seat) => !candidates.some((c) => c.seatId === s.id && isBackupFor(c, s)),
        );
        inputs.criticalRolesWithoutBackup = withoutBackup.map((s: G1Seat) => s.roleKey);
        for (const seat of withoutBackup) {
          passed = false;
          reasons.push(`Critical role ${seat.roleKey} has no backup candidate`);
        }
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
      // Narrowed off the element, not off `.length`: an evaluations list that is
      // empty — or whose last slot is missing — must take the same "nothing to
      // score against" branch below rather than compare against undefined and
      // let NaN decide a gate. Behaviour for a populated list is unchanged.
      const latestEval = opp.evaluations[opp.evaluations.length - 1];
      if (latestEval) {
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
