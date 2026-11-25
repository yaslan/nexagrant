import { z } from 'zod';

/**
 * NG-20 Faz 1 — what the consortium screen shows of the G1 gate.
 *
 * The gap and backup rules live in one place, `src/lib/gates/evaluate.ts` (F5/F6 of the NG-20
 * design). This file does not restate them: it only reads the two lists the gate itself stored
 * on its latest decision (`inputs.unfilledCriticalRoles`, `inputs.criticalRolesWithoutBackup`).
 * Running the gate on a page view is not an option — `evaluateGate` files a `GateDecision` and
 * may advance the stage — so the screen shows the last answer and says when it was given.
 *
 * Pure, so a unit test covers the parsing.
 */

/** The fields of `GateDecision.inputs` this screen reads. Anything else in the record is ignored. */
const G1InputsSchema = z.object({
  unfilledCriticalRoles: z.array(z.string()).optional(),
  criticalRolesWithoutBackup: z.array(z.string()).optional(),
});

export type G1ConsortiumSummary = {
  /** ISO time of the decision the lists come from. */
  decidedAt: string;
  passed: boolean;
  /** Role keys of critical seats the gate found not filled. */
  unfilledCriticalRoles: string[];
  /** Role keys of critical seats the gate found without a backup candidate. */
  criticalRolesWithoutBackup: string[];
  /**
   * False when the decision carries neither list: an older record, or a gate configuration
   * that did not check the consortium. The screen must not read that as "no gaps".
   */
  checkedConsortium: boolean;
};

export function g1ConsortiumSummary(
  row: { decidedAt: Date; passed: boolean; inputs: unknown } | null,
): G1ConsortiumSummary | null {
  if (!row) return null;
  const parsed = G1InputsSchema.safeParse(row.inputs);
  const inputs = parsed.success ? parsed.data : {};
  return {
    decidedAt: row.decidedAt.toISOString(),
    passed: row.passed,
    unfilledCriticalRoles: [...new Set(inputs.unfilledCriticalRoles ?? [])],
    criticalRolesWithoutBackup: [...new Set(inputs.criticalRolesWithoutBackup ?? [])],
    checkedConsortium: inputs.unfilledCriticalRoles !== undefined || inputs.criticalRolesWithoutBackup !== undefined,
  };
}
