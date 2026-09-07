import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { errorMessage } from '@/lib/errors';

export default async function PartnerDetailPage({
  params
}: {
  params: Promise<{ pic: string; locale: string; workspace: string }>
}) {
  const { pic, workspace, locale } = await params;
  const isTr = locale === 'tr';

  let org: any = null;
  try {
    org = await prisma.organization.findUnique({
      where: { id: pic },
      include: {
        participations: {
          include: { project: true }
        }
      }
    });
  } catch (e) {
    console.warn(`[PartnerDetailPage] Failed to fetch organization: ${errorMessage(e)}`);
  }

  if (!org) return notFound();

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {isTr ? 'Panel' : 'Dashboard'}
        </Link>
        <span>/</span>
        <Link href={getWorkspaceRoute('partners', locale, workspace)} className="hover:text-ink transition-colors">
          {isTr ? 'Ortaklar' : 'Partners'}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{org.name}</span>
      </div>

      <div className="mb-6">
        <Link 
          href={getWorkspaceRoute('partners', locale, workspace)} 
          className="text-accent hover:underline text-xs font-semibold flex items-center gap-1"
        >
          {isTr ? '← Ortaklar Listesine Dön' : '← Back to Partners'}
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 mb-8 shadow-xs">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-2">{org.name}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted mb-6">
              <span className="bg-ground border border-border px-2.5 py-1 rounded-md font-mono">PIC: {org.id}</span>
              <span className="bg-ground border border-border px-2.5 py-1 rounded-md">{isTr ? 'Ülke:' : 'Country:'} {org.country || '-'}</span>
              <span className="bg-ground border border-border px-2.5 py-1 rounded-md">{isTr ? 'Tür:' : 'Type:'} {org.activityType || '-'}</span>
              {org.isSme && <span className="bg-accent/15 text-accent-ink border border-accent/20 px-2.5 py-1 rounded-md font-bold">{isTr ? 'KOBİ' : 'SME'}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{isTr ? 'Toplam Katılım' : 'Total Participations'}</div>
            <div className="text-2xl font-bold text-ink mt-1">{org.participationCount}</div>
          </div>
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{isTr ? 'Koordinatörlük' : 'Coordinator Roles'}</div>
            <div className="text-2xl font-bold text-ink mt-1">{org.coordinatorCount}</div>
          </div>
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{isTr ? 'Toplam AB Fonu' : 'Total EC Funding'}</div>
            <div className="text-xl md:text-2xl font-bold text-ink font-mono mt-1">€ {Number(org.ecContributionSum || 0).toLocaleString()}</div>
          </div>
          <div className="p-4 bg-ground border border-border rounded-xl">
            <div className="text-xs text-muted font-medium">{isTr ? 'Ağ Merkezilik Skoru' : 'Network Centrality'}</div>
            <div className="text-2xl font-bold text-ok font-mono mt-1">{Number(org.eigenvector || 0).toFixed(4)}</div>
          </div>
        </div>

        {/* Network Graph Placeholder */}
        <div className="mb-8">
          <h2 className="text-lg font-bold font-heading text-ink mb-4">{isTr ? 'İşbirliği ve Ortaklık Grafiği' : 'Collaboration Graph'}</h2>
          <div className="h-48 bg-ground rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted text-xs text-center p-4">
            {isTr
              ? `[CORDIS Etkileşim Grafiği] — Kurumun ${org.degree || 0} doğrudan konsorsiyum bağlantısı bulunmaktadır.`
              : `[Interactive Collaboration Graph] — Visualizing ${org.degree || 0} direct consortium connections.`}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold font-heading text-ink mb-4">{isTr ? 'Geçmiş AB Projeleri' : 'Past Projects'}</h2>
          <div className="space-y-3">
            {org.participations.map((p: any) => (
              <div key={p.id} className="p-4 border border-border rounded-xl bg-surface hover:bg-surface-hover transition-colors flex justify-between items-center gap-4">
                <div>
                  <div className="font-bold text-accent text-sm">{p.project?.acronym}</div>
                  <div className="text-xs text-ink-2 truncate max-w-md">{p.project?.title}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase font-bold text-muted">{p.role}</div>
                  <div className="font-mono text-xs font-semibold text-ink">€ {Number(p.ecContributionCents || 0).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
