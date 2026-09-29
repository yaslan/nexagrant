import React from 'react';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isPlatformAdminSession } from '@/lib/tenant';
import { errorMessage } from '@/lib/errors';
import {
  listPlansForAdmin,
  listCatalogModules,
  listTenantsForAssignment,
  type AdminPlanRow,
} from '@/lib/billing/plan-repository';
import { PlanAdminClient } from './client';
import { PilotPanel } from './pilot-panel';
import { listPilots, pilotLastDayLabel, type PilotRow } from '@/lib/billing/pilot';

/**
 * Platform plan editor.
 *
 * The admin layout already refuses a non-platform session, but this page reads
 * and writes across every tenant, so it checks again rather than inheriting the
 * guard — a route that is only safe because of its parent is one refactor away
 * from being unsafe.
 */
export default async function AdminPlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!isPlatformAdminSession(session)) notFound();

  let plans: AdminPlanRow[] = [];
  let modules: Array<{ id: string; name: string }> = [];
  let tenants: Array<{ id: string; name: string }> = [];
  let pilots: PilotRow[] = [];
  let loadError: string | null = null;

  try {
    [plans, modules, tenants, pilots] = await Promise.all([
      listPlansForAdmin(),
      listCatalogModules(),
      listTenantsForAssignment(),
      listPilots(),
    ]);
  } catch (e) {
    // An empty editor is recoverable; an editor showing invented plans is not.
    console.error(`[AdminPlansPage] DB query failed: ${errorMessage(e)}`);
    loadError = errorMessage(e);
  }

  return (
    <>
      <PlanAdminClient
        locale={locale}
        plans={plans}
        modules={modules}
        tenants={tenants}
        loadError={loadError}
      />
      <PilotPanel
        tenants={tenants}
        pilots={pilots.map((p) => ({
          tenantId: p.tenantId,
          tenantName: p.tenantName,
          lastDay: pilotLastDayLabel(p.endsAt, locale),
          endsAt: p.endsAt.toISOString(),
          expired: p.expired,
        }))}
      />
    </>
  );
}
