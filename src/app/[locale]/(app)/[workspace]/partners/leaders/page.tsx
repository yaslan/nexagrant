import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';

export default async function LeadersPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { workspace, locale } = await params;
  const locked = await moduleGate('M1', locale);
  if (locked) return locked;
  const isTr = locale === 'tr';
  
  // Leaders query: Get orgs with most project participation (Horizon leadership)
  let leaders: Array<{ organisationId: string; name: string; totalProjects: number; coordinatorProjects: number; country: string | null; activityType: string | null }> = [];
  try {
    leaders = await prisma.cordisPartnerProfile.findMany({
      take: 20,
      orderBy: { totalProjects: 'desc' },
      select: {
        organisationId: true,
        name: true,
        totalProjects: true,
        coordinatorProjects: true,
        country: true,
        activityType: true,
      },
    });
  } catch (e) {
    console.warn(`[LeadersPage] Failed to fetch leaders: ${errorMessage(e)}`);
  }

  return (
    <div className="max-w-6xl mx-auto py-8 sm:px-4">
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
          ? 'Bu kurumlar Horizon Europe ve H2020 projelerinde en fazla katılım sağlayan ve koordine eden kurumlar arasında öncü konumdadır. Bu liderlerle ortaklık kurmak teklifin kabul oranını belirgin biçimde artırır.'
          : 'These organizations are leading participants and coordinators of Horizon Europe and H2020 projects. Collaborating with them significantly increases consortium strength.'}
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leaders.map((org) => (
          <Link href={getWorkspaceRoute('partnerDetail', locale, workspace, org.organisationId)} key={org.organisationId} className="block group">
            <div className="bg-surface border border-border rounded-2xl p-5 hover:border-accent transition-all shadow-xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-mono font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded">
                  PIC: {org.organisationId}
                </span>
                <span className="text-[10px] font-bold text-muted uppercase">{org.country || '—'} - {org.activityType || '—'}</span>
              </div>
              <h3 className="font-bold text-sm text-ink mb-2 truncate group-hover:text-accent transition-colors" title={org.name}>{org.name}</h3>

              <div className="space-y-1.5 text-xs text-ink-2">
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Koordine Edilen Proje:' : 'Projects Coordinated:'}</span>
                  <span className="font-semibold text-ink">{org.coordinatorProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Toplam Katılım:' : 'Total Projects:'}</span>
                  <span className="font-semibold text-ink">{org.totalProjects}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
