import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { notFound } from 'next/navigation';
import { computeSeatCandidates, assignCandidateToSeat } from '@/modules/m8/server/actions';
import { errorMessage } from '@/lib/errors';

export default async function MatchingPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>
}) {
  const { locale, workspace, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  // Everything below is read inside the session tenant. The page used to load
  // the opportunity by `(id, workspace slug)` with no tenant at all, so any
  // signed-in user could open another tenant's consortium by URL.
  const opp = await withTenant<any>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId, workspace: { slug: workspace } },
      include: {
        seats: {
          include: {
            organization: true
          }
        },
        topic: true
      }
    })
  );

  if (!opp) return notFound();

  // Check M8 state
  const m8State = await withTenant<any>(tenantId, (tx) =>
    tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId: 'M8' } }
    })
  );

  if (!m8State || m8State.status === 'OFF') {
    return (
      <div className="p-8 text-center border rounded-lg bg-ground max-w-2xl mx-auto mt-10">
        <h2 className="text-xl font-bold mb-2">Consortium Matching Kapalı</h2>
        <p className="text-ink-2">Bu modülü kullanmak için eklenti satın almalı veya planınızı yükseltmelisiniz.</p>
      </div>
    );
  }

  // Load candidates for each seat
  const seatCandidatesMap = new Map();
  for (const seat of opp.seats) {
    const candidates = await withTenant<any[]>(tenantId, (tx) =>
      tx.seatCandidate.findMany({
        where: { seatId: seat.id, tenantId },
        orderBy: { rank: 'asc' },
        include: {
          organization: true
        }
      })
    );
    seatCandidatesMap.set(seat.id, candidates);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Consortium Role Matrix</h1>
        <p className="text-ink-2">Opportunity: {opp.title}</p>
      </div>

      <div className="grid gap-6">
        {opp.seats.map((seat: any) => {
          const candidates = seatCandidatesMap.get(seat.id) || [];
          return (
            <div key={seat.id} className="border p-4 rounded-lg bg-surface shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold capitalize">{seat.roleKey} Seat</h3>
                  <p className="text-sm text-muted">Status: {seat.status}</p>
                  {seat.organization && (
                    <p className="text-sm font-medium text-green-700">Assigned: {seat.organization.name}</p>
                  )}
                </div>
                <form action={async () => {
                  'use server';
                  await computeSeatCandidates(opp.id, seat.id);
                }}>
                  <button type="submit" className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded">
                    Find Candidates
                  </button>
                </form>
              </div>

              {candidates.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-ground border-y">
                        <th className="py-2 px-4">Rank</th>
                        <th className="py-2 px-4">Organization</th>
                        <th className="py-2 px-4">Score</th>
                        <th className="py-2 px-4">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c: any) => (
                        <tr key={c.id} className="border-b">
                          <td className="py-2 px-4 font-medium text-ink">#{c.rank}</td>
                          <td className="py-2 px-4">
                            <div className="font-semibold">{c.organization?.name}</div>
                            <div className="text-xs text-muted">{c.organization?.country} | {c.organization?.id}</div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="font-bold">{c.score.toFixed(1)}</div>
                            <div className="text-xs text-muted" title={JSON.stringify(c.breakdown)}>Hover for breakdown</div>
                          </td>
                          <td className="py-2 px-4">
                            <form action={async () => {
                              'use server';
                              try {
                                await assignCandidateToSeat(seat.id, c.organizationId, 'INVITED', opp.id);
                              } catch (e) {
                                console.error(errorMessage(e));
                                // A real app would toast this error to the client
                              }
                            }}>
                              <button type="submit" className="text-xs bg-surface hover:bg-surface-hover dark:bg-gray-800 dark:hover:bg-gray-700 text-ink border border-border px-2 py-1 rounded">
                                Invite
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
