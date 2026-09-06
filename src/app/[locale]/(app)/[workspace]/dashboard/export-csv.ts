'use server';

import { withTenant } from '@/lib/db';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Role } from '@prisma/client';
import { resolveDashboardRange } from '@/modules/m5/server/range';

interface ExportRow {
  id: string;
  title: string | null;
  stage: string | null;
  status: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export async function exportDashboardCSV(params: {
  from?: string;
  to?: string;
}): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const session = (await auth()) as unknown;
    const sessionObj = session as { tenantId?: string; role?: string } | null;
    const tenantId = sessionObj?.tenantId;

    if (!tenantId) {
      return { success: false, error: 'Unauthorized' };
    }

    // The export carries the same tenant data as the dashboard, so it needs the
    // same permission — the endpoint must not be softer than the page linking to it.
    if (!can(sessionObj?.role as Role | undefined, 'evaluate_gates')) {
      return { success: false, error: 'Forbidden' };
    }

    // Same resolution as the page, so the CSV matches what the user is looking at.
    const { from: fromDate, rangeEnd } = resolveDashboardRange(params.from, params.to);

    // Tenant scope goes through withTenant so RLS backs up the explicit filter.
    const opportunities = await withTenant<ExportRow[]>(tenantId, async (tx) =>
      tx.opportunity.findMany({
        where: { tenantId, createdAt: { gte: fromDate, lte: rangeEnd } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          stage: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    );

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
    // Keep database detail server-side; the caller gets a stable, generic reason.
    console.error('[Dashboard] CSV export failed:', error);
    return { success: false, error: 'ExportFailed' };
  }
}
