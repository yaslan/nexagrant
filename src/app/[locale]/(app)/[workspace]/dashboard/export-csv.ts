'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function exportDashboardCSV(params: {
  from?: string;
  to?: string;
}): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const session = (await auth()) as unknown;
    const sessionObj = session as { tenantId?: string } | null;
    const tenantId = sessionObj?.tenantId;

    if (!tenantId) {
      return { success: false, error: 'Unauthorized' };
    }

    const { from, to } = params;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    // Build Prisma query
    let opportunities: Array<{ id: string; title?: string; stage?: string; status?: string; createdAt?: Date; updatedAt?: Date }> = [];

    if (fromDate || toDate) {
      const whereObj: { tenantId: string; createdAt?: object } = { tenantId };
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (fromDate) dateFilter.gte = fromDate;
      if (toDate) dateFilter.lte = toDate;
      if (Object.keys(dateFilter).length > 0) {
        whereObj.createdAt = dateFilter;
      }
      opportunities = await prisma.opportunity.findMany({
        where: whereObj,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          stage: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } else {
      opportunities = await prisma.opportunity.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          stage: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    // Build CSV
    const headers = ['ID', 'Title', 'Stage', 'Status', 'Created', 'Updated'];
    const rows = opportunities.map((opp) => [
      opp.id,
      `"${(opp.title || '').replace(/"/g, '""')}"`,
      opp.stage || 'G0',
      opp.status || 'N/A',
      opp.createdAt?.toISOString() || '',
      opp.updatedAt?.toISOString() || '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    return {
      success: true,
      data: csv,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export CSV';
    return {
      success: false,
      error: message,
    };
  }
}
