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

/**
 * One tenant, for the platform admin: who it is, which plan it is entitled
 * from, and the internal plan assignment (TASK-MVCH26OXNVLKR). Checks the
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

  const tenant = (await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true, country: true, orgType: true },
  })) as { id: string; name: string; slug: string; country: string | null; orgType: string } | null;
  if (!tenant) notFound();

  let subscription: SubscriptionRow | null = null;
  let history: AuditRow[] = [];
  let loadError = false;
  try {
    [subscription, history] = await withTenant(tenantId, async (tx) => [
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
    ]);
  } catch (e) {
    console.error(`[AdminTenantDetailPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

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
              <p className="text-[11px] text-muted font-mono">{t('internalPlan.by', { actor: h.actorId ?? '-' })}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
