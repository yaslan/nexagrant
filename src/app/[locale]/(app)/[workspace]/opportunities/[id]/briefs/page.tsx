import React from 'react';
import { notFound } from 'next/navigation';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';
import { MeetingBriefsClient, type BriefItem } from './client';

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

  // MeetingBrief carries no opportunityId column, so tenant scope is the
  // narrowest filter available today.
  const briefs = await withTenant<BriefItem[]>(tenantId, (tx) =>
    tx.meetingBrief.findMany({
      select: {
        id: true,
        interactionId: true,
        partnerName: true,
        content: true,
        meetingScheduledAt: true,
        meetingScheduledTz: true,
        createdAt: true,
      },
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    }),
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <MeetingBriefsClient
        opportunityId={opp.id}
        locale={locale}
        workspace={workspace}
        opportunityTitle={opp.title}
        briefs={briefs}
      />
    </div>
  );
}
