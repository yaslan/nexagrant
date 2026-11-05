import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma, withTenant } from '@/lib/db';
import { isPlatformAdminSession } from '@/lib/tenant';
import { errorMessage } from '@/lib/errors';
import { FALLBACK_PLAN_ID, grantsFor } from '@/lib/billing/catalog';
import { INTERNAL_PLAN_CHOICES } from '@/lib/billing/internal-plan';
import { isInternalPlanSubscription } from '@/lib/billing/subscription-owner';
import { InternalPlanForm } from './internal-plan-form';
import { TenantPicPanel } from './tenant-pic-panel';

/**
 * One tenant, for the platform admin: who it is, which plan it is entitled
 * from, the internal plan assignment (TASK-MVCH26OXNVLKR) and its PIC, which
 * staff can remove when ownership is disputed (FO-383). Checks the
 * platform-admin session itself rather than leaning on the admin layout.
 */
export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string }>;
}) {
  const { locale, tenantId } = await params;
  const session = await auth();
  if (!isPlatformAdminSession(session)) notFound();
  const t = await getTranslations({ locale, namespace: 'adminTenants' });

  interface SubscriptionRow {
    planId: string;
    status: string;
    provider: string;
  }
  interface AuditRow {
    id: string;
    type: string;
    actorId: string | null;
    createdAt: Date;
    data: { before?: string; after?: string; note?: string } | null;
  }
  interface PicAuditRow {
    id: string;
    type: string;
    actorId: string | null;
    createdAt: Date;
    data: { from?: string | null; to?: string | null; cordisName?: string | null; note?: string } | null;
  }

  interface PicRefusalRow {
    id: string;
    actorId: string | null;
    createdAt: Date;
    type: string;
    data: { pic?: string; reason?: string; cap?: number } | null;
  }

  const tenant = (await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true, country: true, orgType: true, pic: true },
  })) as { id: string; name: string; slug: string; country: string | null; orgType: string; pic: string | null } | null;
  if (!tenant) notFound();

  let subscription: SubscriptionRow | null = null;
  let history: AuditRow[] = [];
  let picHistory: PicAuditRow[] = [];
  let picRefusals: PicRefusalRow[] = [];
  let picOrgName: string | null = null;
  let loadError = false;
  try {
    [subscription, history, picHistory, picRefusals, picOrgName] = await withTenant(tenantId, async (tx) => [
      (await tx.subscription.findUnique({
        where: { tenantId },
        select: { planId: true, status: true, provider: true },
      })) as SubscriptionRow | null,
      (await tx.auditEvent.findMany({
        where: { tenantId, type: { startsWith: 'plan.internal.' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, actorId: true, createdAt: true, data: true },
      })) as AuditRow[],
      (await tx.auditEvent.findMany({
        // Not `startsWith`: 20 refused questions, an hour's work for the tenant, would push the
        // changes staff need in a dispute off this list.
        where: { tenantId, type: { in: ['tenant.pic.updated', 'tenant.pic.removed'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, actorId: true, createdAt: true, data: true },
      })) as PicAuditRow[],
      (await tx.auditEvent.findMany({
        // FO-389: the summary row that says the day's row cap was reached sits among the refusals.
        where: { tenantId, type: { in: ['tenant.pic.refused', 'tenant.pic.refusal.capped'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, actorId: true, createdAt: true, data: true },
      })) as PicRefusalRow[],
      tenant.pic
        ? ((await tx.cordisOrganization.findUnique({
            where: { organisationId: tenant.pic },
            select: { name: true },
          })) as { name: string } | null)?.name ?? null
        : null,
    ]);
  } catch (e) {
    console.error(`[AdminTenantDetailPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  // Who made each change, by name or e-mail. User is a platform table (no RLS)
  // and the actor is a platform admin, usually of another tenant. Unresolved —
  // a deleted user, a failed read — falls back to a shortened id.
  const actorIds = [
    ...new Set([...history, ...picHistory].map((h) => h.actorId).filter((id): id is string => Boolean(id))),
  ];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    try {
      const users = (await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })) as Array<{ id: string; name: string | null; email: string }>;
      for (const u of users) actorNames.set(u.id, u.name ? `${u.name} (${u.email})` : u.email);
    } catch (e) {
      console.error(`[AdminTenantDetailPage] actor lookup failed: ${errorMessage(e)}`);
    }
  }
  const actorLabel = (id: string | null) =>
    !id ? '-' : actorNames.get(id) ?? (id.length > 10 ? `${id.slice(0, 8)}…` : id);

  const planName = (id: string) => grantsFor(id)?.name ?? id;
  const internal = isInternalPlanSubscription(subscription);
  const entitledFrom =
    subscription && ['ACTIVE', 'TRIALING'].includes(subscription.status) ? subscription.planId : FALLBACK_PLAN_ID;
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}/admin/tenants`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t('detail.back')}
      </Link>

      <div className="bg-surface p-4 sm:p-6 rounded-xl border shadow-2xs space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-ink break-words">{tenant.name}</h1>
        <p className="text-xs text-muted font-mono">
          {tenant.slug} · {tenant.country ?? '-'} · {tenant.orgType}
        </p>
        <p className="text-sm text-ink-2" data-testid="tenant-current-plan">
          {t('detail.currentPlan', { plan: planName(entitledFrom) })}
          {internal && (
            <span className="ml-2 bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[11px] font-semibold">
              {t('internalBadge')}
            </span>
          )}
        </p>
        {subscription && !internal && subscription.provider !== 'stripe' && (
          <p className="text-xs text-muted">{t('detail.provider', { provider: subscription.provider })}</p>
        )}
      </div>

      <section className="bg-surface border rounded-xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">{t('pic.title')}</h2>
        <p className="text-xs text-muted">{t('pic.hint')}</p>
        {loadError ? (
          <p className="text-sm text-rose-700">{t('loadError')}</p>
        ) : (
          <TenantPicPanel tenantId={tenant.id} pic={tenant.pic} cordisName={picOrgName} />
        )}

        <h3 className="text-sm font-semibold text-ink pt-2">{t('pic.history')}</h3>
        <ul className="divide-y divide-border border border-border rounded-lg" data-testid="tenant-pic-history">
          {picHistory.length === 0 && <li className="p-3 text-xs text-muted">{t('pic.historyEmpty')}</li>}
          {picHistory.map((h) => (
            <li key={h.id} className="p-3 text-sm space-y-0.5">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-ink break-words font-mono">
                  {h.type === 'tenant.pic.removed'
                    ? t('pic.eventRemoved', { pic: h.data?.from ?? '-' })
                    : t('pic.eventUpdated', { from: h.data?.from ?? '-', to: h.data?.to ?? '-' })}
                </span>
                <span className="text-xs text-muted">{dateFmt.format(new Date(h.createdAt))}</span>
              </div>
              {h.data?.cordisName && <p className="text-xs text-ink-2 break-words">{h.data.cordisName}</p>}
              {h.data?.note && <p className="text-xs text-ink-2 break-words">{h.data.note}</p>}
              <p className="text-xs text-muted break-words">{t('internalPlan.by', { actor: actorLabel(h.actorId) })}</p>
            </li>
          ))}
        </ul>

        {picRefusals.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-ink pt-2">{t('pic.refusals')}</h3>
            <ul className="divide-y divide-border border border-border rounded-lg" data-testid="tenant-pic-refusals">
              {picRefusals.map((r) => (
                <li key={r.id} className="p-3 text-sm space-y-0.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-ink break-words font-mono">
                      {r.type === 'tenant.pic.refusal.capped'
                        ? t('pic.refusalsCapped', { cap: r.data?.cap ?? 0 })
                        : r.data?.reason === 'rateLimited'
                          ? t('pic.eventRateLimited', { pic: r.data?.pic ?? '-' })
                          : t('pic.eventRefused', { pic: r.data?.pic ?? '-' })}
                    </span>
                    <span className="text-xs text-muted">{dateFmt.format(new Date(r.createdAt))}</span>
                  </div>
                  <p className="text-xs text-muted break-words">{t('internalPlan.by', { actor: actorLabel(r.actorId) })}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="bg-surface border rounded-xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">{t('internalPlan.title')}</h2>
        <p className="text-xs text-muted">{t('internalPlan.hint')}</p>
        {loadError ? (
          <p className="text-sm text-rose-700">{t('loadError')}</p>
        ) : (
          <InternalPlanForm
            tenantId={tenant.id}
            currentPlanId={internal ? subscription!.planId : null}
            choices={INTERNAL_PLAN_CHOICES.map((id) => ({ id, name: planName(id) }))}
          />
        )}

        <h3 className="text-sm font-semibold text-ink pt-2">{t('internalPlan.history')}</h3>
        <ul className="divide-y divide-border border border-border rounded-lg" data-testid="internal-plan-history">
          {history.length === 0 && <li className="p-3 text-xs text-muted">{t('internalPlan.historyEmpty')}</li>}
          {history.map((h) => (
            <li key={h.id} className="p-3 text-sm space-y-0.5">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-ink">
                  {t('internalPlan.change', {
                    before: planName(h.data?.before ?? FALLBACK_PLAN_ID),
                    after: planName(h.data?.after ?? FALLBACK_PLAN_ID),
                  })}
                </span>
                <span className="text-xs text-muted">{dateFmt.format(new Date(h.createdAt))}</span>
              </div>
              <p className="text-xs text-ink-2 break-words">{h.data?.note}</p>
              <p className="text-[11px] text-muted break-words">{t('internalPlan.by', { actor: actorLabel(h.actorId) })}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
