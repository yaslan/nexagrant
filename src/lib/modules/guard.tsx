import React from 'react';
import { getTranslations } from 'next-intl/server';

import { checkModuleAccess } from '@/lib/modules/access';
import { getManifest } from '@/lib/modules/registry';
import type { ModuleId } from '@/lib/modules/types';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * Page-side module gate.
 *
 * Used as two lines at the top of a module's server component:
 *
 *     const locked = await moduleGate('M9', locale);
 *     if (locked) return locked;
 *
 * so the decision lives in one place (`checkModuleAccess` → `canAccessStatus`) and a
 * page only says *which* module it belongs to. Copying the rule into each page is what
 * CLAUDE.md §3 forbids.
 *
 * A refused page renders an explanation rather than throwing: a closed module is a
 * normal product state (this tenant is not in the pilot, or its plan does not include
 * the module), not an error, and `notFound()` would tell the user their opportunity
 * does not exist, which is untrue and confusing.
 *
 * Every sentence here comes from the `ModuleGate` namespace in messages/tr.json and
 * messages/en.json (CLAUDE.md §8); the server sends a code, never a sentence.
 */
export async function moduleGate(
  moduleId: ModuleId,
  locale: string,
): Promise<React.ReactElement | null> {
  const access = await checkModuleAccess(moduleId);
  if (access.allowed) return null;

  const t = await getTranslations({ locale, namespace: 'ModuleGate' });
  const manifest = getManifest(moduleId);
  const tModules = await getTranslations({ locale, namespace: 'modules' });

  // A "Yakında" module is not closed, it does not exist yet (FO-40): no lock, no
  // "ask your administrator" — nobody can open it. Its name is the translated one.
  if (access.reason === 'COMING_SOON' && manifest) {
    return (
      <section
        role="status"
        data-testid="module-coming-soon"
        className="max-w-2xl mx-auto sm:px-4 py-16 text-center"
      >
        <p className="text-5xl mb-6" aria-hidden="true">
          ⏳
        </p>
        <p className="font-mono text-xs text-muted">{moduleId}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{tModules(`${manifest.key}.name`)}</h1>
        <p className="mt-3 text-ink-2">{tModules(`${manifest.key}.tagline`)}</p>
        <p className="mt-6 text-sm text-muted">{t('comingSoon', { brand: PRODUCT_NAME })}</p>
      </section>
    );
  }

  return (
    // A <section>, not a <main>: the workspace layout already renders one, and a
    // nested <main> is invalid HTML and gives screen readers two landmarks.
    <section
      role="alert"
      aria-live="polite"
      className="max-w-2xl mx-auto sm:px-4 py-16 text-center"
    >
      <p className="text-5xl mb-6" aria-hidden="true">
        🔒
      </p>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {t('title')}
      </h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">
        {t(`reason.${access.reason ?? 'MODULE_OFF'}`, {
          // The translated name: `manifest.name` is English, also on a Turkish page.
          module: manifest ? tModules(`${manifest.key}.name`) : moduleId,
          // Only `PLAN_UPGRADE_REQUIRED` renders it; the other reasons ignore the
          // extra parameter. An empty list would leave a dangling "included in ."
          // sentence, so a module no plan sells falls back to the em dash.
          plans: access.requiredPlans?.length ? access.requiredPlans.join(', ') : '—',
          // Only `DEV_INTERNAL_ONLY` renders it; the other reasons ignore the extra parameter.
          brand: PRODUCT_NAME,
        })}
      </p>
      <p className="mt-6 text-sm text-slate-500 dark:text-slate-500">{t('askAdmin', { brand: PRODUCT_NAME })}</p>
    </section>
  );
}
