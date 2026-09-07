import { auth } from '@/lib/auth';
import { asRole, can } from '@/lib/rbac';
// One implementation of the dashboard KPIs, shared with the page that shows them. This route
// used to carry its own copy, which is how the outcome comparison could be fixed in one place
// and stay broken in the other (TASK-MTQTYXC0NUT0B).
import { fetchDashboardMetrics, generateCSV } from '@/lib/dashboard/fetch-metrics';
import { resolveDashboardRange } from '@/modules/m5/server/range';

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

  if (!tenantId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);

  // Same resolution as the page and as the dashboard's own export action, so the CSV covers
  // the window the user is looking at. `new Date('2026-09-07')` — what this route used to do —
  // is midnight UTC, which silently drops everything created on the last day of the range.
  const { from, to, rangeEnd } = resolveDashboardRange(
    url.searchParams.get('from') ?? undefined,
    url.searchParams.get('to') ?? undefined
  );

  try {
    const metrics = await fetchDashboardMetrics({ tenantId, from, to: rangeEnd });
    const csv = generateCSV(metrics, from, to);

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
