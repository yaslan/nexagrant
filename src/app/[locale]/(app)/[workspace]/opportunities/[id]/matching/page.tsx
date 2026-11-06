import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import FindCandidatesButton from '@/modules/m8/components/find-candidates-button';
import InviteCandidateButton from '@/modules/m8/components/invite-candidate-button';
import { moduleGate } from '@/lib/modules/guard';
import type { MatchBreakdown } from '@/modules/m8/server/matching';
import { seatBreakdownWriter, seatScoreDimensionScale } from '@/lib/scoring/seat-dimension-scale';
import { dimensionValueText, scoreNumberText } from '@/modules/m8/components/dimension-value';

/**
 * M8 consortium role matrix.
 *
 * This page returned a 500 on every load. It asked Prisma for
 * `include: { seats: { include: { organization: true } } }` and
 * `include: { topic: true }`, and neither `ConsortiumSeat.organization` nor
 * `Opportunity.topic` is a relation in prisma/schema.prisma — so the user never
 * reached the "Aday Bul" button at all. Organisation names now come from a
 * separate `CordisOrganization` lookup keyed by the PIC the seat already stores.
 */

interface SeatRow {
  id: string;
  roleKey: string;
  status: string;
  organizationId: string | null;
}

interface CandidateRow {
  id: string;
  rank: number;
  score: number;
  breakdown: unknown;
  organizationId: string | null;
}

interface OrgRow {
  organisationId: string;
  name: string;
  country: string | null;
}

/** The six scoring dimensions, in the order the breakdown is rendered. */
const DIMENSIONS: (keyof MatchBreakdown)[] = [
  'topicExperience',
  'geographicBalance',
  'collabHistory',
  'relationshipWarmth',
  'centrality',
  'rivalRisk',
];

function readBreakdown(value: unknown): Partial<Record<keyof MatchBreakdown, number>> {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const out: Partial<Record<keyof MatchBreakdown, number>> = {};
  for (const key of DIMENSIONS) {
    if (typeof source[key] === 'number') out[key] = source[key] as number;
  }
  return out;
}

