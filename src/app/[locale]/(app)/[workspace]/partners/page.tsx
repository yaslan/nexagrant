import { prisma } from '@/lib/db';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { PartnerFilters } from './PartnerFilters';
import { errorMessage } from '@/lib/errors';
import type { LegacyOrganizationRow } from '@/types/db-rows';

const DEMO_CORDIS_PARTNERS = [
  {
    organisationId: '999908205',
    name: 'MIDDLE EAST TECHNICAL UNIVERSITY (METU)',
    country: 'TR',
    activityType: 'HES',
    sme: false,
    isTurkish: true,
    totalProjects: 84,
    coordinatorProjects: 12,
    totalEcContribution: BigInt(24500000),
    topTopics: [{ code: 'HORIZON-CL4-2026-TWIN-01' }, { code: 'HORIZON-CL5-2025-D3-01' }],
  },
  {
    organisationId: '999993557',
    name: 'İSTANBUL TEKNİK ÜNİVERSİTESİ (İTÜ)',
    country: 'TR',
    activityType: 'HES',
    sme: false,
    isTurkish: true,
    totalProjects: 62,
    coordinatorProjects: 8,
    totalEcContribution: BigInt(18200000),
    topTopics: [{ code: 'HORIZON-CL5-2026-D2-02' }, { code: 'HORIZON-CL4-2025-RESILIENCE' }],
  },
  {
    organisationId: '999908302',
    name: 'TÜBİTAK MARMARA ARAŞTIRMA MERKEZİ (MAM)',
    country: 'TR',
    activityType: 'REC',
    sme: false,
    isTurkish: true,
    totalProjects: 51,
    coordinatorProjects: 6,
    totalEcContribution: BigInt(15800000),
    topTopics: [{ code: 'HORIZON-CL6-2026-BIODIV' }],
  },
  {
    organisationId: '999885896',
    name: 'KOÇ ÜNİVERSİTESİ',
    country: 'TR',
    activityType: 'HES',
    sme: false,
    isTurkish: true,
    totalProjects: 44,
    coordinatorProjects: 14,
    totalEcContribution: BigInt(16800000),
    topTopics: [{ code: 'HORIZON-ERC-2026-STG' }],
  },
  {
    organisationId: '999863876',
    name: 'ARÇELİK A.Ş.',
    country: 'TR',
    activityType: 'PRC',
    sme: false,
    isTurkish: true,
    totalProjects: 35,
    coordinatorProjects: 4,
    totalEcContribution: BigInt(11200000),
    topTopics: [{ code: 'HORIZON-CL5-2026-D3-02' }],
  },
  {
    organisationId: '999847192',
    name: 'ASELSAN ELEKTRONİK SANAYİ VE TİCARET A.Ş.',
    country: 'TR',
    activityType: 'PRC',
    sme: false,
    isTurkish: true,
    totalProjects: 28,
    coordinatorProjects: 2,
    totalEcContribution: BigInt(9400000),
    topTopics: [{ code: 'HORIZON-CL3-2026-INFRA' }],
  },
  {
    organisationId: '999980760',
    name: 'FRAUNHOFER GESELLSCHAFT ZUR FOERDERUNG DER ANGEWANDTEN FORSCHUNG E.V.',
    country: 'DE',
    activityType: 'REC',
    sme: false,
    isTurkish: false,
    totalProjects: 1420,
    coordinatorProjects: 310,
    totalEcContribution: BigInt(850000000),
    topTopics: [{ code: 'HORIZON-CL5-2026-D3-01' }, { code: 'HORIZON-CL4-2026-DIGITAL' }],
  },
  {
    organisationId: '999997930',
    name: 'CENTRE NATIONAL DE LA RECHERCHE SCIENTIFIQUE (CNRS)',
    country: 'FR',
    activityType: 'REC',
    sme: false,
    isTurkish: false,
    totalProjects: 1890,
    coordinatorProjects: 420,
    totalEcContribution: BigInt(1120000000),
    topTopics: [{ code: 'HORIZON-ERC-2026-ADV' }],
  },
  {
    organisationId: '999983961',
    name: 'SIEMENS AKTIENGESELLSCHAFT',
    country: 'DE',
    activityType: 'PRC',
    sme: false,
    isTurkish: false,
    totalProjects: 340,
    coordinatorProjects: 45,
    totalEcContribution: BigInt(210000000),
    topTopics: [{ code: 'HORIZON-CL4-2026-TWIN-01' }],
  },
  {
    organisationId: '912743326',
    name: 'LOMARTOV SL',
    country: 'ES',
    activityType: 'PRC',
    sme: true,
    isTurkish: false,
    totalProjects: 18,
    coordinatorProjects: 3,
    totalEcContribution: BigInt(4800000),
    topTopics: [{ code: 'HORIZON-CL5-2021-D2-01-11' }],
  },
  {
    organisationId: '905221942',
    name: 'BARKHAUSEN INSTITUT GGMBH',
    country: 'DE',
    activityType: 'REC',
    sme: true,
    isTurkish: false,
    totalProjects: 12,
    coordinatorProjects: 2,
    totalEcContribution: BigInt(3600000),
    topTopics: [{ code: 'HORIZON-CL4-2025-DIGITAL' }],
  },
  {
    organisationId: '999879881',
    name: 'POLITECNICO DI MILANO',
    country: 'IT',
    activityType: 'HES',
    sme: false,
    isTurkish: false,
    totalProjects: 410,
    coordinatorProjects: 85,
    totalEcContribution: BigInt(260000000),
    topTopics: [{ code: 'HORIZON-CL5-2026-D1-01' }],
  },
];

