import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { ModuleLink } from '@/components/ModuleLink';
import { PartnerFilters } from './PartnerFilters';
import { errorMessage } from '@/lib/errors';
import { formatWholeMoney } from '@/lib/money';
import { moduleGate } from '@/lib/modules/guard';
import { recordAlert } from '@/lib/observability/system-alert';


/**
 * A partner row as this table renders it. The two queries below
 * (CordisPartnerProfile, then CordisOrganization) each normalise into this one
 * shape, so the table does not have to know which source it got.
 *
 * There used to be a third step: a `DEMO_CORDIS_PARTNERS` constant of six
 * invented Turkish institutions (METU with "84 projects / €24.5m", ARÇELİK with
 * "€260m") that was served whenever both queries came back empty — which is
 * also what an unseeded database and an offline one look like. The page then
 * printed a real-looking PIC code, project count and EC grant for every one of
 * them. CLAUDE.md rule 7: every figure on screen is backed by a record. No
 * records, no rows — the empty state at the bottom of this file is the honest
 * answer, and a query that actually failed now says so.
 */
interface PartnerRow {
  organisationId: string;
  name: string;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  isTurkish: boolean;
  isInterreg?: boolean;
  /**
   * `null` where the source does not carry the figure — CordisOrganization has
   * no project counts. Absence renders as "—", never as a number: reporting an
   * unknown participation count as `1` (which this page used to do) is the same
   * class of invention as the demo dataset, just quieter.
   */
  totalProjects: number | null;
  coordinatorProjects: number | null;
  totalEcContribution: bigint | null;
  /**
   * Top-20 topic tags from the derived profile; `[]` for the fallbacks. Older
   * profile rows stored bare topic codes rather than objects, which is why the
   * table renders `t.code || t`.
   */
  topTopics: Array<{ code: string; title?: string; count?: number } | string>;
}