export default async function MatchingPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>
}) {
  const { locale, workspace, id } = await params;
  const locked = await moduleGate('M8', locale);
  if (locked) return locked;
  const { tenantId } = await requireTenantPageRole(locale, 'view_proposal');
  const t = await getTranslations({ locale, namespace: 'Consortium' });
  const format = await getFormatter({ locale });

  // Everything below is read inside the session tenant. The page used to load
  // the opportunity by `(id, workspace slug)` with no tenant at all, so any
  // signed-in user could open another tenant's consortium by URL.
  const opp = await withTenant<{ id: string; title: string; seats: SeatRow[] } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId, workspace: { slug: workspace } },
      select: {
        id: true,
        title: true,
        seats: {
          select: { id: true, roleKey: true, status: true, organizationId: true },
          orderBy: { roleKey: 'asc' },
        },
      }
    })
  );

  if (!opp) return notFound();

  // The module gate above already refuses a tenant whose M8 is OFF; the page
  // used to repeat that check itself, which could only ever be dead code.

  const seatIds = opp.seats.map((s) => s.id);
  const candidates = seatIds.length
    ? await withTenant<CandidateRow[]>(tenantId, (tx) =>
        tx.seatCandidate.findMany({
          where: { seatId: { in: seatIds }, tenantId },
          orderBy: { rank: 'asc' },
          select: { id: true, seatId: true, rank: true, score: true, breakdown: true, organizationId: true },
        })
      )
    : [];

  const candidatesBySeat = new Map<string, CandidateRow[]>();
  for (const c of candidates as (CandidateRow & { seatId: string })[]) {
    const list = candidatesBySeat.get(c.seatId) ?? [];
    list.push(c);
    candidatesBySeat.set(c.seatId, list);
  }

  // Organisations are shared CORDIS reference data, keyed by PIC. The ids come
  // from rows already read inside this tenant.
  const orgIds = [
    ...opp.seats.map((s) => s.organizationId),
    ...candidates.map((c) => c.organizationId),
  ].filter((v): v is string => Boolean(v));

  const orgs = orgIds.length
    ? await withTenant<OrgRow[]>(tenantId, (tx) =>
        tx.cordisOrganization.findMany({
          where: { organisationId: { in: [...new Set(orgIds)] } },
          select: { organisationId: true, name: true, country: true },
        })
      )
    : [];
  const orgById = new Map(orgs.map((o) => [o.organisationId, o]));

  // An empty result has two very different causes, and telling them apart is the
  // difference between "press the button" and "ask an admin to run the import".
  const partnerGraphSize = await withTenant<number>(tenantId, (tx) =>
    tx.cordisOrganization.count()
  );

  return (
    <div className="py-6 sm:px-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('matrixTitle')}</h1>
        <p className="text-ink-2">{t('opportunity')}: {opp.title}</p>
      </div>

      {partnerGraphSize === 0 && (
        <p role="status" className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 rounded-lg px-4 py-3 text-sm">
          {t('partnerDataMissing')}
        </p>
      )}

      <div className="grid gap-6">
        {/* `min-w-0`: a grid item is as wide as its table by default, which
            pushed the page past a 390px screen (the table scrolls instead). */}
        {opp.seats.map((seat) => {
          const seatCandidates = candidatesBySeat.get(seat.id) ?? [];
          const assigned = seat.organizationId ? orgById.get(seat.organizationId) : null;
          return (
            <div key={seat.id} data-testid={`m8-seat-${seat.roleKey}`} className="min-w-0 border border-border p-4 rounded-lg bg-surface shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {t(`role.${seat.roleKey}` as 'role.unknown', {})}
                  </h2>
                  <p className="text-sm text-muted">
                    {t('status.label')}: {t(`status.${seat.status}` as 'status.unknown', {})}
                  </p>
                  {assigned && (
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      {t('assigned')}: {assigned.name}
                    </p>
                  )}
                </div>
                <FindCandidatesButton opportunityId={opp.id} seatId={seat.id} />
              </div>

              {seatCandidates.length === 0 ? (
                <p className="text-sm text-muted border border-dashed border-border rounded-md px-4 py-6 text-center">
                  {partnerGraphSize === 0 ? t('partnerDataMissing') : t('noCandidatesYet')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <caption className="sr-only">{t('topCandidates')}</caption>
                    <thead>
                      <tr className="bg-ground border-y border-border">
                        <th scope="col" className="py-2 px-4">{t('rank')}</th>
                        <th scope="col" className="py-2 px-4">{t('organization')}</th>
                        <th scope="col" className="py-2 px-4">{t('score')}</th>
                        <th scope="col" className="py-2 px-4">{t('action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seatCandidates.map((c) => {
                        const org = c.organizationId ? orgById.get(c.organizationId) : null;
                        const breakdown = readBreakdown(c.breakdown);
                        // A row the consortium builder wrote shares the seat; its
                        // topicExperience is 0–3, not 0–35, so no range is shown for it.
                        const writer = seatBreakdownWriter(c.breakdown);
                        return (
                          <tr key={c.id} className="border-b border-border align-top">
                            <td className="py-2 px-4 font-medium text-ink">#{c.rank}</td>
                            <td className="py-2 px-4">
                              <div className="font-semibold">{org?.name ?? c.organizationId}</div>
                              <div className="text-xs text-muted">
                                {org?.country ?? '—'} | {c.organizationId}
                              </div>
                            </td>
                            <td className="py-2 px-4">
                              <div className="font-bold tabular-nums">{t('scoreOutOf', { score: scoreNumberText(format.number, c.score) })}</div>
                              {/* Was a `title` attribute — invisible to keyboard and
                                  touch users, who could not see why a partner ranked. */}
                              <details className="text-xs text-muted mt-1">
                                <summary className="cursor-pointer min-h-11 flex items-center">
                                  {t('breakdown')}
                                </summary>
                                <dl className="mt-1 space-y-0.5">
                                  {DIMENSIONS.map((key) => (
                                    <div key={key} className="flex gap-2 justify-between">
                                      <dt>{t(`dimension.${key}` as 'dimension.centrality')}</dt>
                                      <dd className="tabular-nums whitespace-nowrap" data-testid={`m8-dimension-${key}`}>
                                        {dimensionValueText(
                                          t,
                                          format.number,
                                          writer === 'match' ? seatScoreDimensionScale('match', key) : null,
                                          breakdown[key] ?? 0
                                        )}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                                <p className="mt-1">{t('breakdownNote')}</p>
                              </details>
                            </td>
                            <td className="py-2 px-4">
                              {/* SeatCandidate.organizationId is nullable in the
                                  schema even though the scorer always writes one.
                                  Assigning a seat to nothing is not an invite. */}
                              {c.organizationId && (
                                <InviteCandidateButton
                                  seatId={seat.id}
                                  organizationId={c.organizationId}
                                  opportunityId={opp.id}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
