import React from 'react';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { DocumentsClient } from './client';

export default async function DocumentsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const session = await auth();
  const userId = session?.user?.id || 'demo-user-id';
  const tenantId = (session?.user as any)?.tenantId || 'demo-tenant-1';

  let opp: any = null;
  try {
    opp = await prisma.opportunity.findUnique({
      where: { id },
      include: { followupDocs: { orderBy: { createdAt: 'desc' } } }
    });
  } catch (e: any) {
    console.warn(`[DocumentsPage] DB query bypassed: ${e.message}`);
  }

  // Fallback demo data if DB is unseeded/offline
  if (!opp) {
    opp = {
      id,
      tenantId,
      title: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
      followupDocs: [
        {
          id: 'doc-nda-1',
          kind: 'NDA',
          version: 1,
          contentUrl: 'https://storage.fabrika.app/docs/demo-tenant-1/nda_v1.pdf',
          signedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          contentText: `### MUTUAL NON-DISCLOSURE AGREEMENT (NDA)\n\n**1. Purpose:** Confidentiality agreement for project **HORIZON-CL5-2026-D3-01**.\n**2. Obligations:** Disclosing Party and Receiving Party agree to hold all technical and financial background IP strictly confidential for a period of 5 years.\n**3. Jurisdiction:** EU Commercial Law & International Arbitration.`
        },
        {
          id: 'doc-loi-1',
          kind: 'LOI',
          version: 1,
          contentUrl: 'https://storage.fabrika.app/docs/demo-tenant-1/loi_v1.pdf',
          signedAt: null,
          createdAt: new Date().toISOString(),
          contentText: `### LETTER OF INTENT (LOI)\n\n**To the European Commission / Coordinator:**\nWe hereby confirm our institutional intent and formal commitment to participate as a full consortium partner in the proposal **HORIZON-CL5-2026-D3-01** under Horizon Europe.`
        },
        {
          id: 'doc-award-1',
          kind: 'AWARD_PACK',
          version: 1,
          contentUrl: 'https://storage.fabrika.app/docs/demo-tenant-1/tubitak_award_pack.pdf',
          signedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          contentText: `### TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ BAŞVURU PAKETİ\n\n**1. Proje Adı:** HORIZON-CL5-2026-D3-01\n**2. Çağrı Kodu:** HORIZON-CL5-2026-D3-01\n**3. Komisyon ESR Puanı:** 13.5 / 15.0 (Eşik Üstü Başarılı)\n**4. Başvuran Şirket:** FonBridge Teknoloji A.Ş.\n**5. Ödül Beyanı:** İşbu paket TÜBİTAK Eşik Üstü Ödülü yönetmeliğine uygun olarak hazırlanmıştır.`
        }
      ],
    };
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <DocumentsClient
        opportunityId={opp.id}
        tenantId={opp.tenantId || tenantId}
        userId={userId}
        opportunityTitle={opp.title}
        documents={opp.followupDocs || []}
      />
    </div>
  );
}
