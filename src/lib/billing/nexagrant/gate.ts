/**
 * The NexaGrant plan gate on product routes (NG-250). One decision, three refusals with fixed
 * codes the UI translates (`messages/*.json` → `ngGate.*`):
 *
 *   NG_ROLE_FORBIDDEN       — the member's role does not carry the action (`can`, src/lib/rbac.ts);
 *   NG_MODULE_CLOSED        — the module behind the feature (NG_FEATURE_MODULE) is not open;
 *   NG_FEATURE_NOT_IN_PLAN  — the tenant's NexaGrant plan does not grant the feature (a trial
 *                             past its end already counts as its end plan).
 *
 * K-584603 = A: only a tenant with an `NgSubscription` row is a NexaGrant tenant. One without a
 * row passes (`enrolled: false`) whatever the member's role; the route's own role, module and
 * platform checks stand as before.
 *
 * Order (NG-250 r7): the route's own role door, then its module door, then this gate, then the
 * readers. Where the route has its own doors (Partner Search: http.ts), the gate is called after
 * them, so a refused role or a closed module gets the route's body, never an NG code. Where it
 * has none for the role (CORDIS, /api/cagrilar, partners/leaders), NG_ROLE_FORBIDDEN is the
 * enrolled tenant's role door.
 */
import type { TenantTx } from '@/lib/db';
import { can, type Action } from '@/lib/rbac';
import { ngPlanDecision, type NgActor } from './authz';
import type { NgFeatureKey } from './features';
import { readNgBillingState } from './repository';
import { NG_GATE_CODES, type NgGateCode } from './codes';

export { NG_GATE_CODES, type NgGateCode };

export type NgGateDecision =
  | { allowed: true; enrolled: boolean }
  | { allowed: false; code: NgGateCode; feature: NgFeatureKey };

export async function ngFeatureGate(
  tx: TenantTx,
  actor: NgActor,
  action: Action,
  feature: NgFeatureKey,
  now?: Date
): Promise<NgGateDecision> {
  if (!actor.role) return { allowed: false, code: NG_GATE_CODES.roleForbidden, feature };
  // Enrolment first (NG-250 r7): a tenant that is not a NexaGrant tenant meets no NexaGrant
  // refusal at all, the role one included — the route's own door answers a role it does not
  // admit, with the body it has always given (NG-64; tests/e2e/role-gate.spec.ts).
  const state = await readNgBillingState(tx, actor.tenantId, now);
  if (state.source !== 'subscription') return { allowed: true, enrolled: false };
  if (!can(actor.role, action)) return { allowed: false, code: NG_GATE_CODES.roleForbidden, feature };
  const d = await ngPlanDecision(tx, actor, action, feature, state);
  if (d === 'allowed') return { allowed: true, enrolled: true };
  return { allowed: false, code: d === 'module_closed' ? NG_GATE_CODES.moduleClosed : NG_GATE_CODES.notInPlan, feature };
}
