import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { asRole, can } from '@/lib/rbac';
// Same query, same shape as the dashboard page's — declared once there.
import type { OppWithRelations } from '@/lib/dashboard/fetch-metrics';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userRole = asRole(session?.role);
  const tenantId = session?.tenantId;

  // Authorization
  if (!can(userRole, 'evaluate_gates')) {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  try {
    // Fetch opportunities with date filter
    const where: Record<string, unknown> = { tenantId };
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) (where.createdAt as Record<string, Date>).gte = fromDate;
      if (toDate) (where.createdAt as Record<string, Date>).lte = toDate;
    }

    const opportunities = (await prisma.opportunity.findMany({
      where,
      include: { proposal: true, efforts: true },
    })) as OppWithRelations[];

    // Calculate metrics
    const totalOpps = opportunities.length;
    const submittedOpps = opportunities.filter(
      (o) => o.proposal && ['SUBMITTED', 'FUNDED', 'ABOVE_THRESHOLD'].includes(o.proposal.outcome || '')
    ).length;
    const fundedOpps = opportunities.filter((o) => o.proposal?.outcome === 'FUNDED').length;

    const avgIsabet = totalOpps > 0
      ? (opportunities.reduce((sum: number, o) => sum + (o.g0Score || 0), 0) / totalOpps).toFixed(1)
      : '0';

    const totalEffortDays = opportunities.reduce(
      (sum: number, o) => sum + o.efforts.reduce((s: number, e) => s + e.hours, 0) / 8,
      0
    );

    const g2Opps = opportunities.filter((o) => ['G2', 'G3', 'G4'].includes(o.stage));
    const avgG2Days = g2Opps.length > 0
      ? g2Opps.reduce((sum: number, o) => sum + ((o.updatedAt.getTime() - o.createdAt.getTime()) / (1000 * 3600 * 24)), 0) / g2Opps.length
      : 0;

    const activeModules = await prisma.moduleState.count({
      where: { tenantId, status: { in: ['ON', 'PILOT'] } },
    });

    // Generate CSV
    const headers = ['KPI', 'Değer', 'Birim', 'Dönem'];
    const rows = [
      headers.join(','),
      `Toplam Teklif,${totalOpps},adet,"${fromDate?.toLocaleDateString('tr-TR') || 'Başlangıç'} - ${toDate?.toLocaleDateString('tr-TR') || 'Günümüz'}"`,
      `Başarı Oranı,${totalOpps > 0 ? ((submittedOpps / totalOpps) * 100).toFixed(1) : 0},%`,
      `İsabet Oranı,${avgIsabet},skor`,
      `Kişi-Gün,${totalEffortDays.toFixed(1)},gün`,
      `G0→G2 Süresi,${Math.round(avgG2Days)},gün`,
      `Açık Modüller,${activeModules},modül`,
      '',
      'Stage,Sayı',
      `G0,${opportunities.filter((o) => o.stage === 'G0').length}`,
      `G1,${opportunities.filter((o) => o.stage === 'G1').length}`,
      `G2,${opportunities.filter((o) => o.stage === 'G2').length}`,
      `G3,${opportunities.filter((o) => o.stage === 'G3').length}`,
      `G4,${opportunities.filter((o) => o.stage === 'G4').length}`,
    ];

    const csv = rows.join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dashboard-metrics-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: unknown) {
    console.error('CSV export error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
