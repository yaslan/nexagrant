import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { DocumentsClient, type DocItem } from './client';
import { deriveDualApprovalState, type DualApprovalState } from '@/lib/dual-approval';
import { moduleGate } from '@/lib/modules/guard';
import { notFound } from 'next/navigation';

/** A document row plus the durable half of its approval flow. */
type FollowupDocRow = DocItem & {
  approvalSubmittedAt: Date | null;
  approvalSubmittedById: string | null;
  approvalSubmittedByName: string | null;
  approvalSteps: {
    id: string;
    department: string;
    actorUserId: string;
    actorName: string;
    note: string | null;
    decidedAt: Date;
  }[];
};

interface OpportunityWithDocs {
  id: string;
  tenantId: string;
  title: string;
  followupDocs: FollowupDocRow[];
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
      include: {
        followupDocs: {
          orderBy: { createdAt: 'desc' },
          include: { approvalSteps: { orderBy: { decidedAt: 'asc' } } },
        },
      }
    })
  );

  if (!opp) {
    notFound();
  }

  // TASK-MTSAIWF4ENUSL — the flow is read from the database, not rebuilt from a
  // click. A finance approval given before a reload is still here after it.
  const docs: DocItem[] = (opp.followupDocs || []).map((d) => ({
    id: d.id,
    kind: d.kind,
    version: d.version,
    contentUrl: d.contentUrl,
    signedAt: d.signedAt,
    createdAt: d.createdAt,
    approval: deriveDualApprovalState({
      docId: d.id,
      submittedAt: d.approvalSubmittedAt,
      submittedById: d.approvalSubmittedById,
      submittedByName: d.approvalSubmittedByName,
      steps: d.approvalSteps,
      signedAt: d.signedAt ?? null,
    }),
  }));

  // The banner shows one flow at a time: the one opened most recently.
  const inFlow = (opp.followupDocs || [])
    .filter((d) => d.approvalSubmittedAt)
    .sort((a, b) => b.approvalSubmittedAt!.getTime() - a.approvalSubmittedAt!.getTime())[0];
  const initialApproval: DualApprovalState | null =
    docs.find((d) => d.id === inFlow?.id)?.approval ?? null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <DocumentsClient
        opportunityId={opp.id}
        opportunityTitle={opp.title}
        documents={docs}
        initialApproval={initialApproval}
      />
    </div>
  );
}
