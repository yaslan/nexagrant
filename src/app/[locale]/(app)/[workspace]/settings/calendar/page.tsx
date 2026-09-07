import { getWorkspaceRoute } from '@/lib/routes';
import { requireTenantAction } from '@/lib/tenant';
import { prisma } from '@/lib/db';
import { CalendarClient } from './client';

export const metadata = {
  title: 'Takvim Bağlantıları',
};

export default async function CalendarSettingsPage({ params }: { params: Promise<{ locale: string; workspace: string }> }) {
  const { locale, workspace } = await params;
  const { tenantId, userId } = await requireTenantAction();

  const connections = await prisma.calendarConnection.findMany({
    where: { tenantId, userId },
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <a href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {locale === 'tr' ? 'Panel' : 'Dashboard'}
        </a>
        <span>/</span>
        <a href={getWorkspaceRoute('settingsModules', locale, workspace)} className="hover:text-ink transition-colors">
          {locale === 'tr' ? 'Ayarlar' : 'Settings'}
        </a>
        <span>/</span>
        <span className="text-accent font-semibold">{locale === 'tr' ? 'Takvim Bağlantıları' : 'Calendar Connections'}</span>
      </div>

      <CalendarClient connections={connections} locale={locale} workspace={workspace} />
    </div>
  );
}
