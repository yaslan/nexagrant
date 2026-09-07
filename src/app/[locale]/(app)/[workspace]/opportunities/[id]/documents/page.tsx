import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { DocumentsClient, type DocItem } from './client';
import { moduleGate } from '@/lib/modules/guard';
import { notFound } from 'next/navigation';

interface OpportunityWithDocs {
  id: string;
  tenantId: string;
  title: string;
  followupDocs: DocItem[];
}

export default async function DocumentsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, id } = await params;
  const locked = await moduleGate('M10', locale);
  if (locked) return locked;
  const { tenantId } = await requireTenantPage(locale);

  // Tenant-scoped lookup: findUnique by a guessable id would cross tenants.
  //
  // This block used to be wrapped in a try/catch that logged a warning and fell
  // through to a hard-coded "demo" document set — a signed NDA, an LOI, and a
  // TÜBİTAK award pack asserting "Komisyon ESR Puanı: 13.5 / 15.0" for a company
  // called FonBridge Teknoloji A.Ş. That pack rendered for ANY opportunity id,
  // including one belonging to another tenant, and the ESR score is exactly the
  // kind of figure CLAUDE.md rule 7 requires to be backed by a record.
  //
  // The catch is gone with it on purpose: `notFound()` signals by throwing, so
  // leaving a catch here would swallow it and put the page back where it was.
  const opp = await withTenant<OpportunityWithDocs | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId },
      include: { followupDocs: { orderBy: { createdAt: 'desc' } } }
    })
  );

  if (!opp) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <DocumentsClient
        opportunityId={opp.id}
        opportunityTitle={opp.title}
        documents={opp.followupDocs || []}
      />
    </div>
  );
}
