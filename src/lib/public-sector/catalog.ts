/**
 * Public-sector programme catalogue — the programmes a Turkish municipality,
 * metropolitan municipality, union of municipalities or development agency can
 * realistically enter, with the facts an inexperienced applicant needs first.
 *
 * Every figure here is copied from an official source named in `sourceNote`
 * (call document, participating-country list, programme guide, national
 * authority page). A value the source did not state is `null` — never a guess.
 * Re-check the notes when a new work programme is adopted: country lists and
 * lump-sum options change yearly.
 *
 * Consumers: the municipal call radar (`radar.ts`) and the funding-readiness
 * scorecard (`src/lib/readiness/`). Field names are a contract — add fields,
 * do not rename them.
 */

export const PUBLIC_SECTOR_ORG_TYPES = [
  'municipality',
  'metropolitan',
  'development_agency',
  'union_of_municipalities',
] as const;

export type PublicOrgType = (typeof PUBLIC_SECTOR_ORG_TYPES)[number];

/** Who else must be in the project. */
export type PartnerRequirement = 'none' | 'national' | 'transnational';

/**
 * Can an organisation established in Türkiye be a funded beneficiary?
 * - `eligible`: Türkiye participates in the whole programme.
 * - `partial`: Türkiye participates in part of it (some objectives or regions).
 * - `not_eligible`: Türkiye is not on the programme's participating-country list.
 * - `check_call`: depends on each call (e.g. which national funders join).
 */
export type TurkeyEligibility = 'eligible' | 'partial' | 'not_eligible' | 'check_call';

export interface LocalizedText {
  tr: string;
  en: string;
}

/** EUR amounts in minor units (cents), per CLAUDE.md rule 9. */
export interface GrantRange {
  minCents: number | null;
  maxCents: number | null;
  currency: 'EUR';
}

export interface SourceNote {
  url: string;
  /** ISO date the source was read. */
  accessedAt: string;
  /** What was taken from this source. */
  note: string;
}

export interface PublicSectorProgramme {
  /** Stable kebab-case id. */
  key: string;
  name: LocalizedText;
  /**
   * SEDIA (Funding & Tenders portal) programme code the K1 job ingests, or
   * `null` when the programme is not on the portal yet ("no source yet").
   */
  sourceKey: string | null;
  /**
   * Regex source matched against a SEDIA topic identifier to find this
   * programme's topics in the `Topic` table. `null` when `sourceKey` is null.
   * Needed because K1 files every SEDIA topic under the `HE` Programme row, so
   * the identifier is the only reliable programme signal.
   */
  sediaTopicPattern: string | null;
  eligibleOrgTypes: PublicOrgType[];
  /** 1 = good first project, 3 = needs prior EU project experience. */
  difficulty: 1 | 2 | 3;
  /** Typical EU grant per project; `null` when the source gives no range. */
  typicalGrantEur: GrantRange | null;
  /**
   * Share of eligible costs (0–100) the applicant must cover itself.
   * `0` = up to 100% funded. `null` = not a cost-based rate (lump sum) or not
   * stated by the source.
   */
  cofinancingPct: number | null;
  /** A Participant Identification Code (F&T portal) is required to apply. */
  needsPic: boolean;
  needsPartners: PartnerRequirement;
  turkeyEligibility: TurkeyEligibility;
  /**
   * Turkish provinces allowed to take part, or `null` when the whole country is
   * eligible. Interreg programmes are territorial.
   */
  turkeyRegions: string[] | null;
  /** 2–3 sentences of plain Turkish for a first-time applicant. */
  plainTr: string;
  officialUrl: string;
  sourceNote: SourceNote[];
}

const ACCESSED = '2026-09-29';

const cents = (eur: number): number => eur * 100;

/** Interreg NEXT Black Sea Basin — Turkish eligible provinces (national authority page). */
const BLACK_SEA_BASIN_TR_PROVINCES = [
  'Amasya',
  'Artvin',
  'Bartın',
  'Bolu',
  'Çankırı',
  'Çorum',
  'Düzce',
  'Edirne',
  'Giresun',
  'Gümüşhane',
  'İstanbul',
  'Karabük',
  'Kastamonu',
  'Kırklareli',
  'Kocaeli',
  'Ordu',
  'Rize',
  'Sakarya',
  'Samsun',
  'Sinop',
  'Tekirdağ',
  'Tokat',
  'Trabzon',
  'Yalova',
  'Zonguldak',
];