export default async function PartnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<{
    q?: string;
    country?: string;
    activity_type?: string;
    is_turkish?: string;
    min_projects?: string;
    is_interreg?: string;
    framework?: string;
  }>;
}) {
  const { workspace, locale } = await params;
  const locked = await moduleGate('M1', locale);
  if (locked) return locked;

  const sParams = await searchParams;
  const tLinks = await getTranslations({ locale, namespace: 'PartnersPage.crossLinks' });
  const t = await getTranslations('partnersPage');

  const q = sParams.q?.trim() || '';
  const country = sParams.country?.trim().toUpperCase() || '';
  const activityType = sParams.activity_type?.trim().toUpperCase() || '';
  const isTurkishOnly = sParams.is_turkish === 'true';
  const minProjects = sParams.min_projects ? parseInt(sParams.min_projects, 10) : 0;
  const isInterregOnly = sParams.is_interreg === 'true' || sParams.framework?.toUpperCase() === 'INTERREG';

  let profiles: PartnerRow[] = [];
  let totalCount = 0;
  let dataSource = 'cordis_partner_profile';
  // Set when a lookup threw. An empty table and a broken database must not look
  // the same to the user.
  let queryFailed = false;

  if (isInterregOnly) {
    // Interreg partners (e.g. Trakya Üniversitesi, belediyeler, ajanslar) are recorded
    // in CordisOrganization and linked to CordisProject with framework 'INTERREG'.
    // Querying CordisOrganization directly with framework filter ensures all Interreg
    // partners are returned with their real participations.
    try {
      const orgWhere: Record<string, unknown> = {
        participations: {
          some: {
            project: {
              framework: 'INTERREG',
            },
          },
        },
      };

      if (q) {
        orgWhere.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { nameNormalized: { contains: q.toUpperCase(), mode: 'insensitive' } },
          { organisationId: { contains: q, mode: 'insensitive' } },
        ];
      }
      if (country) orgWhere.country = country;
      if (activityType) orgWhere.activityType = activityType;
      if (isTurkishOnly) orgWhere.isTurkish = true;

      // min_projects counts Interreg projects only. Filtering after `take: 50`
      // gave a wrong total and dropped matches, so the threshold is applied in
      // SQL against the whole table and then paginated.
      if (minProjects > 0) {
        const eligible = await prisma.$queryRaw<Array<{ organisationId: string }>>`
          SELECT p."organisationId"
          FROM "CordisParticipation" p
          JOIN "CordisProject" pr ON pr.id = p."projectId"
          WHERE pr.framework = 'INTERREG'
          GROUP BY p."organisationId"
          HAVING COUNT(*) >= ${minProjects}`;
        orgWhere.organisationId = { in: eligible.map((r) => r.organisationId) };
      }

      const [cCount, cOrgs] = await Promise.all([
        prisma.cordisOrganization.count({ where: orgWhere }),
        prisma.cordisOrganization.findMany({
          where: orgWhere,
          take: 50,
          orderBy: { updatedAt: 'desc' },
          include: {
            profile: true,
            // Nested take caps the rows read per organisation. Counts and EC sums
            // come from the aggregate below, so the cap does not change them.
            participations: {
              where: {
                project: {
                  framework: 'INTERREG',
                },
              },
              take: 200,
              include: {
                project: {
                  select: {
                    id: true,
                    acronym: true,
                    title: true,
                    framework: true,
                    masterCall: true,
                    topics: { select: { topicCode: true, topicTitle: true } },
                  },
                },
              },
            },
          },
        }),
      ]);

      // Exact per-organisation totals for the page's 50 rows, computed in the
      // database rather than summed from a participation list.
      const pageOrgIds = cOrgs.map((o) => o.organisationId);
      const interregTotals = pageOrgIds.length === 0 ? [] : await prisma.cordisParticipation.groupBy({
        by: ['organisationId'],
        where: { organisationId: { in: pageOrgIds }, project: { framework: 'INTERREG' } },
        _count: { _all: true },
        _sum: { ecContribution: true },
      });
      const interregCoordinators = pageOrgIds.length === 0 ? [] : await prisma.cordisParticipation.groupBy({
        by: ['organisationId'],
        where: { organisationId: { in: pageOrgIds }, role: 'coordinator', project: { framework: 'INTERREG' } },
        _count: { _all: true },
      });
      const totalsById = new Map(interregTotals.map((t) => [t.organisationId, t]));
      const coordinatorsById = new Map(interregCoordinators.map((c) => [c.organisationId, c._count._all]));

      dataSource = 'cordis_organization_interreg';
      totalCount = cCount;
      profiles = cOrgs.map((o) => {
        const parts = o.participations || [];
        const totals = totalsById.get(o.organisationId);
        const projectCount = totals?._count._all ?? 0;
        const coordCount = coordinatorsById.get(o.organisationId) ?? 0;
        const totalEc = totals?._sum.ecContribution ?? 0n;

        const topicsMap = new Map<string, { code: string; title: string; count: number }>();
        for (const part of parts) {
          if (part.project?.topics && part.project.topics.length > 0) {
            for (const t of part.project.topics) {
              const prev = topicsMap.get(t.topicCode) ?? { code: t.topicCode, title: t.topicTitle ?? t.topicCode, count: 0 };
              prev.count += 1;
              topicsMap.set(t.topicCode, prev);
            }
          } else if (part.project?.masterCall) {
            const code = part.project.masterCall.slice(0, 30);
            const prev = topicsMap.get(code) ?? { code, title: part.project.masterCall, count: 0 };
            prev.count += 1;
            topicsMap.set(code, prev);
          }
        }
        const topTopics = [...topicsMap.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          organisationId: o.organisationId,
          name: o.name,
          country: o.country,
          activityType: o.activityType,
          sme: o.sme,
          isTurkish: o.isTurkish,
          isInterreg: true,
          totalProjects: projectCount > 0 ? projectCount : (o.profile?.totalProjects ?? null),
          coordinatorProjects: projectCount > 0 ? coordCount : (o.profile?.coordinatorProjects ?? null),
          totalEcContribution: totalEc > 0n ? totalEc : (o.profile?.totalEcContribution ?? null),
          topTopics: topTopics.length > 0 ? topTopics : ((o.profile?.topTopics as Array<{ code: string; title?: string; count?: number } | string>) || []),
        };
      });

    } catch (e) {
      queryFailed = true;
      console.warn(`[PartnersPage] CordisOrganization Interreg DB unavailable: ${errorMessage(e)}`);
      await recordAlert({
        level: 'warn',
        source: 'partners_interreg_query_failed',
        message: `CordisOrganization Interreg lookup failed: ${errorMessage(e)}`,
        meta: { module: 'M1', table: 'CordisOrganization' },
        dedupeKey: 'partners-page:interreg-query-failed',
      });
    }
  } else {
    // 1. Try querying CordisPartnerProfile
    try {
      const where: Record<string, unknown> = {};
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { nameNormalized: { contains: q.toUpperCase(), mode: 'insensitive' } },
        ];
      }
      if (country) where.country = country;
      if (activityType) where.activityType = activityType;
      if (isTurkishOnly) where.isTurkish = true;
      if (minProjects > 0) where.totalProjects = { gte: minProjects };

      const [countResult, rawProfiles] = await Promise.all([
        prisma.cordisPartnerProfile.count({ where }),
        prisma.cordisPartnerProfile.findMany({
          where,
          take: 50,
          orderBy: { totalProjects: 'desc' },
          include: {
            organization: {
              select: {
                participations: {
                  where: { project: { framework: 'INTERREG' } },
                  select: { projectId: true },
                  take: 1,
                },
              },
            },
          },
        }),
      ]);
      totalCount = countResult;
      profiles = (rawProfiles as unknown as Array<PartnerRow & { organization?: { participations?: unknown[] } }>).map((p) => ({
        organisationId: p.organisationId,
        name: p.name,
        country: p.country,
        activityType: p.activityType,
        sme: p.sme,
        isTurkish: p.isTurkish,
        isInterreg: Boolean(p.organization?.participations && p.organization.participations.length > 0),
        totalProjects: p.totalProjects,
        coordinatorProjects: p.coordinatorProjects,
        totalEcContribution: p.totalEcContribution,
        topTopics: p.topTopics,
      }));
    } catch (e) {
      // A swallowed failure used to be indistinguishable from "no partners
      // match"; it fell through to the demo dataset and nobody was told.
      // CLAUDE.md rule 6: raise a SystemAlert, do not break the page.
      queryFailed = true;
      console.warn(`[PartnersPage] CordisPartnerProfile DB unavailable: ${errorMessage(e)}`);
      await recordAlert({
        level: 'warn',
        source: 'partners_profile_query_failed',
        message: `CordisPartnerProfile lookup failed: ${errorMessage(e)}`,
        meta: { module: 'M1', table: 'CordisPartnerProfile' },
        // Meta is already constant; only the error text in the message moved, so
        // two renders of the same outage could still open two rows. Page-render
        // alerts fan out with traffic, not with the fault.
        dedupeKey: 'partners-page:profile-query-failed',
      });
    }

    // 2. Fallback to CordisOrganization if profile table is empty or DB offline
    if (profiles.length === 0) {
      try {
        const orgWhere: Record<string, unknown> = {};
        if (q) {
          orgWhere.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { nameNormalized: { contains: q.toUpperCase(), mode: 'insensitive' } },
            { organisationId: { contains: q, mode: 'insensitive' } },
          ];
        }
        if (country) orgWhere.country = country;
        if (activityType) orgWhere.activityType = activityType;
        if (isTurkishOnly) orgWhere.isTurkish = true;

        const [cCount, cOrgs] = await Promise.all([
          prisma.cordisOrganization.count({ where: orgWhere }),
          prisma.cordisOrganization.findMany({
            where: orgWhere,
            take: 50,
            orderBy: { updatedAt: 'desc' },
            include: { profile: true },
          }),
        ]);

        if (cOrgs.length > 0) {
          // Totals come from the database for this page's rows, not from a
          // participation list, so an organisation with many projects is counted
          // in full and nothing unbounded is read.
          const pageOrgIds = cOrgs.map((o) => o.organisationId);
          const [totalRows, interregRows] = await Promise.all([
            prisma.cordisParticipation.groupBy({
              by: ['organisationId', 'role'],
              where: { organisationId: { in: pageOrgIds } },
              _count: { _all: true },
              _sum: { ecContribution: true },
            }),
            prisma.cordisParticipation.findMany({
              where: { organisationId: { in: pageOrgIds }, project: { framework: 'INTERREG' } },
              distinct: ['organisationId'],
              select: { organisationId: true },
            }),
          ]);
          const interregIds = new Set(interregRows.map((r) => r.organisationId));
          const totalsById = new Map<string, { projects: number; coordinators: number; ec: bigint }>();
          for (const r of totalRows) {
            const t = totalsById.get(r.organisationId) ?? { projects: 0, coordinators: 0, ec: 0n };
            t.projects += r._count._all;
            if (r.role === 'coordinator') t.coordinators += r._count._all;
            t.ec += r._sum.ecContribution ?? 0n;
            totalsById.set(r.organisationId, t);
          }

          dataSource = 'cordis_organization';
          totalCount = cCount;
          profiles = cOrgs.map((o) => {
            const totals = totalsById.get(o.organisationId);
            const parts = totals?.projects ?? 0;
            const hasInterreg = interregIds.has(o.organisationId);
            const coordCount = totals?.coordinators ?? 0;
            const totalEc = totals?.ec ?? 0n;

            if (parts === 0) {
              return {
                organisationId: o.organisationId,
                name: o.name,
                country: o.country,
                activityType: o.activityType,
                sme: o.sme,
                isTurkish: o.isTurkish,
                isInterreg: false,
                totalProjects: null,
                coordinatorProjects: null,
                totalEcContribution: null,
                topTopics: [],
              };
            }

            return {
              organisationId: o.organisationId,
              name: o.name,
              country: o.country,
              activityType: o.activityType,
              sme: o.sme,
              isTurkish: o.isTurkish,
              isInterreg: hasInterreg,
              totalProjects: parts,
              coordinatorProjects: coordCount,
              totalEcContribution: totalEc > 0n ? totalEc : null,
              topTopics: [],
            };
          });
        }
      } catch (e) {
        queryFailed = true;
        console.warn(`[PartnersPage] CordisOrganization DB unavailable: ${errorMessage(e)}`);
        await recordAlert({
          level: 'warn',
          source: 'partners_organization_query_failed',
          message: `CordisOrganization lookup failed: ${errorMessage(e)}`,
          meta: { module: 'M1', table: 'CordisOrganization' },
          // Kept separate from the profile-table alert above: they are two
          // different reads and only one of them failing is a real distinction.
          dedupeKey: 'partners-page:organization-query-failed',
        });
      }
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-8 sm:px-4 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbDashboard')}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{t('breadcrumbCurrent')}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            {t('title')}
          </h1>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full">
            {t('sourceBadge')}
          </span>
        </div>
      </div>

      {/* Pages that used to be reachable only by typing their address (TASK-MVBB4FCX2Q24T K-1). */}
      <nav
        aria-labelledby="partners-cross-links-label"
        data-testid="partners-cross-links"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <span id="partners-cross-links-label" className="text-xs font-semibold text-ink-2 uppercase tracking-wider mr-1">
          {tLinks('label')}
        </span>
        <Link
          href={getWorkspaceRoute('partnerLeaders', locale, workspace)}
          data-testid="partners-link-leaders"
          className="inline-flex items-center min-h-9 px-3 py-1.5 rounded-lg border border-border bg-surface font-medium text-ink-2 hover:text-ink hover:border-accent/40 transition-colors"
        >
          {tLinks('leaders')}
        </Link>
        <ModuleLink
          module="M5"
          href={getWorkspaceRoute('reportsPersonDays', locale, workspace)}
          data-testid="partners-link-person-days"
          className="inline-flex items-center min-h-9 px-3 py-1.5 rounded-lg border border-border bg-surface font-medium text-ink-2 hover:text-ink hover:border-accent/40 transition-colors"
        >
          {tLinks('personDays')}
        </ModuleLink>
      </nav>
      <p className="text-[11px] text-muted">
        {t('attribution')}
      </p>

      {/* Client Filter Bar Component */}
      <PartnerFilters
        initialFilters={{
          q,
          country,
          activityType,
          isTurkish: isTurkishOnly,
          isInterreg: isInterregOnly,
          minProjects,
        }}
      />

      {/* Active Filter Indicators */}
      {(q || country || activityType || isTurkishOnly || isInterregOnly || minProjects > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
          <span className="font-bold text-blue-900">{t('activeFilters')}</span>
          {q && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">{t('chipSearch', { query: q })}</span>}
          {country && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">{t('chipCountry', { country })}</span>}
          {activityType && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">{t('chipType', { type: activityType })}</span>}
          {isTurkishOnly && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">🇹🇷 {t('turkishOnlyTag')}</span>}
          {isInterregOnly && <span className="bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono px-2 py-0.5 rounded font-bold">🇪🇺 {t('interregPartnersTag')}</span>}
          {minProjects > 0 && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">{t('minProjectsTag', { count: minProjects })}</span>}
        </div>
      )}

      {/* A failed lookup is said out loud. It used to fall through to a demo
          dataset, so the page looked healthiest exactly when it was broken. */}
      {queryFailed && (
        <div
          role="alert"
          className="border border-amber-200 bg-amber-50 text-amber-900 text-xs rounded-xl p-4"
        >
          <p className="font-bold">
            {t('dbUnavailableTitle')}
          </p>
          <p className="mt-1">
            {t('dbUnavailableBody')}
          </p>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-surface border border-border rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-ground/50 flex justify-between items-center text-xs">
          <span className="font-bold text-ink">
            {isInterregOnly
              ? t('foundInterreg', { count: totalCount })
              : t('foundAll', { count: totalCount })}
          </span>
          <span className="text-muted text-[11px] font-mono">
            {t('pageShowing')} ({dataSource})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-ground/60 border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-4">{t('colPic')}</th>
                <th className="p-4">{t('colName')}</th>
                <th className="p-4">{t('colCountry')}</th>
                <th className="p-4">{t('colType')}</th>
                <th className="p-4 text-center">{t('colProjects')}</th>
                <th className="p-4 text-center">{t('colCoordinations')}</th>
                <th className="p-4 text-right">{t('colGrant')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.map((p) => (
                <tr key={p.organisationId} className="hover:bg-surface-hover transition-colors">
                  <td className="p-4 font-mono font-semibold">
                    <span className="text-blue-600 font-bold">{p.organisationId}</span>
                  </td>
                  <td className="p-4 font-semibold text-ink max-w-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{p.name}</span>
                      {p.isTurkish && (
                        <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold font-mono px-1.5 py-0.2 rounded">
                          TR
                        </span>
                      )}
                      {p.sme && (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold font-mono px-1.5 py-0.2 rounded">
                          {t('smeBadge')}
                        </span>
                      )}
                      {p.isInterreg && (
                        <span
                          className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold font-mono px-1.5 py-0.2 rounded"
                          title={t('interregParticipantTitle')}
                        >
                          INTERREG
                        </span>
                      )}
                    </div>

                    {/* Top topics tag pills */}
                    {p.topTopics && Array.isArray(p.topTopics) && p.topTopics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.topTopics.slice(0, 3).map((t, idx: number) => (
                          <span key={idx} className="bg-ground text-ink-2 border border-border text-[10px] px-1.5 py-0.5 rounded font-mono truncate max-w-[150px]">
                            {typeof t === 'string' ? t : t.code}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-ink-2 font-mono font-bold">{p.country || '-'}</td>
                  <td className="p-4 text-ink-2">
                    <span className="bg-ground border border-border px-2 py-0.5 rounded text-[11px] font-mono font-bold">
                      {p.activityType || 'OTH'}
                    </span>
                  </td>
                  {/* An unknown figure shows as "—". `|| 0` used to turn every
                      unknown into a confident zero. */}
                  <td className="p-4 text-center font-bold font-mono text-ink text-sm">
                    {p.totalProjects ?? '—'}
                  </td>
                  <td className="p-4 text-center font-bold font-mono text-purple-700">
                    {p.coordinatorProjects ?? '—'}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-emerald-700">
                    {p.totalEcContribution === null
                      ? '—'
                      : formatWholeMoney(p.totalEcContribution, 'EUR', locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {profiles.length === 0 && (
          <div className="p-12 text-center text-muted text-xs space-y-2">
            <p className="font-bold text-ink">
              {isInterregOnly ? t('emptyInterreg') : t('emptyCordis')}
            </p>
            <p>
              {t('emptyHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
