import React from 'react';
import { notFound } from 'next/navigation';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { ApplicationClient, type ApplicationPartItem } from './client';

export default async function ApplicationPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  // findFirst + tenantId, not findUnique by id: an opportunity id is
  // guessable, and findUnique would happily return another tenant's row.
  //
  // No try/catch and no demo fallback here: an unknown or cross-tenant id used
  // to render a hard-coded "Fraunhofer Institute" budget and work-package plan,
  // which the user cannot tell apart from their own data. A missing row is a
  // 404; an unreadable database is an error (global-error.tsx).
  const opp = await withTenant<
    { id: string; tenantId: string; title: string; applicationParts: ApplicationPartItem[] } | null
  >(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId },
      include: { applicationParts: true }
    })
  );

  if (!opp) notFound();

  const partA = opp.applicationParts.find((p: { part: string }) => p.part === 'PART_A');
  const partB = opp.applicationParts.find((p: { part: string }) => p.part === 'PART_B');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <ApplicationClient
        opportunityId={opp.id}
        tenantId={opp.tenantId || tenantId}
        opportunityTitle={opp.title}
        partA={partA}
        partB={partB}
      />
    </div>
  );
}
