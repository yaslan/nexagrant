import React from 'react';
import { notFound } from 'next/navigation';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { ApplicationClient, type ApplicationPartItem } from './client';
import { moduleGate } from '@/lib/modules/guard';

export default async function ApplicationPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { tenantId } = await requireTenantPageRole(locale, 'view_proposal');
  const locked = await moduleGate('M11', locale);
  if (locked) return locked;

  // findFirst + tenantId, not findUnique by id: an opportunity id is
  // guessable, and findUnique would happily return another tenant's row.
  //
  // No try/catch and no demo fallback here: an unknown or cross-tenant id used
  // to render a hard-coded "Fraunhofer Institute" budget and work-package plan,
  // which the user cannot tell apart from their own data. A missing row is a
  // 404; an unreadable database is an error (global-error.tsx).
  //
  // The portal token's hash never enters this page (TASK-MULQLL2T8ZJX4,
  // TASK-MUN2TQ1W6WP8E): the parts are read with an explicit select, and the
  // client only learns whether a link exists, from a filter on the hash.
  const found = await withTenant(tenantId, async (tx) => {
    const opportunity = await tx.opportunity.findFirst({
      where: { id, tenantId },
      include: { applicationParts: { select: { id: true, part: true, content: true } } }
    });
    if (!opportunity) return null;
    const linked = await tx.applicationPart.findMany({
      where: { opportunityId: opportunity.id, tenantId, magicTokenHash: { not: null } },
      select: { id: true }
    });
    return { opportunity, linkedPartIds: new Set(linked.map((p) => p.id)) };
  });

  if (!found) notFound();
  const { opportunity: opp, linkedPartIds } = found;

  const parts: ApplicationPartItem[] = opp.applicationParts.map((part) => ({
    ...(part as unknown as ApplicationPartItem),
    hasPortalLink: linkedPartIds.has(part.id),
  }));
  const partA = parts.find((p) => p.part === 'PART_A');
  const partB = parts.find((p) => p.part === 'PART_B');

  return (
    <div className="max-w-6xl mx-auto py-6 sm:px-6 space-y-6">
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
