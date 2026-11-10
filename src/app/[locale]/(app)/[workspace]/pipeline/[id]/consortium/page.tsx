import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { canConfirmSeat } from '@/modules/m8/server/seat-transitions';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import ConsortiumManager, { type ConsortiumSeat, type OrgInfo, type SeatCandidate } from './manager';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import { recordAlert } from '@/lib/observability/system-alert';
import { visibleSeatCandidates } from '@/lib/scoring/seat-candidate-view';
import { findOpportunityTopic } from '@/modules/m8/server/matching';

/** `CordisOrganization` columns this page maps onto the manager's `OrgInfo`. */
interface CordisOrgRow {
  organisationId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  sme: boolean;
}

/** The header fields this page renders for an opportunity. */
interface ConsortiumOpportunity {
  id: string;
  title: string;
  stage: string;
  status: string;
  topicId: string | null;
  intendedRole: string | null;
  g0Score: number | null;
}

/**
 * TASK-MTQYXISOPUJ53 — fabricated fallbacks.
 *
 * A `DEMO_OPPORTUNITIES` map used to sit here: four invented opportunities keyed
 * by the ids the demo seed happens to use (`demo-opp-1` … `demo-opp-4`), each
 * with a title, a stage and a G0 score ("FLEX-GRID: Decarbonised Smart Grid
 * Flexibility Solutions", G0, 88). When the tenant-scoped query below returned
 * nothing — an id belonging to another tenant, a deleted row, a failed query —
 * the page served one of them as this tenant's own opportunity. Measured on
 * 2026-09-08 against a tenant with zero `Opportunity` rows: the consortium
 * builder rendered "FLEX-GRID … — Stage G0". The map is gone; the header now
 * shows only a row this tenant owns.
 */

/**
 * M8 consortium page.
 *
 * This page used to resolve its tenant as
 * `session.tenantId ?? prisma.tenant.findFirst()` and then apply the tenant to
 * the WHERE clause only `if (tenantId)`. With no session the fallback handed
 * the request whichever tenant happened to be seeded first, and if the table
 * was empty the condition was dropped entirely — so `opportunity.findFirst({
 * where: { id } })` returned *any* tenant's opportunity by guessed id. The seat
 * candidates were never tenant-scoped at all.
 *
 * It now follows the same rule as `./actions.ts`: the tenant comes from
 * `requireTenantPageRole()` (no fallback — anonymous visitors are redirected, a role
 * without `view_proposal` gets 403) and
 * every query runs inside `withTenant`, matched on `(id, tenantId)`.
 */
