/**
 * Plan versioning repository — read-only access to published plan versions.
 *
 * Plans are stored in two layers:
 *   • Plan: the product (free, basic, pro, ultra)
 *   • PlanVersion: a snapshot of the plan at a point in time (version 1, 2, 3, ...)
 *
 * Visibility:
 *   • "public": listed on pricing page, visible to all tenants
 *   • "private": not listed, visible only to assigned tenants
 *   • "archived": no longer active
 *
 * Write access is platform-only. This module provides read-only queries.
 */

import { prisma, withTenant } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { withSystemScope } from '@/lib/system-scope';
import { isContractPlan } from '@/lib/billing/catalog';

export interface PublishedPlanVersion {
  id: string;
  planId: string;
  version: number;
  status: string;
  monthlyCents: number;
  yearlyCents: number;
  currency: string;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
  publishedAt: Date | null;
  plan: {
    name: string;
    visibility: string;
  };
  /**
   * The version's card bullets, in display order. Only the storefront reads
   * (`listPublicPlans`, `plansVisibleToTenant`) select them; a plan made in the
   * studio has no catalogue keys, so these rows are the only copy it has.
   */
  features?: PublishedPlanFeature[];
}

/** One `PlanFeature` row as a storefront card needs it. */
export interface PublishedPlanFeature {
  order: number;
  kind: string;
  moduleId: string | null;
  limitKey: string | null;
  textTr: string | null;
  textEn: string | null;
}

const STOREFRONT_FEATURE_SELECT = {
  orderBy: { order: 'asc' },
  select: { order: true, kind: true, moduleId: true, limitKey: true, textTr: true, textEn: true },
} as const;

/**
 * Fetch the published version of a plan.
 *
 * Returns the highest-versioned row where status = 'published'.
 * Throws if the plan does not exist or has no published version.
 */
export async function getPublishedVersion(planId: string): Promise<PublishedPlanVersion> {
  const version = await prisma.planVersion.findFirst({
    where: {
      planId,
      status: 'published',
    },
    orderBy: { version: 'desc' },
    include: {
      plan: {
        select: {
          name: true,
          visibility: true,
        },
      },
    },
  });

  if (!version) {
    throw new Error(`No published version found for plan ${planId}`);
  }

  return version as PublishedPlanVersion;
}

/**
 * List all plans with visibility = "public" and their latest published versions.
 *
 * Used for the pricing page and public listings.
 */
export async function listPublicPlans(): Promise<
  Array<{
    plan: { id: string; name: string; visibility: string };
    version: PublishedPlanVersion;
  }>
> {
  const plans = await prisma.plan.findMany({
    where: { visibility: 'public' },
    select: {
      id: true,
      name: true,
      // `visibility` is read back below. It was missing from this select, so
      // every row this function returned reported `visibility: undefined` while
      // the filter above had already proved it was 'public'.
      visibility: true,
      versions: {
        where: { status: 'published' },
        orderBy: { version: 'desc' },
        take: 1,
        include: {
          plan: {
            select: {
              name: true,
              visibility: true,
            },
          },
          features: STOREFRONT_FEATURE_SELECT,
        },
      },
    },
  });

  return plans
    .filter((plan: typeof plans[0]) => plan.versions.length > 0)
    .map((plan: typeof plans[0]) => ({
      plan: { id: plan.id, name: plan.name, visibility: plan.visibility },
      version: plan.versions[0] as PublishedPlanVersion,
    }));
}

/**
 * List all plans visible to a tenant.
 *
 * Visibility rules:
 *   • Plans with visibility = "public" (everyone sees them)
 *   • Plans assigned to this tenant via PlanAssignment (private plans)
 *
 * Excludes archived plans.
 */
export async function plansVisibleToTenant(tenantId: string): Promise<
  Array<{
    plan: { id: string; name: string; visibility: string };
    version: PublishedPlanVersion;
  }>
