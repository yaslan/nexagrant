import React from 'react';
import { notFound } from 'next/navigation';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';
import { listBriefsForOpportunity } from '@/modules/m9/server/brief-lists';
import { MeetingBriefsClient } from './client';

export default async function MeetingBriefsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  // Module gate (M9). A tenant whose ModuleState says OFF/DEV/PILOT must not
  // reach this page just because it can guess the URL.
  const locked = await moduleGate('M9', locale);
  if (locked) return locked;

  // Both reads are scoped to the session tenant. The briefs query used to key
  // off `opp.tenantId`, so a cross-tenant opportunity would have pulled that
  // other tenant's briefs along with it.
  //
  // No try/catch and no demo fallback here: this page used to answer an unknown
  // or cross-tenant id with a hard-coded "Fraunhofer Institute" brief, which
  // reads to the user as real data for an opportunity they cannot see. An
  // unreadable database is an error (global-error.tsx), not an invitation to
  // invent content.
  const opp = await withTenant<{ id: string; title: string } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId },
      select: { id: true, title: true },
    }),
  );

  if (!opp) notFound();

  // This opportunity's briefs, and — under their own heading — the tenant's
  // briefs linked to no opportunity (ROADMAP open decision #14). Briefs of the
  // tenant's other opportunities are not read.
  const { linked: briefs, unlinked: unlinkedBriefs } = await withTenant(tenantId, (tx) =>
    listBriefsForOpportunity(tx, tenantId, opp.id),
  );

  return (
    <div className="max-w-6xl mx-auto py-6 sm:px-6 space-y-6">
      <MeetingBriefsClient
        opportunityId={opp.id}
        locale={locale}
        workspace={workspace}
        opportunityTitle={opp.title}
        briefs={briefs}
        unlinkedBriefs={unlinkedBriefs}
      />
    </div>
  );
}
