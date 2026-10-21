import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getWorkspaceRoute } from '@/lib/routes';
import { ModuleLink } from '@/components/ModuleLink';
import { PartnerFilters } from './PartnerFilters';
import { errorMessage } from '@/lib/errors';
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

/** The CordisOrganization columns the second fallback reads. */
interface CordisOrganizationRow {
  organisationId: string;
  name: string;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  isTurkish: boolean;
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
  const isTr = locale === 'tr';
  const tLinks = await getTranslations({ locale, namespace: 'PartnersPage.crossLinks' });

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

      const [cCount, cOrgs] = await Promise.all([
        prisma.cordisOrganization.count({ where: orgWhere }),
        prisma.cordisOrganization.findMany({
          where: orgWhere,
          take: 50,
          orderBy: { updatedAt: 'desc' },
          include: {
            profile: true,
            participations: {
              where: {
                project: {
                  framework: 'INTERREG',
                },
              },
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

      dataSource = 'cordis_organization_interreg';
      totalCount = cCount;
      profiles = cOrgs.map((o) => {
        const parts = o.participations || [];
        const coordCount = parts.filter((p) => p.role === 'coordinator' || p.role === 'lead').length;
        const totalEc = parts.reduce((sum, p) => sum + (p.ecContribution ?? 0n), 0n);

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
          totalProjects: parts.length > 0 ? parts.length : (o.profile?.totalProjects ?? null),
          coordinatorProjects: parts.length > 0 ? coordCount : (o.profile?.coordinatorProjects ?? null),
          totalEcContribution: totalEc > 0n ? totalEc : (o.profile?.totalEcContribution ?? null),
          topTopics: topTopics.length > 0 ? topTopics : ((o.profile?.topTopics as Array<{ code: string; title?: string; count?: number } | string>) || []),
        };
      });

      if (minProjects > 0) {
        profiles = profiles.filter((p) => (p.totalProjects ?? 0) >= minProjects);
      }
    } catch (e) {
      queryFailed = true;
      console.warn(`[PartnersPage] CordisOrganization Interreg DB unavailable: ${errorMessage(e)}`);
      await recordAlert({
        level: 'warn',
        source: 'partners_interreg_query_failed',
        message: `CordisOrganization Interreg lookup failed: ${errorMessage(e)}`,
        meta: { module: 'M8', table: 'CordisOrganization' },
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
            include: {
              profile: true,
              participations: {
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

        if (cOrgs.length > 0) {
          dataSource = 'cordis_organization';
          totalCount = cCount;
          profiles = cOrgs.map((o) => {
            const parts = o.participations || [];
            const hasInterreg = parts.some((p) => p.project?.framework === 'INTERREG');
            const coordCount = parts.filter((p) => p.role === 'coordinator' || p.role === 'lead').length;
            const totalEc = parts.reduce((sum, p) => sum + (p.ecContribution ?? 0n), 0n);

            if (parts.length === 0) {
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
              totalProjects: parts.length,
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
          {isTr ? 'Panel' : 'Dashboard'}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{isTr ? 'Ortak Arama & CORDIS / Interreg (M1/M8)' : 'Partners & CORDIS / Interreg (M1/M8)'}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            {isTr ? 'M8 / M1 Partner Arama & CORDIS / Interreg Ortak Veritabanı' : 'M8 / M1 Partner Search & CORDIS / Interreg Database'}
          </h1>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            {isTr
              ? 'Avrupa Komisyonu CORDIS (Horizon Europe & H2020) ve keep.eu Interreg (IPA Sınır Ötesi) fonlanmış verilerinden türetilen Avrupalı ve Türk kurumların geçmiş proje deneyimleri, koordinatörlük başarıları, AB katkıları ve ortaklık ağı.'
              : 'Past EU project participations, coordinator achievements, EC funding, and partnership networks of European and Turkish organizations derived from official CORDIS and keep.eu Interreg data.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full">
            {isTr ? 'Kaynak: CORDIS & keep.eu, Avrupa Komisyonu' : 'Source: CORDIS & keep.eu, European Commission'}
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

      {/* Client Filter Bar Component */}
      <PartnerFilters
        isTr={isTr}
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
          <span className="font-bold text-blue-900">{isTr ? 'Aktif Filtreler:' : 'Active Filters:'}</span>
          {q && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Arama: &quot;{q}&quot;</span>}
          {country && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Ülke: {country}</span>}
          {activityType && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Tip: {activityType}</span>}
          {isTurkishOnly && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">🇹🇷 Türk Kuruluşlar</span>}
          {isInterregOnly && (
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono px-2 py-0.5 rounded font-bold">
              {isTr ? '🇪🇺 Interreg Ortakları' : '🇪🇺 Interreg Partners'}
            </span>
          )}
          {minProjects > 0 && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Min. {minProjects} Proje</span>}
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
            {isTr ? 'Ortak veritabanı şu anda okunamadı.' : 'The partner database could not be read.'}
          </p>
          <p className="mt-1">
            {isTr
              ? 'Aşağıdaki liste eksik olabilir. Sorun kaydedildi; lütfen birazdan tekrar deneyin.'
              : 'The list below may be incomplete. The failure has been recorded; please try again shortly.'}
          </p>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-surface border border-border rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-ground/50 flex justify-between items-center text-xs">
          <span className="font-bold text-ink">
            {isTr
              ? `Toplam ${totalCount.toLocaleString()} ${isInterregOnly ? 'Interreg Ortak Profili' : 'Ortak Profili'} Bulundu`
              : `Found ${totalCount.toLocaleString()} ${isInterregOnly ? 'Interreg Partner Profiles' : 'Partner Profiles'}`}
          </span>
          <span className="text-muted text-[11px] font-mono">
            {isTr ? 'Sayfa 1 / Gösteriliyor' : 'Page 1 / Showing'} ({dataSource})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-ground/60 border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-4">{isTr ? 'PIC Kodu' : 'PIC'}</th>
                <th className="p-4">{isTr ? 'Kurum Adı' : 'Organization Name'}</th>
                <th className="p-4">{isTr ? 'Ülke' : 'Country'}</th>
                <th className="p-4">{isTr ? 'Kurum Türü' : 'Type'}</th>
                <th className="p-4 text-center">{isTr ? 'Toplam Proje' : 'Total Projects'}</th>
                <th className="p-4 text-center">{isTr ? 'Koordinatörlük' : 'Coordinations'}</th>
                <th className="p-4 text-right">{isTr ? 'AB Desteği (€)' : 'EC Grant (€)'}</th>
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
                          SME
                        </span>
                      )}
                      {p.isInterreg && (
                        <span
                          className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold font-mono px-1.5 py-0.2 rounded"
                          title={isTr ? 'Interreg / Sınır Ötesi İşbirliği Programı Katılımcısı' : 'Interreg / Cross-border Cooperation Programme Participant'}
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
                      : `€ ${Number(p.totalEcContribution).toLocaleString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {profiles.length === 0 && (
          <div className="p-12 text-center text-muted text-xs space-y-2">
            <p className="font-bold text-ink">
              {isTr
                ? (isInterregOnly ? 'Aradığınız kriterlere uygun Interreg ortağı bulunamadı.' : 'Aradığınız kriterlere uygun CORDIS ortağı bulunamadı.')
                : (isInterregOnly ? 'No Interreg partners found matching your search criteria.' : 'No CORDIS partners found matching your search criteria.')}
            </p>
            <p>
              {isTr
                ? 'Arama kriterlerinizi değiştirebilir veya filtreleri temizleyebilirsiniz.'
                : 'Reset your search filters or try different keywords.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
