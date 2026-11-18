import React from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import { getPublicRoute } from '@/lib/routes';
import { getNgCatalogView } from '@/lib/billing/nexagrant/catalog-view';
import { getNgBillingStateAction } from '@/lib/billing/nexagrant/actions';
import type { NgBillingStateView, NgCatalogView } from '@/lib/billing/nexagrant/view';
import { loadErrorOf, sortPlans, type NgLoadError } from './plan-view-model';
import { PlanCatalog } from './PlanCatalog';
import { TrialPanel } from './TrialPanel';
import { PlanLoadError } from './PlanLoadError';

/**
 * NG-11 — Settings → Plan and trial: the tenant's NexaGrant plan, its trial and the
 * tier comparison. Everything on it is read from the NG-57 contract
 * (src/lib/billing/nexagrant/): no price, day count or plan list is written here.
 *
 * Separate from Settings → Billing on purpose: that panel sells the platform plan
 * ladder (`Plan` / `Subscription`, EUR/USD) and lists invoices; NexaGrant tiers are
 * their own catalogue (`NgPlan*`, K-584182 = A), and payment, invoices and VAT are not
 * part of this phase.
 *
 * Read-only for every role: the state action is `requireTenantAction({ readOnly: true })`.
 * The trial changes with the clock, so the page is never cached.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ngPlan' });
  return { title: `${t('metaTitle')} · ${PRODUCT_NAME}` };
}

type Loaded<T> = { ok: true; value: T } | { ok: false; error: NgLoadError };

async function load<T>(what: string, run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (err) {
    const error = loadErrorOf(err);
    // A missing session is an expected state, not an incident.
    if (error !== 'session') console.warn(`[NgPlanSettings] ${what} unavailable: ${error}`);
    return { ok: false, error };
  }
}

export default async function NgPlanSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ngPlan' });

  const [catalog, state] = await Promise.all([
    load<NgCatalogView>('catalogue', getNgCatalogView),
    load<NgBillingStateView>('billing state', getNgBillingStateAction),
  ]);

  const loginHref = getPublicRoute('login', locale);

  // No tenant on the session: nothing below is the caller's, so only the sign-in prompt.
  if (!state.ok && state.error === 'session') {
    return (
      <div className="max-w-6xl mx-auto sm:px-6 py-8">
        <PlanLoadError kind="session" loginHref={loginHref} headingLevel={1} testId="ng-plan-session-required" />
      </div>
    );
  }

  const plans = catalog.ok ? sortPlans(catalog.value.plans) : [];
  const tierOf = new Map(plans.map((p) => [p.id, p.tier]));
  const planName = (planId: string | null | undefined, tier?: string): string | null => {
    const key = tier ?? (planId ? tierOf.get(planId) : undefined);
    if (!key) return null;
    return t.has(`tier.${key}`) ? t(`tier.${key}`) : key;
  };

  return (
    <div className="max-w-6xl mx-auto sm:px-6 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold font-heading text-ink">{t('title')}</h1>
        <p className="text-sm text-muted">{t('subtitle', { brand: PRODUCT_NAME })}</p>
        {state.ok && (
          <p className="text-sm text-ink-2 flex flex-wrap items-center gap-2">
            <span>{t('currentPlanLabel')}:</span>
            <span
              data-testid="ng-plan-current"
              data-plan-id={state.value.planId}
              className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent/15 text-accent-ink border border-accent/20"
            >
              {planName(state.value.planId, state.value.tier)}
            </span>
          </p>
        )}
      </header>

      <section aria-labelledby="ng-trial-title" className="space-y-3">
        <h2 id="ng-trial-title" className="text-xl font-bold font-heading text-ink">
          {t('trial.title')}
        </h2>
        {state.ok ? (
          <TrialPanel
            locale={locale}
            trial={state.value.trial}
            endPlanName={
              state.value.trial.kind === 'running'
                ? planName(state.value.trial.endPlanId)
                : state.value.trial.kind === 'ended'
                  ? planName(state.value.planId, state.value.tier)
                  : null
            }
          />
        ) : (
          <PlanLoadError kind={state.error} loginHref={loginHref} headingLevel={3} testId="ng-trial-error" />
        )}
      </section>

      <section aria-labelledby="ng-plans-title" className="space-y-4">
        {catalog.ok ? (
          <PlanCatalog
            locale={locale}
            plans={plans}
            currentPlanId={state.ok ? state.value.planId : null}
            titleId="ng-plans-title"
          />
        ) : (
          <>
            <h2 id="ng-plans-title" className="text-xl font-bold font-heading text-ink">
              {t('plans.title')}
            </h2>
            <PlanLoadError kind={catalog.error} loginHref={loginHref} headingLevel={3} testId="ng-plans-error" />
          </>
        )}
      </section>
    </div>
  );
}
