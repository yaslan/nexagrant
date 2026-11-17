import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { readModulesPlanView, type ModulesPlanView } from './plan-view';
import { ModulesClient } from './client';
import { can } from '@/lib/rbac';
import type { Role } from '@prisma/client';
import { errorMessage } from '@/lib/errors';
import { getTranslations } from 'next-intl/server';
import { getAllManifests } from '@/lib/modules/registry';

export default async function ModulesSettingsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, role, isPlatformAdmin } = await requireTenantPage(locale);

  // If user is logged in with a restricted role, show forbidden banner
  if (!can(role as Role, 'manage_modules')) {
    const t = await getTranslations({ locale, namespace: 'settings.modules' });
    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto text-center bg-surface rounded-xl border shadow-sm my-12">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2 font-heading">{t('forbiddenTitle')}</h1>
        <p className="text-ink-2">{t.rich('forbiddenBody', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
      </div>
    );
  }

  // No fallback plan and no fallback module list (TASK-MUMH6W5I1W9WC): both
  // come from the same read the settings action decides on. A read that fails
  // leaves `plan` null and the client says so instead of inventing a Pro plan.
  let tenantName: string | null = null;
  let plan: ModulesPlanView | null = null;

  try {
    // Tenant comes from the session only. The old chain (session → workspace
    // slug → `findFirst()`) meant a session without a tenant was shown, and
    // could edit, whichever tenant happened to be first in the table.
    const read = await withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      if (!tenant) return null;
      // The viewer is the session member, so an unsold beta's preview shows to the
      // same people the module gate lets in (decideModuleAccess).
      const viewer = { role, isPlatformAdmin };
      return { name: tenant.name as string, plan: await readModulesPlanView(tenantId, tx, locale, new Date(), viewer) };
    });
    if (read) {
      tenantName = read.name;
      plan = read.plan;
    }
  } catch (err) {
    console.warn(`[ModulesSettings] plan/module read failed: ${errorMessage(err)}`);
  }

  // The Turkish card shows the English name under the Turkish one; the client
  // only has its own locale's catalogue, so the English names are read here.
  const tEn = await getTranslations({ locale: 'en', namespace: 'modules' });
  const englishNames = Object.fromEntries(getAllManifests().map((m) => [m.id, tEn(`${m.key}.name`)]));

  return (
    <ModulesClient
      plan={plan}
      englishNames={englishNames}
      tenantName={tenantName ?? workspace}
      workspace={workspace}
      locale={locale}
    />
  );
}