> {
  // PlanAssignment is tenant-scoped, so this read goes through withTenant
  // (CLAUDE.md rule 1) rather than the bare singleton. It is not a formality:
  // measured on 2026-09-08, the same query on the app role fabrika_app
  // (NOBYPASSRLS, which is what production runs as) returns zero rows without
  // `app.tenant_id` set, because tenant_isolation compares tenantId against a
  // setting that is NULL. The `where: { tenantId }` filter looks like it is
  // doing the scoping, but the policy answers first — so a private plan
  // vanished from the very tenant it had been assigned to, while the same call
  // on the local SUPERUSER role showed it and looked correct.
  //
  // The return type is named rather than inferred for the same reason as the
  // `rows` cast below: with `prisma generate` run the delegate is precisely
  // typed and with src/types/prisma-override.d.ts it is `any`, so an inferred
  // result is `unknown` in one world and `any` in the other.
  const assignments = await withTenant<Array<{ planId: string }>>(tenantId, (tx) =>
    tx.planAssignment.findMany({
      where: { tenantId },
      select: { planId: true },
    })
  );
  const assignedPlanIds = assignments.map((assign) => assign.planId);

  // Query: (visibility = 'public' OR planId IN assignedPlanIds) AND visibility != 'archived'
  const plans = await prisma.plan.findMany({
    where: {
      AND: [
        {
          OR: [
            { visibility: 'public' },
            { id: { in: assignedPlanIds } },
          ],
        },
        { visibility: { not: 'archived' } },
      ],
    },
    select: {
      id: true,
      name: true,
      visibility: true,
      versions: {
        where: { status: 'published' },
        orderBy: { version: 'desc' },
        take: 1,
        include: {
          plan: {
            select: {
              name: true,
              visibility: true,
            },
          },
          features: STOREFRONT_FEATURE_SELECT,
        },
      },
    },
  });

  // Named rather than inferred, and named rather than `any`, because this file
  // has to type-check in two different worlds: with `prisma generate` run the
  // delegate is precisely typed, without it src/types/prisma-override.d.ts
  // makes it `any`. An inferred callback parameter is an implicit-any error in
  // the second world; an explicit `any` is a lint error in the first. A local
  // shape is correct in both, and unlike `any` it still fails if the query's
  // `select` stops returning one of these fields.
  const rows = plans as unknown as Array<{
    id: string;
    name: string;
    visibility: string;
    versions: PublishedPlanVersion[];
  }>;

  return rows
    .filter((plan) => plan.versions.length > 0)
    .map((plan) => ({
      plan: { id: plan.id, name: plan.name, visibility: plan.visibility },
      version: plan.versions[0] as PublishedPlanVersion,
    }));
}

/**
 * The id of the version a plan sells right now, or `null` if it sells none.
 *
 * The non-throwing twin of {@link getPublishedVersion}, for the two callers
 * that have to cope with a plan that has no published version rather than fail:
 * the subscription writers (a purchase must not be lost because the studio left
 * a plan unpublished) and the backfill.
 */
