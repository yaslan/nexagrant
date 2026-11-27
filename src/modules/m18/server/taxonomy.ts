import type { OrgType } from '@prisma/client';

import type { TrProvince } from '@/lib/readiness/provinces';

/**
 * NG-137 (M18-F2). HibeLead's organisation taxonomy mapped onto NexaGrant's `OrgType`.
 *
 * The 18 codes are HibeLead's `org_type` enum, recovered from its database on 2026-11-13
 * (the source code is gone; decision K-581471). `LeadOrganization.orgType` keeps the
 * HibeLead code as text; this table is the one place that turns it into an `OrgType`
 * (the applicant category calls are written against) plus the code itself as sub-type,
 * so the finer distinction is never lost.
 */
export const HIBELEAD_ORG_TYPES = [
  'municipality',
  'metropolitan_municipality',
  'special_provincial_admin',
  'village_union',
  'cooperative',
  'agricultural_credit_coop',
  'producer_union',
  'association',
  'foundation',
  'chamber',
  'osb',
  'technopark',
  'university',
  'school',
  'public_institution',
  'sme',
  'large_company',
  'ngo_other',
] as const;

export type HibeLeadOrgType = (typeof HIBELEAD_ORG_TYPES)[number];

/**
 * Judgement calls, written down so they can be argued with:
 * - chambers (TOBB/TESK members) are public-law professional bodies, so PUBLIC;
 * - cooperatives and producer unions are member-owned, not-for-profit bodies, so NGO;
 * - organised industrial zones and technoparks are clusters of firms, so CLUSTER;
 * - special provincial administrations, village unions and schools are public bodies.
 */
const ORG_TYPE_MAP: Record<HibeLeadOrgType, OrgType> = {
  municipality: 'MUNICIPALITY',
  metropolitan_municipality: 'MUNICIPALITY',
  special_provincial_admin: 'PUBLIC',
  village_union: 'PUBLIC',
  cooperative: 'NGO',
  agricultural_credit_coop: 'NGO',
  producer_union: 'NGO',
  association: 'NGO',
  foundation: 'NGO',
  chamber: 'PUBLIC',
  osb: 'CLUSTER',
  technopark: 'CLUSTER',
  university: 'UNIVERSITY',
  school: 'PUBLIC',
  public_institution: 'PUBLIC',
  sme: 'SME',
  large_company: 'LARGE',
  ngo_other: 'NGO',
};

export interface MappedOrgType {
  orgType: OrgType;
  /** The HibeLead code, kept as the sub-type. */
  subType: HibeLeadOrgType;
}

export function isHibeLeadOrgType(code: string): code is HibeLeadOrgType {
  return (HIBELEAD_ORG_TYPES as readonly string[]).includes(code);
}

/** `null` for an unknown or empty code: an unmapped type is "unknown", never a guess. */
export function mapOrgType(code: string | null | undefined): MappedOrgType | null {
  const normalised = code?.trim().toLowerCase() ?? '';
  if (!isHibeLeadOrgType(normalised)) return null;
  return { orgType: ORG_TYPE_MAP[normalised], subType: normalised };
}

/**
 * Licence-plate code → province, in `TR_PROVINCES` spelling (typed, so a misspelling does
 * not compile). Index 0 is plate 01. The order is the plate order, not alphabetical.
 */
const PROVINCE_BY_PLATE: readonly TrProvince[] = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
  'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
  'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan',
  'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta',
  'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
  'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla',
  'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt',
  'Sinop', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak',
  'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman',
  'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye',
  'Düzce',
];

/** "6", "06" and " 06 " are plate 06. Returns the two-digit code or `null`. */
export function normalisePlateCode(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const text = String(code).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  if (n < 1 || n > PROVINCE_BY_PLATE.length) return null;
  return String(n).padStart(2, '0');
}

export function provinceForPlate(code: string | number | null | undefined): TrProvince | null {
  const plate = normalisePlateCode(code);
  return plate === null ? null : (PROVINCE_BY_PLATE[Number(plate) - 1] ?? null);
}

export function plateForProvince(province: string): string | null {
  const index = PROVINCE_BY_PLATE.findIndex(
    (p) => p.toLocaleLowerCase('tr-TR') === province.trim().toLocaleLowerCase('tr-TR')
  );
  return index === -1 ? null : String(index + 1).padStart(2, '0');
}

export const PLATE_CODE_COUNT = PROVINCE_BY_PLATE.length;
