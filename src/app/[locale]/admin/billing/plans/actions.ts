'use server';

/**
 * Server actions for the platform plan editor.
 *
 * Every write here changes what the product sells to every tenant, so each one
 * goes through `requirePlatformAdmin()` first — being signed in, or being an
 * admin *of a tenant*, is not enough. The data rules (published versions are
 * immutable, a card bullet cannot name an ungranted module, a plan in use is
 * archived rather than deleted) live in src/lib/billing/plan-repository.ts and
 * hold regardless of who calls them; this file is the authorisation edge.
 *
 * Actions return `{ ok: false, code }` instead of throwing, so the client can
 * show the operator a translated sentence rather than a stack trace. `code` is
 * one of PLAN_FAILURE_CODES and nothing else crosses: the thrown text stays in
 * the server log (TASK-MUNZKR3PEV8EI).
 */

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import {
  createDraftVersion,
  updateDraftVersion,
  publishVersion,
  discardDraftVersion,
  computePublishImpact,
  archivePlan,
  deletePlan,
  setPlanVisibility,
  assignPlanToTenant,
  unassignPlanFromTenant,
  type PlanFeatureInput,
  type PlanVersionDraftInput,
  type PlanVisibility,
  type PublishImpact,
  type AdminPlanVersionRow,
} from '@/lib/billing/plan-repository';
import { grantPilot } from '@/lib/billing/pilot';
import { planFailureCode, type PlanFailureCode } from './failure-codes';

export type ActionFailure = { ok: false; code: PlanFailureCode };

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | ActionFailure;

/**
 * What the browser learns about a failure: a listed code, no text. A refusal
 * the operator can act on (PLAN_IN_USE, …) is expected and logged as a
 * warning; anything else is a fault and its whole error goes to the log.
 */
function planFailure(e: unknown, action: string): ActionFailure {
  const code = planFailureCode(e);
  if (code === 'UNKNOWN') logger.error(`[admin/plans] ${action} failed`, e);
  else logger.warn(`[admin/plans] ${action} refused`, { code });
  return { ok: false, code };
}

function revalidate() {
  revalidatePath('/[locale]/admin/billing/plans', 'page');
}

/**
 * Open a draft and hand the whole row back.
 *
 * The row, not just its id: the editor has to be seeded with what the draft
 * actually contains. Returning only the id left the form at its initial zeros,
 * so the next "save" wrote a $0.00 / 1 seat / 0 credit plan over a draft that
 * had been copied from the live version.
 */
export async function createDraftAction(planId: string): Promise<ActionResult<AdminPlanVersionRow>> {
  try {
    await requirePlatformAdmin();
    const draft = await createDraftVersion(planId);
    revalidate();
    return { ok: true, data: draft };
  } catch (e) {
    return planFailure(e, 'createDraft');
  }
}

export async function saveDraftAction(
  versionId: string,
  body: PlanVersionDraftInput,
  features: PlanFeatureInput[]
): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    await updateDraftVersion(versionId, body, features);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'saveDraft');
  }
}

export async function discardDraftAction(versionId: string): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    await discardDraftVersion(versionId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'discardDraft');
  }
}

/**
 * The mandatory pre-publish measurement.
 *
 * The publish button stays inert until this has returned, because "how many
 * live tenants does this shrink" is the one thing the operator cannot recover
 * after the fact. `publishVersion` re-measures and refuses a mismatch, so the
 * gate is not merely a disabled button.
 */
export async function previewImpactAction(versionId: string): Promise<ActionResult<PublishImpact>> {
  try {
    await requirePlatformAdmin();
    const impact = await computePublishImpact(versionId);
    return { ok: true, data: impact };
  } catch (e) {
    return planFailure(e, 'previewImpact');
  }
}

export async function publishVersionAction(
  versionId: string,
  acknowledgedLoweredTenants: number
): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await publishVersion(versionId, userId, acknowledgedLoweredTenants);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'publishVersion');
  }
}

export async function setVisibilityAction(
  planId: string,
  visibility: PlanVisibility
): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await setPlanVisibility(planId, visibility, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'setVisibility');
  }
}

export async function archivePlanAction(planId: string): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await archivePlan(planId, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'archivePlan');
  }
}

export async function deletePlanAction(planId: string): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await deletePlan(planId, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'deletePlan');
  }
}

export async function assignPlanAction(
  planId: string,
  tenantId: string,
  note: string
): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await assignPlanToTenant(planId, tenantId, userId, note || null);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'assignPlan');
  }
}

export async function unassignPlanAction(planId: string, tenantId: string): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await unassignPlanFromTenant(planId, tenantId, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return planFailure(e, 'unassignPlan');
  }
}

/**
 * Put a tenant on the free 90-day pilot (TASK-MUMABL78X5JLX), or — with
 * `extend` — add 90 days to the one it has. Granting again without `extend`
 * changes nothing and says so (`outcome: 'unchanged'`).
 */
export async function grantPilotAction(
  tenantId: string,
  extend: boolean,
  /** The end the admin saw (ISO), or null for none; omitted → no staleness check. */
  expectedEndsAt?: string | null
): Promise<ActionResult<{ outcome: 'granted' | 'extended' | 'unchanged' | 'stale'; endsAt: string }>> {
  try {
    const { userId } = await requirePlatformAdmin();
    const expected =
      expectedEndsAt === undefined ? undefined : expectedEndsAt === null ? null : new Date(expectedEndsAt);
    // An unparseable date compares unequal to any end, so it answers `stale` and writes nothing.
    const result = await grantPilot(tenantId, userId, { extend, expectedEndsAt: expected });
    revalidate();
    return { ok: true, data: { outcome: result.outcome, endsAt: result.endsAt.toISOString() } };
  } catch (e) {
    return planFailure(e, 'grantPilot');
  }
}