export async function publishedVersionIdFor(planId: string): Promise<string | null> {
  const row = await prisma.planVersion.findFirst({
    where: { planId, status: 'published' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  return (row?.id as string | undefined) ?? null;
}

/**
 * Fetch a specific published version by ID (direct lookup).
 *
 * Used internally to resolve a planVersionId to its details.
 */
export async function getVersionById(planVersionId: string): Promise<PublishedPlanVersion | null> {
  const version = await prisma.planVersion.findUnique({
    where: { id: planVersionId },
    include: {
      plan: {
        select: {
          name: true,
          visibility: true,
        },
      },
    },
  });

  if (!version || version.status !== 'published') {
    return null;
  }

  return version as PublishedPlanVersion;
}

// ───────────────────────── write layer (platform admin only) ─────────────────────────
//
// Callers: src/app/[locale]/admin/billing/plans/actions.ts, which is behind
// `requirePlatformAdmin()`. These functions do not re-check the session — they
// enforce the *data* rules, which hold no matter who is calling:
//
//   1. A published version is immutable. Editing one produces a new draft.
//   2. A publish that lowers a live tenant's limits requires the caller to have
//      been shown, and to echo back, how many tenants it hits.
//   3. A card bullet may not name a module the version does not grant.
//   4. A plan with a live subscription is archived, never deleted.
//   5. Every publish, archive and assignment writes an AuditEvent.

/** Subscription states that mean a tenant is actually living on the plan. */
const LIVE_SUB_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'] as const;

/** Version states, narrowed so a typo cannot invent a fourth one. */
export type PlanVersionStatus = 'draft' | 'published' | 'archived';

/** Plan visibility states. */
export type PlanVisibility = 'public' | 'private' | 'archived';

export class PublishedVersionImmutableError extends Error {
  readonly code = 'PUBLISHED_VERSION_IMMUTABLE';
  constructor(versionId: string) {
    super(`Plan version ${versionId} is published and cannot be edited. Create a new draft instead.`);
    this.name = 'PublishedVersionImmutableError';
  }
}

export class ImpactNotAcknowledgedError extends Error {
  readonly code = 'IMPACT_NOT_ACKNOWLEDGED';
  constructor(readonly expected: number, readonly acknowledged: number | undefined) {
    super(
      `Publish refused: this change lowers limits for ${expected} live tenant(s); ` +
        `the caller acknowledged ${acknowledged ?? 'nothing'}.`
    );
    this.name = 'ImpactNotAcknowledgedError';
  }
}

export class ModuleNotGrantedError extends Error {
  readonly code = 'MODULE_NOT_GRANTED';
  constructor(readonly moduleId: string) {
    super(`Feature row names module ${moduleId}, which this plan version does not grant.`);
    this.name = 'ModuleNotGrantedError';
  }
}

export class PlanInUseError extends Error {
  readonly code = 'PLAN_IN_USE';
  constructor(readonly planId: string, readonly liveSubscriptions: number) {
    super(`Plan ${planId} has ${liveSubscriptions} live subscription(s) and cannot be deleted. Archive it instead.`);
    this.name = 'PlanInUseError';
  }
}

/**
 * A contract plan was assigned to a tenant that is paying through a provider.
 * Overwriting that row would detach a live Stripe/iyzico subscription from the
 * tenant while the provider keeps charging it; the operator cancels it first.
 */
export class LiveProviderSubscriptionError extends Error {
  readonly code = 'LIVE_PROVIDER_SUBSCRIPTION';
  constructor(readonly tenantId: string, readonly provider: string) {
    super(`Tenant ${tenantId} has a live ${provider} subscription; cancel it before assigning a contract plan.`);
    this.name = 'LiveProviderSubscriptionError';
  }
}

/** A contract plan with no published version has no terms to put a tenant on. */
export class NoPublishedVersionError extends Error {
  readonly code = 'NO_PUBLISHED_VERSION';
  constructor(readonly planId: string) {
    super(`Plan ${planId} has no published version to assign.`);
    this.name = 'NoPublishedVersionError';
  }
}

/** `Subscription.provider` for a plan sold by contract, not through a PSP. */
export const CONTRACT_PROVIDER = 'contract';

/** The editable body of a version — everything a draft may change. */
export interface PlanVersionDraftInput {
  monthlyCents: number;
  yearlyCents: number;
  currency: string;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
}

/** One card bullet. `module` rows are checked against the version's grant. */
export interface PlanFeatureInput {
  order: number;
  kind: 'module' | 'limit' | 'text';
  moduleId?: string | null;
  limitKey?: string | null;
  textTr?: string | null;
  textEn?: string | null;
}

export interface AdminPlanVersionRow {
  id: string;
  planId: string;
  version: number;
  status: string;
  monthlyCents: number;
  yearlyCents: number;
  currency: string;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
  publishedAt: Date | null;
  publishedBy: string | null;
  features: Array<{
    id: string;
    order: number;
    kind: string;
    moduleId: string | null;
    limitKey: string | null;
    textTr: string | null;
    textEn: string | null;
  }>;
}

export interface AdminPlanRow {
  id: string;
  name: string;
  visibility: string;
  liveSubscriptions: number;
  versions: AdminPlanVersionRow[];
  assignments: Array<{ id: string; tenantId: string; tenantName: string; note: string | null; assignedAt: Date }>;
}

/**
 * Everything the admin plan screen renders: every plan, every version (drafts
 * included), its card bullets, its live-subscription count and, for private
 * plans, the tenants it is assigned to.
 */
export async function listPlansForAdmin(): Promise<AdminPlanRow[]> {
  const plans = await withSystemScope('platform-admin', 'plan-admin.listPlans', (tx) =>
    tx.plan.findMany({
      orderBy: { monthlyCents: 'asc' },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { features: { orderBy: { order: 'asc' } } },
        },
        assignments: { include: { tenant: { select: { name: true } } } },
      },
    })
  );

  // "How many live subscriptions does each plan have" is a cross-tenant count by
  // definition — the answer is a number per plan, never one tenant's rows.
  const counts = await withSystemScope('platform-aggregate', 'plan-admin.liveCountByPlan', (tx) =>
    tx.subscription.groupBy({
      by: ['planId'],
      where: { status: { in: [...LIVE_SUB_STATUSES] } },
      _count: { _all: true },
    })
  );
  const liveByPlan = new Map<string, number>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    counts.map((row: any) => [row.planId as string, row._count._all as number])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return plans.map((plan: any) => ({
    id: plan.id,
    name: plan.name,
    visibility: plan.visibility,
    liveSubscriptions: liveByPlan.get(plan.id) ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    versions: plan.versions.map((v: any) => ({
      id: v.id,
      planId: v.planId,
      version: v.version,
      status: v.status,
      monthlyCents: v.monthlyCents,
      yearlyCents: v.yearlyCents,
      currency: v.currency,
      seats: v.seats,
      workspaces: v.workspaces,
      aiCreditsMonthly: v.aiCreditsMonthly,
      modules: v.modules,
      publishedAt: v.publishedAt,
      publishedBy: v.publishedBy,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      features: v.features.map((f: any) => ({
        id: f.id,
        order: f.order,
        kind: f.kind,
        moduleId: f.moduleId,
        limitKey: f.limitKey,
        textTr: f.textTr,
        textEn: f.textEn,
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments: plan.assignments.map((a: any) => ({
      id: a.id,
      tenantId: a.tenantId,
      tenantName: a.tenant?.name ?? a.tenantId,
      note: a.note,
      assignedAt: a.assignedAt,
    })),
  }));
}

/**
 * Open a draft for a plan.
 *
 * This is the *only* way to change what a plan sells. The new draft is seeded
 * from the latest version (published or not) so the admin edits a copy of what
 * is live, and it takes the next version number. If a draft is already open it
 * is returned as-is rather than stacking a second one — two open drafts of the
 * same plan have no defined publish order.
 */
export async function createDraftVersion(planId: string): Promise<AdminPlanVersionRow> {
  const existingDraft = await prisma.planVersion.findFirst({
    where: { planId, status: 'draft' },
    orderBy: { version: 'desc' },
    include: { features: { orderBy: { order: 'asc' } } },
  });
  if (existingDraft) return existingDraft as AdminPlanVersionRow;

  const latest = await prisma.planVersion.findFirst({
    where: { planId },
    orderBy: { version: 'desc' },
    include: { features: { orderBy: { order: 'asc' } } },
  });

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const base = latest ?? plan;
  const draft = await prisma.planVersion.create({
    data: {
      planId,
      version: (latest?.version ?? 0) + 1,
      status: 'draft',
      monthlyCents: base.monthlyCents,
      yearlyCents: base.yearlyCents,
      currency: base.currency,
      seats: base.seats,
      workspaces: base.workspaces,
      aiCreditsMonthly: base.aiCreditsMonthly,
      modules: base.modules,
      features: latest
        ? {
            create: latest.features.map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (f: any) => ({
                order: f.order,
                kind: f.kind,
                moduleId: f.moduleId,
                limitKey: f.limitKey,
                textTr: f.textTr,
                textEn: f.textEn,
              })
            ),
          }
        : undefined,
    },
    include: { features: { orderBy: { order: 'asc' } } },
  });

  return draft as AdminPlanVersionRow;
}

/**
 * Validate the card bullets against the version's module grant.
 *
 * The grant list is the version's own `modules`, not the plan's — a draft that
 * drops M6 must not keep an "Evaluator Lens" bullet that would still be on the
 * pricing card. Rows naming a module outside the grant, or a module that is not
 * in `ModuleCatalog` at all, are refused rather than silently dropped.
 */
export async function assertFeaturesWithinGrant(
  features: PlanFeatureInput[],
  grantedModules: string[]
): Promise<void> {
  const moduleRows = features.filter((f) => f.kind === 'module');
  if (moduleRows.length === 0) return;

  const granted = new Set(grantedModules);
  for (const row of moduleRows) {
    if (!row.moduleId || !granted.has(row.moduleId)) {
      throw new ModuleNotGrantedError(row.moduleId ?? '(empty)');
    }
  }

  const known = await prisma.moduleCatalog.findMany({
    where: { id: { in: moduleRows.map((f) => f.moduleId as string) } },
    select: { id: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knownIds = new Set(known.map((m: any) => m.id as string));
  for (const row of moduleRows) {
    if (!knownIds.has(row.moduleId as string)) {
      throw new ModuleNotGrantedError(row.moduleId as string);
    }
  }
}

/**
 * Write the body and the card bullets of a draft.
 *
 * Refuses on anything that is not a draft. This is the immutability rule: a
 * published version is the terms a tenant bought under, so it is never edited
 * in place — {@link createDraftVersion} makes the next one.
 */
export async function updateDraftVersion(
  versionId: string,
  body: PlanVersionDraftInput,
  features: PlanFeatureInput[]
): Promise<AdminPlanVersionRow> {
  // Admin action input: a missing id would drop out of the `deleteMany` below (TASK-MUN2KUHP1BP18).
  requireActionId(versionId, 'versionId');
  const current = await prisma.planVersion.findUnique({ where: { id: versionId } });
  if (!current) throw new Error(`Plan version ${versionId} not found`);
  if (current.status !== 'draft') throw new PublishedVersionImmutableError(versionId);

  await assertFeaturesWithinGrant(features, body.modules);

  await prisma.planFeature.deleteMany({ where: { planVersionId: versionId } });
  const updated = await prisma.planVersion.update({
    where: { id: versionId },
    data: {
      ...body,
      features: {
        create: features.map((f) => ({
          order: f.order,
          kind: f.kind,
          moduleId: f.kind === 'module' ? f.moduleId ?? null : null,
          limitKey: f.kind === 'limit' ? f.limitKey ?? null : null,
          textTr: f.textTr ?? null,
          textEn: f.textEn ?? null,
        })),
      },
    },
    include: { features: { orderBy: { order: 'asc' } } },
  });

  return updated as AdminPlanVersionRow;
}

export interface PublishImpact {
  /** Tenants living on this plan whose limits or modules would shrink. */
  loweredTenantCount: number;
  /** All tenants living on this plan, lowered or not. */
  liveTenantCount: number;
  /** Which dimensions shrink, for the warning text. */
  lowered: Array<'seats' | 'workspaces' | 'aiCreditsMonthly' | 'modules'>;
  /** Modules the currently published version grants and the draft does not. */
  removedModules: string[];
}

/**
 * What publishing this draft would do to tenants already on the plan.
 *
 * Compared against the version currently published (the terms live tenants are
 * on), not against the Plan row, because the Plan row is a projection and can
 * lag. A plan with no published version yet has nothing to lower.
 */
export async function computePublishImpact(versionId: string): Promise<PublishImpact> {
  const draft = await prisma.planVersion.findUnique({ where: { id: versionId } });
  if (!draft) throw new Error(`Plan version ${versionId} not found`);

  // How many tenants a publish would touch: a question about the whole estate.
  const liveTenantCount = await withSystemScope(
    'platform-aggregate',
    'plan-admin.publishImpactCount',
    (tx) =>
      tx.subscription.count({
        where: { planId: draft.planId, status: { in: [...LIVE_SUB_STATUSES] } },
      })
  );

  const current = await prisma.planVersion.findFirst({
    where: { planId: draft.planId, status: 'published' },
    orderBy: { version: 'desc' },
  });

  if (!current) {
    return { loweredTenantCount: 0, liveTenantCount, lowered: [], removedModules: [] };
  }

  const lowered: PublishImpact['lowered'] = [];
  if (draft.seats < current.seats) lowered.push('seats');
  if (draft.workspaces < current.workspaces) lowered.push('workspaces');
  if (draft.aiCreditsMonthly < current.aiCreditsMonthly) lowered.push('aiCreditsMonthly');

  const draftModules = new Set<string>(draft.modules);
  const removedModules = (current.modules as string[]).filter((m) => !draftModules.has(m));
  if (removedModules.length > 0) lowered.push('modules');

  return {
    loweredTenantCount: lowered.length > 0 ? liveTenantCount : 0,
    liveTenantCount,
    lowered,
    removedModules,
  };
}

/**
 * Publish a draft.
 *
 * `acknowledgedLoweredTenants` is the number the operator was shown in the
 * confirmation. It must equal the number measured here, so the publish button
 * cannot fire before the warning has been computed and displayed, and a stale
 * screen (the count moved while the dialog was open) is refused rather than
 * published blind.
 *
 * Publishing archives the previously published version — versions are a
 * history, so the old terms stay readable for the subscriptions that point at
 * them — and mirrors the new body onto the Plan projection so existing readers
 * of `Plan` stay in step.
 *
 * It also **moves every live subscription on the plan onto the new version**
 * (TASK-MTSJH8NMAXPRM). That is what `acknowledgedLoweredTenants` has always
 * been about: the operator is shown "this lowers limits for N live tenants" and
 * has to echo the number back, which only means anything if the publish reaches
 * those tenants. Before this, it reached none of them — the price on the
 * shopfront moved and `getEntitlements` still read the compiled catalogue, so
 * raising Pro to 10 seats gave nobody a tenth seat. `Subscription.planVersionId`
 * is the join, and this is the write that keeps it current.
 *
 * Writes one AuditEvent carrying before, after, and how many subscriptions moved.
 */
export async function publishVersion(
  versionId: string,
  actorId: string | null,
  acknowledgedLoweredTenants: number
): Promise<AdminPlanVersionRow> {
  const draft = await prisma.planVersion.findUnique({
    where: { id: versionId },
    include: { features: { orderBy: { order: 'asc' } } },
  });
  if (!draft) throw new Error(`Plan version ${versionId} not found`);
  if (draft.status !== 'draft') throw new PublishedVersionImmutableError(versionId);

  await assertFeaturesWithinGrant(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    draft.features.map((f: any) => ({ order: f.order, kind: f.kind, moduleId: f.moduleId })),
    draft.modules
  );

  const impact = await computePublishImpact(versionId);
  if (impact.loweredTenantCount !== acknowledgedLoweredTenants) {
    throw new ImpactNotAcknowledgedError(impact.loweredTenantCount, acknowledgedLoweredTenants);
  }

  const previous = await prisma.planVersion.findFirst({
    where: { planId: draft.planId, status: 'published' },
    orderBy: { version: 'desc' },
  });

  // System scope, not a bare transaction: the AuditEvent below has no tenant,
  // and strict tenant_isolation refuses that row outside system scope
  // (TASK-MULUJ8O4JH1PF). The subscription move is estate-wide for the same
  // reason.
  const published = await withSystemScope('platform-admin', 'plan-admin.publishVersion', async (tx) => {
    if (previous) {
      await tx.planVersion.update({ where: { id: previous.id }, data: { status: 'archived' } });
    }
    const row = await tx.planVersion.update({
      where: { id: versionId },
      data: { status: 'published', publishedAt: new Date(), publishedBy: actorId },
      include: { features: { orderBy: { order: 'asc' } } },
    });
    await tx.plan.update({
      where: { id: draft.planId },
      data: {
        monthlyCents: draft.monthlyCents,
        yearlyCents: draft.yearlyCents,
        currency: draft.currency,
        seats: draft.seats,
        workspaces: draft.workspaces,
        aiCreditsMonthly: draft.aiCreditsMonthly,
        modules: draft.modules,
      },
    });
    // Every live tenant on this plan now lives under the new terms. Scoped to
    // LIVE_SUB_STATUSES on purpose: a CANCELED row keeps the version it ended
    // on, so the history still says what it was sold under.
    const moved = await tx.subscription.updateMany({
      where: { planId: draft.planId, status: { in: [...LIVE_SUB_STATUSES] } },
      data: { planVersionId: versionId },
    });
    await tx.auditEvent.create({
      data: {
        type: 'plan.version.published',
        actorId,
        target: `${draft.planId}#v${draft.version}`,
        data: {
          planId: draft.planId,
          versionId,
          version: draft.version,
          impact: {
            loweredTenantCount: impact.loweredTenantCount,
            liveTenantCount: impact.liveTenantCount,
            lowered: impact.lowered,
            removedModules: impact.removedModules,
          },
          movedSubscriptions: moved.count,
          before: previous
            ? {
                versionId: previous.id,
                version: previous.version,
                monthlyCents: previous.monthlyCents,
                yearlyCents: previous.yearlyCents,
                seats: previous.seats,
                workspaces: previous.workspaces,
                aiCreditsMonthly: previous.aiCreditsMonthly,
                modules: previous.modules,
              }
            : null,
          after: {
            versionId,
            version: draft.version,
            monthlyCents: draft.monthlyCents,
            yearlyCents: draft.yearlyCents,
            seats: draft.seats,
            workspaces: draft.workspaces,
            aiCreditsMonthly: draft.aiCreditsMonthly,
            modules: draft.modules,
          },
        },
      },
    });
    return row;
  });

  return published as AdminPlanVersionRow;
}

/** Discard an unpublished draft. Refuses anything already published. */
export async function discardDraftVersion(versionId: string): Promise<void> {
  const draft = await prisma.planVersion.findUnique({ where: { id: versionId } });
  if (!draft) throw new Error(`Plan version ${versionId} not found`);
  if (draft.status !== 'draft') throw new PublishedVersionImmutableError(versionId);
  await prisma.planVersion.delete({ where: { id: versionId } });
}

/** How many tenants are actually living on a plan right now. */
export async function countLiveSubscriptions(planId: string): Promise<number> {
  return withSystemScope('platform-aggregate', 'plan-admin.countLiveSubscriptions', (tx) =>
    tx.subscription.count({ where: { planId, status: { in: [...LIVE_SUB_STATUSES] } } })
  );
}

/**
 * Retire a plan.
 *
 * A plan somebody is paying for is never deleted: deleting it would orphan the
 * subscription that points at it and erase the terms it was sold under. It is
 * archived — off the shopfront, still resolvable by everything that references
 * it. Deletion is only offered for a plan nobody is on, and even then it is
 * refused here if a live subscription appears between the screen and the call.
 */
export async function archivePlan(planId: string, actorId: string | null): Promise<void> {
  // Platform event, no tenant: its AuditEvent is written in system scope
  // (TASK-MULUJ8O4JH1PF). Same for deletePlan and setPlanVisibility below.
  await withSystemScope('platform-admin', 'plan-admin.archivePlan', async (tx) => {
    await tx.plan.update({ where: { id: planId }, data: { visibility: 'archived' } });
    await tx.auditEvent.create({
      data: { type: 'plan.archived', actorId, target: planId, data: { planId } },
    });
  });
}

/** Delete a plan — only when nothing live points at it. Otherwise archive. */
export async function deletePlan(planId: string, actorId: string | null): Promise<void> {
  // Admin action input: a missing id would count every live subscription and then
  // clear every plan's assignments and versions (TASK-MUN2KUHP1BP18).
  requireActionId(planId, 'planId');
  const live = await countLiveSubscriptions(planId);
  if (live > 0) throw new PlanInUseError(planId, live);

  await withSystemScope('platform-admin', 'plan-admin.deletePlan', async (tx) => {
    await tx.planAssignment.deleteMany({ where: { planId } });
    await tx.planVersion.deleteMany({ where: { planId } });
    await tx.plan.delete({ where: { id: planId } });
    await tx.auditEvent.create({
      data: { type: 'plan.deleted', actorId, target: planId, data: { planId } },
    });
  });
}

/** Set a plan's shopfront visibility: public, private (assigned only), archived. */
export async function setPlanVisibility(
  planId: string,
  visibility: PlanVisibility,
  actorId: string | null
): Promise<void> {
  const before = await prisma.plan.findUnique({ where: { id: planId }, select: { visibility: true } });
  await withSystemScope('platform-admin', 'plan-admin.setPlanVisibility', async (tx) => {
    await tx.plan.update({ where: { id: planId }, data: { visibility } });
    await tx.auditEvent.create({
      data: {
        type: 'plan.visibility.changed',
        actorId,
        target: planId,
        data: { planId, before: before?.visibility ?? null, after: visibility },
      },
    });
  });
}

/**
 * Give a private plan to one tenant. Idempotent on (plan, tenant).
 *
 * For an ordinary private plan this only makes the plan *visible* to the tenant
 * — the tenant still buys it at checkout. A contract plan (the public-sector
 * packages, `isContractPlan`) is never bought at checkout, so assigning it is
 * the sale: the same transaction puts the tenant's `Subscription` on the plan's
 * published version, `ACTIVE`, yearly, provider `contract`. That row is what
 * `getEntitlements` reads, so the modules and the seat limit follow at once.
 * No invoice is issued here (e-Fatura, TASK-MTRJSOWFH6B45).
 */
export async function assignPlanToTenant(
  planId: string,
  tenantId: string,
  actorId: string | null,
  note?: string | null
): Promise<void> {
  const contract = isContractPlan(planId);
  const planVersionId = contract ? await publishedVersionIdFor(planId) : null;
  if (contract && !planVersionId) throw new NoPublishedVersionError(planId);

  // PlanAssignment, Subscription and AuditEvent are tenant-scoped, so the
  // writes run inside withTenant (CLAUDE.md rule 1) — one tenant, one scope.
  await withTenant(tenantId, async (tx) => {
    await tx.planAssignment.upsert({
      where: { planId_tenantId: { planId, tenantId } },
      create: { planId, tenantId, assignedBy: actorId, note: note ?? null },
      update: { assignedBy: actorId, note: note ?? null },
    });

    let previousPlanId: string | null = null;
    if (contract) {
      const existing = (await tx.subscription.findUnique({
        where: { tenantId },
        select: { planId: true, status: true, provider: true, providerSubId: true },
      })) as { planId: string; status: string; provider: string; providerSubId: string | null } | null;
      previousPlanId = existing?.planId ?? null;
      if (
        existing &&
        existing.provider !== CONTRACT_PROVIDER &&
        existing.providerSubId &&
        (LIVE_SUB_STATUSES as readonly string[]).includes(existing.status)
      ) {
        throw new LiveProviderSubscriptionError(tenantId, existing.provider);
      }

      const terms = {
        planId,
        planVersionId,
        status: 'ACTIVE' as const,
        billingInterval: 'year',
        provider: CONTRACT_PROVIDER,
        providerSubId: null,
        trialEndsAt: null,
      };
      await tx.subscription.upsert({
        where: { tenantId },
        create: { tenantId, ...terms },
        update: terms,
      });
    }

    await tx.auditEvent.create({
      data: {
        type: 'plan.assigned',
        actorId,
        tenantId,
        target: planId,
        data: contract
          ? { planId, tenantId, note: note ?? null, contract: true, planVersionId, previousPlanId }
          : { planId, tenantId, note: note ?? null },
      },
    });
  });
}

/**
 * Take a private plan away from a tenant. For a contract plan the tenant's
 * subscription on it is cancelled too, which drops it back to the fallback
 * plan's entitlements; a subscription the tenant has since moved to another
 * plan or provider is left alone.
 */
export async function unassignPlanFromTenant(
  planId: string,
  tenantId: string,
  actorId: string | null
): Promise<void> {
  requireActionId(planId, 'planId');
  const contract = isContractPlan(planId);
  await withTenant(tenantId, async (tx) => {
    await tx.planAssignment.deleteMany({ where: { planId, tenantId } });
    const cancelled = contract
      ? ((await tx.subscription.updateMany({
          where: { tenantId, planId, provider: CONTRACT_PROVIDER, status: { not: 'CANCELED' } },
          data: { status: 'CANCELED' },
        })) as { count: number }).count
      : 0;
    await tx.auditEvent.create({
      data: {
        type: 'plan.unassigned',
        actorId,
        tenantId,
        target: planId,
        data: contract ? { planId, tenantId, contract: true, cancelledSubscriptions: cancelled } : { planId, tenantId },
      },
    });
  });
}

/** The module rows the card editor may pick from. */
export async function listCatalogModules(): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.moduleCatalog.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ id: r.id as string, name: r.name as string }));
}

/** Tenants the assignment picker offers. */
export async function listTenantsForAssignment(): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.tenant.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({ id: r.id as string, name: r.name as string }));
}

/** The publish history of one plan, newest first — the version-history panel. */
export async function listVersionHistory(planId: string): Promise<AdminPlanVersionRow[]> {
  const rows = await prisma.planVersion.findMany({
    where: { planId },
    orderBy: { version: 'desc' },
    include: { features: { orderBy: { order: 'asc' } } },
  });
  return rows as AdminPlanVersionRow[];
}
