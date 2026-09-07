import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import EvidenceClient, { type EvidenceItemData } from './evidence-client';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';

export default async function EvidencePage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { locale } = await params;
  const locked = await moduleGate('M3', locale);
  if (locked) return locked;

  const session = await auth();
  const tenantId = session?.tenantId;

  let evidence: EvidenceItemData[] = [];
  try {
    evidence = await prisma.evidence.findMany({
      where: tenantId ? { tenantId } : {},
      // The detail drawer distinguishes "no claim is linked" from "claims were not
      // loaded", so the links have to come with the first render, not only from
      // getEvidenceItemsAction.
      include: { claimLinks: { include: { claim: true } } },
      orderBy: { createdAt: 'desc' }
    });
  } catch (e) {
    console.warn(`[Evidence] DB query bypassed: ${errorMessage(e)}`);
  }

  const isTr = locale === 'tr';

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-heading text-ink">
          {isTr ? 'Kanıt & Yetkinlik Deposu (Evidence Pack)' : 'Evidence Pack'}
        </h1>
        <p className="text-muted text-xs sm:text-sm mt-2 max-w-3xl leading-relaxed">
          {isTr
            ? "Kuruluşunuzun temel yetkinliklerini, sertifikalarını, mali raporlarını ve geçmiş proje başarılarını tek bir merkezde toplayın. Doğrulanmış belgeleri yükleyerek AB teklif yazımında doğrudan kanıt belgesi olarak kullanın."
            : "Centralize your organization's core capabilities, certificates, and past results. Upload valid documents (Cloudflare R2) and use them directly when generating proposals."}
        </p>
      </div>

      <EvidenceClient initialData={evidence} locale={locale} />
    </div>
  );
}