export default async function ConsortiumPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const locked = await moduleGate('M8', locale);
  if (locked) return locked;
  const { tenantId, role } = await requireTenantPageRole(locale, 'view_proposal');

  const isTr = locale === 'tr';

  let queryFailed = false;
  let opportunity: ConsortiumOpportunity | null = null;
  let seats: ConsortiumSeat[] = [];
  let candidates: SeatCandidate[] = [];
  let orgs: OrgInfo[] = [];
  let liveDemandOrgIds: string[] = [];

  try {
    opportunity = await withTenant<ConsortiumOpportunity | null>(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id, tenantId },
      })
    );

    if (opportunity) {
      const rawSeats = await withTenant(tenantId, (tx) =>
        tx.consortiumSeat.findMany({
          where: { opportunityId: id, tenantId },
          orderBy: { roleKey: 'asc' },
        })
      );
      seats = rawSeats as unknown as ConsortiumSeat[];

      const seatIds = seats.map((s) => s.id);
      if (seatIds.length > 0) {
        const rawCandidates = await withTenant(tenantId, (tx) =>
          tx.seatCandidate.findMany({
            where: { seatId: { in: seatIds }, tenantId },
            orderBy: { rank: 'asc' },
          })
        );
        // K-579560=A: only the M8 matcher's rows are shown (see seat-candidate-view.ts).
        candidates = visibleSeatCandidates(rawCandidates as unknown as SeatCandidate[]);
      }

      // Informational only, never part of a score (K-579560=A): which candidates
      // have an open partner-search request on this topic.
      if (opportunity.topicId && candidates.length > 0) {
        const topicId = opportunity.topicId;
        // NG-100 B-4: the form stores the topic identifier, so resolve it as the matcher does.
        const topic = await withTenant(tenantId, (tx) => findOpportunityTopic(tx, topicId));
        if (topic) {
          const requests = await withTenant(tenantId, (tx) =>
            tx.partnerSearchAnnouncement.findMany({
              where: {
                topicIdentifier: topic.identifier,
                type: 'EXPERTISE_REQUEST',
                withdrawnAt: null,
                organizationPic: { in: candidates.map((c) => c.organizationId) },
              },
              select: { organizationPic: true },
            })
          );
          liveDemandOrgIds = [
            ...new Set(requests.map((r) => r.organizationPic).filter((p): p is string => Boolean(p))),
          ];
        }
      }

      const orgIds = [
        ...seats.map((s) => s.organizationId).filter(Boolean),
        ...candidates.map((c) => c.organizationId).filter(Boolean),
      ] as string[];

      // Organizations are shared CORDIS reference data, not tenant rows; the ids
      // here already come from rows read inside this tenant. `prisma.organization`
      // is not a model in prisma/schema.prisma — the query threw on every render
      // and the catch below swallowed it with a console.warn.
      if (orgIds.length > 0) {
        const cordisOrgs = await withTenant<CordisOrgRow[]>(tenantId, (tx) =>
          tx.cordisOrganization.findMany({
            where: { organisationId: { in: orgIds } },
            select: { organisationId: true, name: true, shortName: true, country: true, sme: true },
          })
        );
        orgs = cordisOrgs.map((o) => ({
          id: o.organisationId,
          name: o.name,
          shortName: o.shortName,
          country: o.country,
          isSme: o.sme,
        }));
      }
    }
  } catch (e) {
    // Reported, not replaced with an invented opportunity (CLAUDE.md rule 6).
    // The old catch only warned to the console and fell through to the demo map,
    // so a permanently broken query looked like a working page.
    console.error(`[ConsortiumPage] query failed for ${id}: ${errorMessage(e)}`);
    await recordAlert({
      level: 'warn',
      source: 'consortium_page_query_failed',
      message: `Consortium lookup failed: ${errorMessage(e)}`,
      meta: { module: 'M8', table: 'Opportunity', opportunityId: id },
      // This runs on every render of the page, so with `opportunityId` in the
      // identity a database that is down for an hour wrote one alert per page
      // view. A failed read of the Opportunity table is one infrastructure
      // fault; the opportunity that happened to be open when it was noticed
      // stays on the row as detail.
      dedupeKey: 'consortium-page-query-failed',
    });
    queryFailed = true;
  }

  // "We could not read it" and "this tenant has no such opportunity" are two
  // different answers, and only the second one is a 404.
  if (queryFailed) {
    return (
      <div className="max-w-5xl mx-auto py-8 sm:px-4">
        <div
          role="alert"
          className="border border-amber-200 bg-amber-50 text-amber-900 text-sm rounded-lg p-4"
        >
          {isTr
            ? 'Konsorsiyum verisi okunamadı. Sorun kaydedildi; lütfen birazdan tekrar deneyin.'
            : 'Consortium data could not be read. The failure has been recorded; please try again shortly.'}
        </div>
      </div>
    );
  }

  if (!opportunity) return notFound();

  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o]));
  const t = await getTranslations({ locale, namespace: 'Consortium' });
  const tPipeline = await getTranslations({ locale, namespace: 'Pipeline' });

  return (
    <div className="max-w-5xl mx-auto py-8 sm:px-4">
      <div className="mb-6">
        <Link
          href={`/${locale}/${workspace}/pipeline`}
          className="text-muted hover:text-ink"
        >
          ← {tPipeline('detail.back')}
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold font-heading">{t('title')}</h1>
        <p className="text-muted mt-1">
          {t('stageLine', { title: opportunity.title, stage: opportunity.stage })}
        </p>
      </div>

      <ConsortiumManager
        canConfirm={canConfirmSeat(role)}
        opportunityId={id}
        seats={seats}
        candidates={candidates}
        orgMap={orgMap}
        liveDemandOrgIds={liveDemandOrgIds}
      />
    </div>
  );
}