/**
 * A partner row as this table renders it. The three fallback queries below
 * (CordisPartnerProfile, then CordisOrganization, then the legacy Organization
 * table) each normalise into this one shape, so the table does not have to know
 * which source it got.
 */
interface PartnerRow {
  organisationId: string;
  name: string;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  isTurkish: boolean;
  totalProjects: number;
  coordinatorProjects: number;
  totalEcContribution: bigint;
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
  searchParams: Promise<{ q?: string; country?: string; activity_type?: string; is_turkish?: string; min_projects?: string }>;
}) {
  const { workspace, locale } = await params;
  const sParams = await searchParams;
  const isTr = locale === 'tr';

  const q = sParams.q?.trim() || '';
  const country = sParams.country?.trim().toUpperCase() || '';
  const activityType = sParams.activity_type?.trim().toUpperCase() || '';
  const isTurkishOnly = sParams.is_turkish === 'true';
  const minProjects = sParams.min_projects ? parseInt(sParams.min_projects, 10) : 0;

  let profiles: PartnerRow[] = [];
  let totalCount = 0;
  let dataSource = 'cordis_partner_profile';

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

    [totalCount, profiles] = await Promise.all([
      prisma.cordisPartnerProfile.count({ where }),
      prisma.cordisPartnerProfile.findMany({
        where,
        take: 50,
        orderBy: { totalProjects: 'desc' },
      }),
    ]);
  } catch (e) {
    console.warn(`[PartnersPage] CordisPartnerProfile DB unavailable: ${errorMessage(e)}`);
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
        }),
      ]);

      if (cOrgs.length > 0) {
        dataSource = 'cordis_organization';
        totalCount = cCount;
        profiles = (cOrgs as CordisOrganizationRow[]).map((o) => ({
          organisationId: o.organisationId,
          name: o.name,
          country: o.country,
          activityType: o.activityType,
          sme: o.sme,
          isTurkish: o.isTurkish,
          totalProjects: 1,
          coordinatorProjects: 0,
          totalEcContribution: BigInt(0),
          topTopics: [],
        }));
      }
    } catch (e) {
      console.warn(`[PartnersPage] CordisOrganization DB unavailable: ${errorMessage(e)}`);
    }
  }

  // 3. Fallback to legacy Organization table if DB is running with legacy seeds
  if (profiles.length === 0) {
    try {
      const legWhere: Record<string, unknown> = {};
      if (q) {
        legWhere.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { id: { contains: q, mode: 'insensitive' } },
        ];
      }
      if (country) legWhere.country = country;
      if (activityType) legWhere.activityType = activityType;
      if (isTurkishOnly) legWhere.country = 'TR';
      if (minProjects > 0) legWhere.participationCount = { gte: minProjects };

      const [legCount, legOrgs] = await Promise.all([
        prisma.organization.count({ where: legWhere }),
        prisma.organization.findMany({
          where: legWhere,
          take: 50,
          orderBy: { participationCount: 'desc' },
        }),
      ]);

      if (legOrgs.length > 0) {
        dataSource = 'organization_legacy';
        totalCount = legCount;
        profiles = (legOrgs as LegacyOrganizationRow[]).map((o) => ({
          organisationId: o.id,
          name: o.name,
          country: o.country,
          activityType: o.activityType,
          sme: o.isSme,
          isTurkish: o.country === 'TR',
          totalProjects: o.participationCount || 1,
          coordinatorProjects: o.coordinatorCount || 0,
          totalEcContribution: o.ecContributionSum || BigInt(0),
          topTopics: [],
        }));
      }
    } catch (e) {
      console.warn(`[PartnersPage] Legacy Organization DB unavailable: ${errorMessage(e)}`);
    }
  }

  // 4. Fallback to resilient Demo CORDIS dataset if database server is offline
  if (profiles.length === 0) {
    dataSource = 'demo_cordis_dataset';
    let filtered = DEMO_CORDIS_PARTNERS;

    if (q) {
      const lower = q.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(lower) || p.organisationId.includes(lower)
      );
    }
    if (country) {
      filtered = filtered.filter((p) => p.country === country);
    }
    if (activityType) {
      filtered = filtered.filter((p) => p.activityType === activityType);
    }
    if (isTurkishOnly) {
      filtered = filtered.filter((p) => p.isTurkish);
    }
    if (minProjects > 0) {
      filtered = filtered.filter((p) => p.totalProjects >= minProjects);
    }

    profiles = filtered;
    totalCount = filtered.length;
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {isTr ? 'Panel' : 'Dashboard'}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{isTr ? 'Ortak Arama & CORDIS (M1)' : 'Partners & CORDIS (M1)'}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            {isTr ? 'M1 Partner Intelligence Database & CORDIS Ortak Arama' : 'M1 Partner Intelligence Database & CORDIS Search'}
          </h1>
          <p className="text-xs text-muted mt-1 max-w-3xl">
            {isTr
              ? 'Avrupa Komisyonu CORDIS (Horizon Europe & H2020) fonlanmış verilerinden türetilen 150.000+ Avrupalı ve Türk kurumun geçmiş proje deneyimleri, koordinatörlük başarıları, AB katkıları ve ortaklık ağı.'
              : 'Past EU project participations, coordinator achievements, EC funding, and partnership networks of 150k+ organizations derived from official CORDIS data.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full">
            {isTr ? 'Kaynak: CORDIS, Avrupa Komisyonu (CC BY 4.0)' : 'Source: CORDIS, European Commission (CC BY 4.0)'}
          </span>
        </div>
      </div>

      {/* Client Filter Bar Component */}
      <PartnerFilters
        isTr={isTr}
        initialFilters={{
          q,
          country,
          activityType,
          isTurkish: isTurkishOnly,
          minProjects,
        }}
      />

      {/* Active Filter Indicators */}
      {(q || country || activityType || isTurkishOnly || minProjects > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
          <span className="font-bold text-blue-900">{isTr ? 'Aktif Filtreler:' : 'Active Filters:'}</span>
          {q && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Arama: &quot;{q}&quot;</span>}
          {country && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Ülke: {country}</span>}
          {activityType && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Tip: {activityType}</span>}
          {isTurkishOnly && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">🇹🇷 Türk Kuruluşlar</span>}
          {minProjects > 0 && <span className="bg-white border border-blue-200 text-blue-800 font-mono px-2 py-0.5 rounded">Min. {minProjects} Proje</span>}
        </div>
      )}

      {/* Results Table */}
      <div className="bg-surface border border-border rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-ground/50 flex justify-between items-center text-xs">
          <span className="font-bold text-ink">
            {isTr ? `Toplam ${totalCount.toLocaleString()} Ortak Profili Bulundu` : `Found ${totalCount.toLocaleString()} Partner Profiles`}
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
                  <td className="p-4 text-center font-bold font-mono text-ink text-sm">
                    {p.totalProjects}
                  </td>
                  <td className="p-4 text-center font-bold font-mono text-purple-700">
                    {p.coordinatorProjects || 0}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-emerald-700">
                    € {Number(p.totalEcContribution || 0).toLocaleString()}
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
                ? 'Aradığınız kriterlere uygun CORDIS ortağı bulunamadı.'
                : 'No CORDIS partners found matching your search criteria.'}
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
