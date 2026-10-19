/**
 * FO-19 (TASK-MVBIXPP33UK1B) — the closed option lists of the public expert
 * pre-registration form. No server import, so the form can read the same slugs
 * the server accepts; the server half is ./server/.
 *
 * Each option carries a slug (what is stored) and, where the label is shown, an
 * i18n key. The label text itself lives in messages/*.json (the `ExpertPrereg`
 * namespace, owned by the frontend card). Provinces are the exception: they are
 * proper nouns, identical in both UI languages, so the name is carried here.
 *
 * Changing a slug is a data migration, not an edit: rows store the slug.
 */

/** The 81 provinces of Türkiye by plate code. Same spelling as src/lib/readiness/provinces.ts. */
export const PROVINCES = [
  { value: '01', name: 'Adana' },
  { value: '02', name: 'Adıyaman' },
  { value: '03', name: 'Afyonkarahisar' },
  { value: '04', name: 'Ağrı' },
  { value: '05', name: 'Amasya' },
  { value: '06', name: 'Ankara' },
  { value: '07', name: 'Antalya' },
  { value: '08', name: 'Artvin' },
  { value: '09', name: 'Aydın' },
  { value: '10', name: 'Balıkesir' },
  { value: '11', name: 'Bilecik' },
  { value: '12', name: 'Bingöl' },
  { value: '13', name: 'Bitlis' },
  { value: '14', name: 'Bolu' },
  { value: '15', name: 'Burdur' },
  { value: '16', name: 'Bursa' },
  { value: '17', name: 'Çanakkale' },
  { value: '18', name: 'Çankırı' },
  { value: '19', name: 'Çorum' },
  { value: '20', name: 'Denizli' },
  { value: '21', name: 'Diyarbakır' },
  { value: '22', name: 'Edirne' },
  { value: '23', name: 'Elazığ' },
  { value: '24', name: 'Erzincan' },
  { value: '25', name: 'Erzurum' },
  { value: '26', name: 'Eskişehir' },
  { value: '27', name: 'Gaziantep' },
  { value: '28', name: 'Giresun' },
  { value: '29', name: 'Gümüşhane' },
  { value: '30', name: 'Hakkari' },
  { value: '31', name: 'Hatay' },
  { value: '32', name: 'Isparta' },
  { value: '33', name: 'Mersin' },
  { value: '34', name: 'İstanbul' },
  { value: '35', name: 'İzmir' },
  { value: '36', name: 'Kars' },
  { value: '37', name: 'Kastamonu' },
  { value: '38', name: 'Kayseri' },
  { value: '39', name: 'Kırklareli' },
  { value: '40', name: 'Kırşehir' },
  { value: '41', name: 'Kocaeli' },
  { value: '42', name: 'Konya' },
  { value: '43', name: 'Kütahya' },
  { value: '44', name: 'Malatya' },
  { value: '45', name: 'Manisa' },
  { value: '46', name: 'Kahramanmaraş' },
  { value: '47', name: 'Mardin' },
  { value: '48', name: 'Muğla' },
  { value: '49', name: 'Muş' },
  { value: '50', name: 'Nevşehir' },
  { value: '51', name: 'Niğde' },
  { value: '52', name: 'Ordu' },
  { value: '53', name: 'Rize' },
  { value: '54', name: 'Sakarya' },
  { value: '55', name: 'Samsun' },
  { value: '56', name: 'Siirt' },
  { value: '57', name: 'Sinop' },
  { value: '58', name: 'Sivas' },
  { value: '59', name: 'Tekirdağ' },
  { value: '60', name: 'Tokat' },
  { value: '61', name: 'Trabzon' },
  { value: '62', name: 'Tunceli' },
  { value: '63', name: 'Şanlıurfa' },
  { value: '64', name: 'Uşak' },
  { value: '65', name: 'Van' },
  { value: '66', name: 'Yozgat' },
  { value: '67', name: 'Zonguldak' },
  { value: '68', name: 'Aksaray' },
  { value: '69', name: 'Bayburt' },
  { value: '70', name: 'Karaman' },
  { value: '71', name: 'Kırıkkale' },
  { value: '72', name: 'Batman' },
  { value: '73', name: 'Şırnak' },
  { value: '74', name: 'Bartın' },
  { value: '75', name: 'Ardahan' },
  { value: '76', name: 'Iğdır' },
  { value: '77', name: 'Yalova' },
  { value: '78', name: 'Karabük' },
  { value: '79', name: 'Kilis' },
  { value: '80', name: 'Osmaniye' },
  { value: '81', name: 'Düzce' },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]['value'];

/** Expertise themes (slug + i18n key). */
export const EXPERTISE_AREAS = [
  'climate-environment',
  'circular-economy',
  'water-management',
  'biodiversity',
  'energy',
  'digital-ict',
  'artificial-intelligence',
  'cybersecurity',
  'data-science',
  'health',
  'public-health',
  'education',
  'vocational-training',
  'higher-education',
  'youth',
  'culture',
  'cultural-heritage',
  'media-journalism',
  'sport',
  'agriculture',
  'food-systems',
  'fisheries',
  'rural-development',
  'urban-planning',
  'construction',
  'mobility-transport',
  'maritime',
  'tourism',
  'migration',
  'social-inclusion',
  'gender-equality',
  'disability',
  'civil-society',
  'public-administration',
  'anti-corruption-governance',
  'human-rights',
  'justice',
  'employment',
  'entrepreneurship-sme',
  'research-innovation',
  'financial-services',
  'security',
  'disaster-risk',
] as const;

export type ExpertiseArea = (typeof EXPERTISE_AREAS)[number];

/** The role the expert plays in a project. */
export const ROLES = [
  'coordinator',
  'project-manager',
  'financial-manager',
  'wp-leader',
  'evaluator',
  'proposal-writer',
  'dissemination',
  'trainer',
  'researcher',
  'other',
] as const;

export type ExpertRole = (typeof ROLES)[number];

/** Funding programmes the expert has worked with. */
export const PROGRAMMES = [
  'horizon-europe-h2020',
  'erasmus-plus',
  'ipa',
  'interreg',
  'life',
  'cerv',
  'digital-europe',
  'eu4health',
  'creative-europe',
  'national-tubitak',
  'other',
] as const;

export type ExpertProgramme = (typeof PROGRAMMES)[number];

/** Working languages. */
export const LANGUAGES = ['tr', 'en', 'de', 'fr', 'ar', 'ru', 'other'] as const;

export type ExpertLanguage = (typeof LANGUAGES)[number];

/** Label key for an option in the `ExpertPrereg` messages namespace. */
export function optionLabelKey(group: 'areas' | 'roles' | 'programmes' | 'languages', slug: string): string {
  return `ExpertPrereg.options.${group}.${slug}`;
}
