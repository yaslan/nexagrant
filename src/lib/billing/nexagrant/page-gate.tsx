/**
 * The NexaGrant plan gate at a server component page (NG-250 review B1). The API routes answer a
 * refused member with a 403 (route-gate.ts); a page renders the refusal instead, the way
 * `moduleGate` renders a closed module: a plan that does not include a feature is a normal
 * product state, not an error.
 *
 *     const ngLocked = await ngPageGate({ tenantId, role }, locale, 'view_partner_search', 'partner_search');
 *     if (ngLocked) return ngLocked;
 *
 * Called after the page's own session read (`requireTenantPageRole`, or the CORDIS session door)
 * with the scope it returned, so the session is read once, and before any data query. Which page
 * calls it with which feature is listed in bindings.ts (`kind: 'page'`).
 *
 * Every sentence comes from `ngGate.*` in messages/*.json (CLAUDE.md §8): the code picks it.
 */
import React from 'react';
import { getTranslations } from 'next-intl/server';
import type { Action } from '@/lib/rbac';
import type { NgFeatureKey } from './features';
import { ngCallerDecision, type NgGateCaller } from './route-gate';

export async function ngPageGate(
  caller: NgGateCaller,
  locale: string,
  action: Action,
  feature: NgFeatureKey
): Promise<React.ReactElement | null> {
  const decision = await ngCallerDecision(caller, action, feature);
  if (decision.allowed) return null;
  const t = await getTranslations({ locale, namespace: 'ngGate' });
  return (
    // A <section>, not a <main>: the workspace layout already renders one.
    <section
      role="alert"
      aria-live="polite"
      data-testid="ng-plan-gate"
      data-ng-code={decision.code}
      data-ng-feature={decision.feature}
      className="max-w-2xl mx-auto sm:px-4 py-16 text-center"
    >
      <p className="text-5xl mb-6" aria-hidden="true">
        🔒
      </p>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t('pageTitle')}</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">{t(decision.code)}</p>
    </section>
  );
}
