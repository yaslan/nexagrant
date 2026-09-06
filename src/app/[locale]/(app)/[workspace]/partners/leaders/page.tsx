import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';

export default async function LeadersPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { workspace, locale } = await params;
  const isTr = locale === 'tr';
  
  // Leaders query: Get orgs with high Eigenvector centrality or most coordination
  let leaders: any[] = [];
  try {
    leaders = await prisma.organization.findMany({
      take: 20,
      orderBy: { eigenvector: 'desc' }, // Top central nodes
    });
  } catch (e: any) {
    console.warn(`[LeadersPage] Failed to fetch leaders: ${e.message}`);
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
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
        <span className="text-accent font-semibold">{isTr ? 'Lider Koordinatörler' : 'Top Leaders'}</span>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Link href={getWorkspaceRoute('partners', locale, workspace)} className="text-accent hover:underline text-xs font-semibold">
          {isTr ? '← Ortaklar Listesine Dön' : '← Back to Partners'}
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
          {isTr ? 'Kilit Ekosistem Liderleri (Merkeziyet Analizi)' : 'Key Ecosystem Leaders'}
        </h1>
      </div>

      <p className="mb-6 text-xs md:text-sm text-muted max-w-3xl leading-relaxed">
        {isTr
          ? 'Bu kurumlar Horizon Europe ve H2020 ağ grafiği içerisinde en yüksek özvektör merkeziyet puanına (Eigenvector Centrality) sahiptir. Bu liderlerle konsorsiyum kurmak teklifin kabul oranını belirgin biçimde artırır.'
          : 'These organizations hold the highest eigenvector centrality within the Horizon Europe / H2020 network graph. Collaborating with them significantly increases consortium strength.'}
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leaders.map((org: any) => (
          <Link href={getWorkspaceRoute('partnerDetail', locale, workspace, org.id)} key={org.id} className="block group">
            <div className="bg-surface border border-border rounded-2xl p-5 hover:border-accent transition-all shadow-xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-mono font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded">
                  PIC: {org.id}
                </span>
                <span className="text-[10px] font-bold text-muted uppercase">{org.country} - {org.activityType}</span>
              </div>
              <h3 className="font-bold text-sm text-ink mb-2 truncate group-hover:text-accent transition-colors" title={org.name}>{org.shortName || org.name}</h3>
              
              <div className="space-y-1.5 text-xs text-ink-2">
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Merkeziyet Skoru:' : 'Centrality Score:'}</span>
                  <span className="font-semibold text-ok font-mono">{Number(org.eigenvector || 0).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Koordine Edilen Proje:' : 'Projects Coordinated:'}</span>
                  <span className="font-semibold text-ink">{org.coordinatorCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Toplam Katılım:' : 'Total Projects:'}</span>
                  <span className="font-semibold text-ink">{org.participationCount}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
