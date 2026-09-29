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
 * show the operator a translated sentence rather than a stack trace.
 */

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/tenant';
import { errorMessage } from '@/lib/errors';
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

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; code: string; detail: string };

/** Narrow a thrown value to the stable `code` the UI translates. */
function toFailure(e: unknown): { ok: false; code: string; detail: string } {
  const code =
    typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string'
      ? (e as { code: string }).code
      : 'UNKNOWN';
  return { ok: false, code, detail: errorMessage(e) };
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
    return toFailure(e);
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
    return toFailure(e);
  }
}

export async function discardDraftAction(versionId: string): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    await discardDraftVersion(versionId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return toFailure(e);
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
    return toFailure(e);
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
    return toFailure(e);
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
    return toFailure(e);
  }
}

export async function archivePlanAction(planId: string): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await archivePlan(planId, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return toFailure(e);
  }
}

export async function deletePlanAction(planId: string): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await deletePlan(planId, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return toFailure(e);
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
    return toFailure(e);
  }
}

export async function unassignPlanAction(planId: string, tenantId: string): Promise<ActionResult> {
  try {
    const { userId } = await requirePlatformAdmin();
    await unassignPlanFromTenant(planId, tenantId, userId);
    revalidate();
    return { ok: true };
  } catch (e) {
    return toFailure(e);
  }
}

/**
 * Put a tenant on the free 90-day pilot (TASK-MUMABL78X5JLX), or — with
 * `extend` — add 90 days to the one it has. Granting again without `extend`
 * changes nothing and says so (`outcome: 'unchanged'`).
 */
export async function grantPilotAction(
  tenantId: string,
  extend: boolean
): Promise<ActionResult<{ outcome: 'granted' | 'extended' | 'unchanged'; endsAt: string }>> {
  try {
    const { userId } = await requirePlatformAdmin();
    const result = await grantPilot(tenantId, userId, { extend });
    revalidate();
    return { ok: true, data: { outcome: result.outcome, endsAt: result.endsAt.toISOString() } };
  } catch (e) {
    return toFailure(e);
  }
}