const LOCAL_BODIES: PublicOrgType[] = ['municipality', 'metropolitan', 'union_of_municipalities'];

const CERV_COUNTRY_LIST: SourceNote = {
  url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/cerv/guidance/list-3rd-country-participation_cerv_en.pdf',
  accessedAt: ACCESSED,
  note: 'List of participating countries (CERV) V10.0 – 01.08.2025: Türkiye is not listed; only EU Member States and AL, BA, XK, MD, ME, MK, RS, UA participate.',
};

const HE_COUNTRY_LIST: SourceNote = {
  url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/list-3rd-country-participation_horizon-euratom_en.pdf',
  accessedAt: ACCESSED,
  note: 'List of participating countries (HE) V4.1 – 16.09.2026: Türkiye is an associated country.',
};

const HE_FUNDING_RATES: SourceNote = {
  url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/wp-call/2026-2027/wp-15-general-annexes_horizon-2026-2027_en.pdf',
  accessedAt: ACCESSED,
  note: 'HE WP 2026-2027 General Annexes: RIA 100%, IA 70% except non-profit legal entities up to 100%, CSA 100%.',
};

export const PUBLIC_SECTOR_PROGRAMMES: readonly PublicSectorProgramme[] = [
  {
    key: 'cerv-town-twinning',
    name: {
      tr: 'CERV — Kardeş Şehir (Town-Twinning)',
      en: 'CERV — Town-Twinning',
    },
    sourceKey: 'CERV',
    sediaTopicPattern: '^CERV-\\d{4}-CITIZENS-TOWN-TT',
    eligibleOrgTypes: LOCAL_BODIES,
    difficulty: 1,
    typicalGrantEur: { minCents: cents(8_455), maxCents: cents(50_745), currency: 'EUR' },
    cofinancingPct: null,
    needsPic: true,
    needsPartners: 'transnational',
    turkeyEligibility: 'not_eligible',
    turkeyRegions: null,
    plainTr:
      'İki ülkeden belediyelerin vatandaş buluşmalarını destekleyen, AB fonlarına en kolay giriş kapısı sayılan küçük bir hibedir. Ancak Türkiye CERV programına katılmadığı için Türk belediyeleri başvuru sahibi ya da ortak olamaz. Yalnızca AB’li kardeş şehrin projesine davetli katılımcı olarak gidebilirsiniz.',
    officialUrl:
      'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/CERV-2026-CITIZENS-TOWN-TT',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/cerv/wp-call/2026/call-fiche_cerv-2026-citizens-town-tt_en.pdf',
        accessedAt: ACCESSED,
        note: 'Call document CERV-2026-CITIZENS-TOWN-TT V1.0 – 28.04.2026: budgets EUR 8.455–50.745; lump sum grant; towns/municipalities from at least two eligible countries, one an EU Member State; Participant Register required.',
      },
      CERV_COUNTRY_LIST,
    ],
  },
  {
    key: 'cerv-networks-of-towns',
    name: {
      tr: 'CERV — Kent Ağları (Networks of Towns)',
      en: 'CERV — Networks of Towns',
    },
    sourceKey: 'CERV',
    sediaTopicPattern: '^CERV-\\d{4}-CITIZENS-TOWN-NT',
    eligibleOrgTypes: LOCAL_BODIES,
    difficulty: 2,
    typicalGrantEur: { minCents: cents(100_000), maxCents: null, currency: 'EUR' },
    cofinancingPct: null,
    needsPic: true,
    needsPartners: 'transnational',
    turkeyEligibility: 'not_eligible',
    turkeyRegions: null,
    plainTr:
      'Birkaç ülkedeki belediyelerin ortak bir konuda uzun soluklu ağ kurmasını destekler. Türkiye CERV programına katılmadığı için Türk belediyeleri bu çağrıya başvuramaz.',
    officialUrl:
      'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/CERV-2026-CITIZENS-TOWN-NT',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/cerv/wp-call/2026/call-fiche_cerv-2026-citizens-town-nt_en.pdf',
        accessedAt: ACCESSED,
        note: 'Call document CERV-2026-CITIZENS-TOWN-NT: minimum grant EUR 100.000, no maximum; lump sum; at least 2 different eligible countries.',
      },
      CERV_COUNTRY_LIST,
    ],
  },
  {
    key: 'erasmus-ka2-partnerships',
    name: {
      tr: 'Erasmus+ KA2 — Küçük Ölçekli ve İşbirliği Ortaklıkları',
      en: 'Erasmus+ KA2 — Small-scale and Cooperation Partnerships',
    },
    sourceKey: 'ERASMUS',
    sediaTopicPattern: '^ERASMUS-(EDU|YOUTH)-\\d{4}-PCOOP',
    eligibleOrgTypes: LOCAL_BODIES,
    difficulty: 2,
    typicalGrantEur: { minCents: cents(30_000), maxCents: cents(400_000), currency: 'EUR' },
    cofinancingPct: null,
    needsPic: false,
    needsPartners: 'transnational',
    turkeyEligibility: 'eligible',
    turkeyRegions: null,
    plainTr:
      'Yetişkin eğitimi, gençlik ve okul konularında belediyelerin başka ülkelerdeki kurumlarla ortak proje yapmasını sağlar. Küçük ölçekli ortaklıkta 30.000 ya da 60.000 avroluk sabit hibe vardır ve iki ülkeden iki kurum yeterlidir. Başvurular Türkiye Ulusal Ajansı’na yapılır; bunun için PIC değil Kurum Kimlik Numarası (OID) gerekir.',
    officialUrl: 'https://erasmus-plus.ec.europa.eu/programme-guide/part-b/key-action-2',
    sourceNote: [
      {
        url: 'https://erasmus-plus.ec.europa.eu/programme-guide/part-b/key-action-2/small-scale-partnerships',
        accessedAt: ACCESSED,
        note: 'Small-scale partnerships: lump sums EUR 30 000 or 60 000; minimum two organisations from two different Member States or associated third countries; local, regional and national authorities may take part.',
      },
      {
        url: 'https://erasmus-plus.ec.europa.eu/programme-guide/part-b/key-action-2/cooperation-partnerships',
        accessedAt: ACCESSED,
        note: 'Cooperation partnerships: lump sums EUR 120 000, 250 000 or 400 000; minimum three organisations from three different eligible countries.',
      },
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/erasmus/guidance/list-3rd-country-participation_erasmus_en.pdf',
        accessedAt: ACCESSED,
        note: 'List of participating countries (ERASMUS) V3.0 – 15.10.2025: Turkey participates (agreement signed November 2021, in force 01.01.2021).',
      },
    ],
  },
  {
    key: 'life',
    name: {
      tr: 'LIFE — Çevre ve İklim Eylemi (SAP, SIP, Teknik Destek, Temiz Enerji)',
      en: 'LIFE — Environment and Climate Action (SAP, SIP, TA, Clean Energy Transition)',
    },
    sourceKey: 'LIFE',
    sediaTopicPattern: '^LIFE-\\d{4}-(SAP|STRAT|TA|CET)-',
    eligibleOrgTypes: LOCAL_BODIES,
    difficulty: 3,
    typicalGrantEur: { minCents: cents(700_000), maxCents: cents(10_000_000), currency: 'EUR' },
    cofinancingPct: 40,
    needsPic: true,
    needsPartners: 'none',
    turkeyEligibility: 'not_eligible',
    turkeyRegions: null,
    plainTr:
      'AB’nin çevre, doğa ve iklim programıdır; standart projelerde maliyetin en fazla %60’ı karşılanır, kalan %40’ı kurum koyar. Türkiye LIFE programına katılmadığı için Türk belediyeleri bugün faydalanıcı olamaz.',
    officialUrl: 'https://cinea.ec.europa.eu/programmes/life_en',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/life/wp-call/2026/call-fiche_life-2026-sap-env_en.pdf',
        accessedAt: ACCESSED,
        note: 'Call document LIFE-2026-SAP-ENV V1.0 – 21.04.2026: SAP maximum 60% funding rate; indicative project budgets EUR 0,7–2 Mln (governance) and EUR 2–10 Mln (environment); consortium composition n/a.',
      },
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/life/guidance/list-3rd-country-participation_life_en.pdf',
        accessedAt: ACCESSED,
        note: 'List of participating countries (LIFE) V10.0 – 01.03.2026: only IS, MD, MK, ME, UA participate; Türkiye is not listed.',
      },
    ],
  },
  {
    key: 'cities-mission',
    name: {
      tr: 'İklim-Nötr ve Akıllı Şehirler Misyonu (Cities Mission / NetZeroCities)',
      en: 'Climate-Neutral and Smart Cities Mission (NetZeroCities)',
    },
    sourceKey: 'HORIZON-MISS',
    sediaTopicPattern: '^HORIZON-MISS-\\d{4}-\\d{2}-([A-Z]+-)?CIT-',
    eligibleOrgTypes: ['municipality', 'metropolitan'],
    difficulty: 3,
    typicalGrantEur: { minCents: cents(6_000_000), maxCents: cents(10_000_000), currency: 'EUR' },
    cofinancingPct: 0,
    needsPic: true,
    needsPartners: 'transnational',
    turkeyEligibility: 'eligible',
    turkeyRegions: null,
    plainTr:
      'Horizon Europe’un şehirlere ayrılmış misyonudur; 2026 çağrılarında en az üç farklı ülkeden üç şehir yer almak zorundadır ve bunlardan biri misyona seçilmiş 112 şehirden olmalıdır. Kâr amacı gütmeyen kamu kurumları için maliyetin %100’üne kadarı karşılanır. Büyük ve deneyim isteyen projelerdir; ilk adım olarak NetZeroCities topluluğuna katılmak önerilir.',
    officialUrl: 'https://netzerocities.eu/',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-MISS-2026-04-CIT-NEB-B4P-CCRI-03',
        accessedAt: ACCESSED,
        note: 'F&T portal topic data, HORIZON-MISS-2026-04-CIT-01/-02/-NEB-B4P-CCRI-03: EU contribution EUR 6 000 000–10 000 000 per project; at least three cities from different Member States or Associated Countries, one of them among the 112 Mission cities.',
      },
      HE_FUNDING_RATES,
      HE_COUNTRY_LIST,
    ],
  },
  {
    key: 'new-european-bauhaus',
    name: {
      tr: 'Yeni Avrupa Bauhaus’u (NEB)',
      en: 'New European Bauhaus (NEB)',
    },
    sourceKey: 'HORIZON-NEB',
    sediaTopicPattern: '^HORIZON-NEB-',
    eligibleOrgTypes: ['municipality', 'metropolitan'],
    difficulty: 3,
    typicalGrantEur: { minCents: cents(3_500_000), maxCents: cents(6_300_000), currency: 'EUR' },
    cofinancingPct: 0,
    needsPic: true,
    needsPartners: 'transnational',
    turkeyEligibility: 'eligible',
    turkeyRegions: null,
    plainTr:
      'Mahalle yenileme, kamusal alan tasarımı ve sürdürülebilir yapılaşma gibi konularda Horizon Europe çağrılarıdır. Türkiye Horizon Europe’a ortak ülke olduğu için belediyeler ortak olarak girebilir; kamu kurumları için maliyetin %100’üne kadarı karşılanır. Uluslararası bir konsorsiyum gerekir.',
    officialUrl: 'https://new-european-bauhaus.europa.eu/',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-NEB-2026-01-REGEN-01',
        accessedAt: ACCESSED,
        note: 'F&T portal topic data, HORIZON-NEB-2026-01-*: EU contribution EUR 3 500 000–6 300 000 per project (IA and RIA).',
      },
      HE_FUNDING_RATES,
      HE_COUNTRY_LIST,
    ],
  },
  {
    key: 'dut-partnership',
    name: {
      tr: 'Kentsel Dönüşümü Yönlendirme Ortaklığı (DUT)',
      en: 'Driving Urban Transitions Partnership (DUT)',
    },
    sourceKey: null,
    sediaTopicPattern: null,
    eligibleOrgTypes: ['municipality', 'metropolitan'],
    difficulty: 3,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: false,
    needsPartners: 'transnational',
    turkeyEligibility: 'check_call',
    turkeyRegions: null,
    plainTr:
      'Horizon Europe kapsamında, şehirlerin araştırmacılarla birlikte dönüşüm projesi yaptığı yıllık bir ortak çağrıdır. Her ülkenin katılımcısını kendi ulusal fon kuruluşu finanse eder; bu yüzden önce o yılın çağrısında Türkiye’den bir fon kuruluşu olup olmadığına bakılmalıdır.',
    officialUrl: 'https://dutpartnership.eu/dut-calls',
    sourceNote: [
      {
        url: 'https://dutpartnership.eu/news/dut-call-2026-now-open',
        accessedAt: ACCESSED,
        note: 'DUT Call 2026: approximately EUR 49 million, 28 countries funding; Türkiye is not named on the page, so participation must be checked per call. Not on the F&T portal.',
      },
    ],
  },
  {
    key: 'digital-europe',
    name: {
      tr: 'Dijital Avrupa Programı (DIGITAL)',
      en: 'Digital Europe Programme (DIGITAL)',
    },
    sourceKey: 'DIGITAL',
    sediaTopicPattern: '^DIGITAL-\\d{4}-',
    eligibleOrgTypes: ['municipality', 'metropolitan', 'development_agency'],
    difficulty: 3,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: true,
    needsPartners: 'transnational',
    turkeyEligibility: 'partial',
    turkeyRegions: null,
    plainTr:
      'Yapay zekâ, veri alanları, dijital beceriler ve kamu hizmetlerinin dijitalleşmesini destekler. Türkiye programın 1, 2, 4 ve 5 numaralı özel hedeflerine katılır, siber güvenlik hedefindeki çağrılara ise giremez; destek oranı ve tutar çağrıdan çağrıya değişir.',
    officialUrl: 'https://digital-strategy.ec.europa.eu/en/activities/digital-programme',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/digital/guidance/list-3rd-country-participation_digital_en.pdf',
        accessedAt: ACCESSED,
        note: 'List of participating countries (DEP) V7.0 – 01.12.2025: Turkey participates only in Specific Objectives 1, 2, 4 and 5 (agreement signed August 2023, retroactive from 01.01.2023).',
      },
    ],
  },
  {
    key: 'interreg-ipa-bulgaria-turkiye',
    name: {
      tr: 'Interreg IPA Bulgaristan–Türkiye Sınır Ötesi İşbirliği',
      en: 'Interreg IPA Bulgaria–Türkiye Cross-border Cooperation',
    },
    sourceKey: null,
    sediaTopicPattern: null,
    eligibleOrgTypes: ['municipality', 'union_of_municipalities', 'development_agency'],
    difficulty: 2,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: false,
    needsPartners: 'transnational',
    turkeyEligibility: 'partial',
    turkeyRegions: ['Edirne', 'Kırklareli'],
    plainTr:
      'Yalnızca Edirne ve Kırklareli’ndeki kurumların Bulgaristan’daki (Burgaz, Yambol, Hasköy) ortaklarla yaptığı ortak projeleri destekler. Çağrılar programın kendi sitesinden ve Dışişleri Bakanlığı AB Başkanlığı’ndan duyurulur.',
    officialUrl: 'https://www.ipacbc-bgtr.eu/',
    sourceNote: [
      {
        url: 'https://cbc.ab.gov.tr/en/interreg-ipa-bulgaria-turkiye-cross-border-cooperation-programme/',
        accessedAt: ACCESSED,
        note: 'National authority page (MFA – Directorate for EU Affairs): 2021–2027 eligible area Türkiye: Edirne, Kırklareli; Bulgaria: Bourgas, Yambol, Haskovo. No 2021–2027 co-financing rate or project size stated.',
      },
    ],
  },
  {
    key: 'interreg-next-black-sea-basin',
    name: {
      tr: 'Interreg NEXT Karadeniz Havzası',
      en: 'Interreg NEXT Black Sea Basin',
    },
    sourceKey: null,
    sediaTopicPattern: null,
    eligibleOrgTypes: ['municipality', 'metropolitan', 'union_of_municipalities', 'development_agency'],
    difficulty: 2,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: false,
    needsPartners: 'transnational',
    turkeyEligibility: 'partial',
    turkeyRegions: BLACK_SEA_BASIN_TR_PROVINCES,
    plainTr:
      'Karadeniz’e kıyısı olan ülkelerdeki kurumların çevre, araştırma ve yönetişim konularında ortak projelerini destekler; Samsun dahil 25 ilimiz uygun bölgededir. Türk kurumunun yer aldığı projelerde Türkiye’den, bir AB ülkesinden ve bir komşuluk ülkesinden en az birer ortak gerekir.',
    officialUrl: 'https://blacksea-cbc.net/',
    sourceNote: [
      {
        url: 'https://cbc.ab.gov.tr/en/interreg-next-black-sea-basin-programme/',
        accessedAt: ACCESSED,
        note: 'National authority page: eligible Turkish provinces (25, incl. Samsun); partnership requirement stated for Turkish participation. Co-financing rate and project size not verified from a primary source.',
      },
    ],
  },
  {
    key: 'ulusal-ajans-decentralised',
    name: {
      tr: 'Türkiye Ulusal Ajansı — Erasmus+ Merkezi Olmayan Hibeler',
      en: 'Turkish National Agency — Erasmus+ Decentralised Grants',
    },
    sourceKey: null,
    sediaTopicPattern: null,
    eligibleOrgTypes: ['municipality', 'metropolitan', 'union_of_municipalities'],
    difficulty: 1,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: false,
    needsPartners: 'national',
    turkeyEligibility: 'eligible',
    turkeyRegions: null,
    plainTr:
      'Belediye çalışanlarının yurt dışında eğitim alması, gençlik değişimleri ve küçük ortaklıklar gibi Erasmus+ projeleri Ankara’daki Ulusal Ajans üzerinden yürür. Başvuru Türkçe destekle yapılır, tutarlar faaliyet ve kişi sayısına göre hesaplanır. AB fonlarıyla ilk deneyim için en uygun yoldur.',
    officialUrl: 'https://www.ua.gov.tr/',
    sourceNote: [
      {
        url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/erasmus/guidance/list-3rd-country-participation_erasmus_en.pdf',
        accessedAt: ACCESSED,
        note: 'Turkey participates in Erasmus+ (V3.0 – 15.10.2025). Grant amounts are unit-cost based per activity; no single range stated.',
      },
    ],
  },
  {
    key: 'oka-financial-support',
    name: {
      tr: 'Orta Karadeniz Kalkınma Ajansı (OKA) Mali Destek Programları',
      en: 'Central Black Sea Development Agency (OKA) Financial Support Programmes',
    },
    sourceKey: null,
    sediaTopicPattern: null,
    eligibleOrgTypes: ['municipality', 'metropolitan', 'union_of_municipalities'],
    difficulty: 1,
    typicalGrantEur: null,
    cofinancingPct: null,
    needsPic: false,
    needsPartners: 'none',
    turkeyEligibility: 'eligible',
    turkeyRegions: ['Amasya', 'Çorum', 'Samsun', 'Tokat'],
    plainTr:
      'Samsun, Amasya, Çorum ve Tokat’taki belediyelerin ve mahalli idare birliklerinin başvurabildiği ulusal hibe programlarıdır. Tutarlar Türk lirası ile ve her program için ayrı belirlenir; destek oranı ve eş finansman programın başvuru rehberinde yazar. Başvurular KAYS sistemi üzerinden yapılır.',
    officialUrl: 'https://oka.gov.tr/destekler',
    sourceNote: [
      {
        url: 'https://oka.gov.tr/destekler/basvurabileceklerim',
        accessedAt: ACCESSED,
        note: 'OKA support pages: local governments (il özel idareleri, belediye başkanlıkları) and mahalli idare birlikleri listed as eligible applicants; amounts in TRY and rates vary per programme (e.g. one programme up to 90%); applications via KAYS; implementation area Amasya, Çorum, Samsun, Tokat.',
      },
    ],
  },
];

export function getPublicSectorProgramme(key: string): PublicSectorProgramme | undefined {
  return PUBLIC_SECTOR_PROGRAMMES.find((p) => p.key === key);
}

/** Can an organisation in Türkiye be funded at all (possibly with limits)? */
export function isOpenToTurkishApplicants(p: PublicSectorProgramme): boolean {
  return p.turkeyEligibility !== 'not_eligible';
}

/** Is an organisation in this Turkish province inside the programme area? */
export function coversTurkishProvince(p: PublicSectorProgramme, province: string): boolean {
  if (p.turkeyRegions === null) return true;
  const wanted = province.toLocaleLowerCase('tr-TR');
  return p.turkeyRegions.some((r) => r.toLocaleLowerCase('tr-TR') === wanted);
}

/** Does a SEDIA topic identifier belong to this programme? */
export function matchesSediaTopic(p: PublicSectorProgramme, identifier: string): boolean {
  if (!p.sediaTopicPattern) return false;
  return new RegExp(p.sediaTopicPattern).test(identifier);
}
