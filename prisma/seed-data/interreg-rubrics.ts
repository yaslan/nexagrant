/**
 * M17 assessment grids as data (FO-186, source FO-187 / TASK-MVRIVI9Y62503 §5.2).
 *
 * Copied from the programme's published grid, not invented: every criterion
 * text, mark, threshold and range below is in the FO-187 report with its page
 * reference (docs/agent-results/TASK-MVRIVI9Y62503-crw2-fb.md §1.3, §2.3, §5.2).
 * The assessors' own "Guidelines for Assessment and Selection" are not public
 * and nothing here assumes their content.
 *
 * Only the profile whose full criterion texts FO-187 extracted is listed. The
 * 2nd-call small-scale grid (12 × 4 = 48, reject < 32, §1.5) is named there
 * but its sub-questions are not; it is added as a new entry once they are.
 *
 * A published grid is not edited in place once analyses point at it: a revised
 * grid is a new `id`. prisma/seed-interreg-rubrics.ts checks the totals.
 */

export interface InterregCriterionSeed {
  criterionKey: string;
  officialRef: string;
  section: string;
  group: 'strategic' | 'operational';
  name: string;
  maxMark: number;
  knockoutBelow: number | null;
  subQuestions: string[];
  afSections: string[];
  evidenceExpectation: string;
}

export interface InterregRubricSeed {
  id: string;
  programme: string;
  label: string;
  isDefault: boolean;
  allowedMarks: number[];
  maxRaw: number;
  passRaw: number | null;
  budgetMinMinor: number | null;
  budgetMaxMinor: number | null;
  currency: string | null;
  maxDurationMonths: number | null;
  source: Record<string, string>;
  tieBreak: string[];
  programChecks: { key: string; rule: string; source: string }[];
  criteria: InterregCriterionSeed[];
}

export const INTERREG_RUBRICS: readonly InterregRubricSeed[] = [
  {
    id: 'interreg-next-bsb.call2.regular',
    programme: 'interreg-next-bsb',
    label: 'Interreg NEXT BSB — 2. çağrı Regular — iç ön değerlendirme (resmî puan değildir)',
    isDefault: true,
    allowedMarks: [1, 1.5, 2, 2.5, 3, 3.5, 4],
    maxRaw: 56,
    passRaw: 37,
    // Interreg funds per project, EUR 500,001 – 1,500,000 (Part II, 2nd call, p.20), in cent.
    budgetMinMinor: 50_000_100,
    budgetMaxMinor: 150_000_000,
    currency: 'EUR',
    maxDurationMonths: 30,
    source: {
      grid: 'Annex 7 Quality Assessment Grid – Second call – Regular projects',
      procedure: 'Part IV – Assessment, Selection and Contracting – Second call – Regular, §1.1',
      url: 'https://blacksea-cbc.net/images/APPLICATION_PACK_REGULAR_PROJECTS_REVISED.zip',
      assessorGuidelines:
        'Guidelines for Assessment and Selection (MC kararı 30/18.06.2024, 44/07.11.2024) — kamuya açık değil, içeriği doğrulanmadı',
    },
    tieBreak: ['section:relevance', 'section:coherence', 'criterion:results_durability'],
    programChecks: [
      { key: 'rco87_present', rule: 'RCO87 tanımlı ve hedef = ortak sayısı', source: 'Part I (2. çağrı) s.13; bilgi günü s.12, s.20' },
      { key: 'rco07_if_research_so1', rule: 'SO1 + araştırma kuruluşu varsa RCO07 tanımlı', source: 'Part I (2. çağrı) s.13' },
      { key: 'cma_contribution', rule: 'CMA hedeflerine katkı açıkça yazılı', source: 'Part II (2. çağrı) s.6' },
      {
        key: 'partnership_composition',
        rule: 'Regular: 4–6 kuruluş, ≥3 ülke, ≥1 AB üyesi + ≥1 ortak ülke, ülke başına ≤2',
        source: 'Part II (2. çağrı) s.14',
      },
      { key: 'budget_range', rule: 'Interreg 500.001–1.500.000 € (Regular)', source: 'Part II (2. çağrı) s.20' },
      { key: 'duration', rule: '≤30 ay (Regular)', source: 'Part II (2. çağrı) s.21' },
      { key: 'so_open_in_call', rule: 'Seçilen SO çağrıda açık (2. çağrı Regular: SO1, SO4, SO7)', source: 'Part II (2. çağrı) s.4' },
    ],
    criteria: [
      {
        criterionKey: 'relevance_so_fit',
        officialRef: '1.1',
        section: 'relevance',
        group: 'strategic',
        name: 'Relevance to the targeted programme specific objective and expected results',
        maxMark: 4,
        knockoutBelow: 3,
        subQuestions: [
          'Project overall objective clearly in line with one programme SO and field of action',
          'Main outputs and results linked to and contributing to the selected SO and its indicator(s)',
        ],
        afSections: ['A', 'C.1', 'C.4', 'C.5'],
        evidenceExpectation:
          'Seçilen SO kodu (SO1/SO4/SO7/ISO1-SO3) + faaliyet alanı adı, proje genel hedefinden alıntı, çıktı→gösterge bağlantısı',
      },
      {
        criterionKey: 'relevance_transnational_value',
        officialRef: '1.2',
        section: 'relevance',
        group: 'strategic',
        name: 'Added value of transnational cooperation clearly demonstrated',
        maxMark: 4,
        knockoutBelow: 3,
        subQuestions: [
          'Common problems and needs of the targeted regions identified and described',
          'Planned activities suitable for tackling them at transnational level',
          'Objectives and results demonstrate transnational added value',
        ],
        afSections: ['C.2.1', 'C.2.2', 'C.2.3', 'C.4', 'C.5', 'C.7.5'],
        evidenceExpectation:
          'Ortak sorun tanımı (≥2 ülke verisi), tek ülkenin tek başına çözemeyeceği gerekçesi, ortak üretilen çıktı',
      },
      {
        criterionKey: 'coherence_intervention_logic',
        officialRef: '2.1',
        section: 'coherence',
        group: 'strategic',
        name: 'Intervention logic consistent and clearly defined',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Project specific objective, activities, outputs and expected results clearly defined',
          'Planned outputs and results achievable by implementing the proposed activities',
        ],
        afSections: ['C.4', 'C.5'],
        evidenceExpectation: 'Hedef→faaliyet→çıktı→sonuç zinciri; her çıktının üreten faaliyeti',
      },
      {
        criterionKey: 'coherence_indicators',
        officialRef: '2.2',
        section: 'coherence',
        group: 'strategic',
        name: 'Indicators correctly identified and quantified',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Result and output indicators correctly identified',
          'Outputs/results contribute to indicators as defined in the Programme Performance Framework Methodology',
          'Quantification realistic',
        ],
        afSections: ['C.4', 'C.5'],
        evidenceExpectation:
          'RCO87 var mı ve hedef = ortak sayısı mı; SO1+araştırma kuruluşu → RCO07; RCR84/RCR104 doğru RCO ile eşli mi; hedef değerler gerekçeli mi (çok gösterge ≠ yüksek puan)',
      },
      {
        criterionKey: 'results_durability',
        officialRef: '3.1',
        section: 'results',
        group: 'strategic',
        name: 'Outputs will have an impact beyond project life time',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Main outputs durable',
          'Institutional and financial support to keep outputs functional after project end',
          'Outputs transferable/replicable outside the partnership',
        ],
        afSections: ['C.8'],
        evidenceExpectation: 'Proje sonrası sahiplik, finansman kaynağı, aktarım planı maddesi',
      },
      {
        criterionKey: 'results_synergies_cma',
        officialRef: '3.2',
        section: 'results',
        group: 'strategic',
        name: 'Synergies, horizontal principles and capitalization',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Contributes to Common Maritime Agenda goals and priorities',
          'Contributes to another macro-regional strategy (EUSDR, EUSAIR) and/or other Black Sea strategy (e.g. SRIA)',
          'Creates synergies or builds on BSB or other projects/programmes/initiatives',
          'Describes contribution to horizontal principles (equal opportunities and non-discrimination, gender equality, environment and sustainable development)',
        ],
        afSections: ['C.2.5', 'C.2.6', 'C.2.7', 'C.7.6'],
        evidenceExpectation: 'CMA hedefinin adıyla (Goal 1/2/3) eşleşme, önceki proje adı/kodu, yatay ilkeler paragrafı',
      },
      {
        criterionKey: 'partnership_relevance',
        officialRef: '4.1',
        section: 'partnership',
        group: 'operational',
        name: 'Relevant partners involved to address the common challenge and achieve the SO',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Partners competent in the thematic field',
          'Partners actively involved in joint implementation',
          "Partners' roles in activities and results described",
        ],
        afSections: ['C.3', 'C.4'],
        evidenceExpectation: 'Ortak tablosu: ülke, tür, tematik yetkinlik, faaliyet bazında rol',
      },
      {
        criterionKey: 'partnership_capacity',
        officialRef: '4.2',
        section: 'partnership',
        group: 'operational',
        name: 'Competence and financial capacity to manage a cooperation project',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Lead partner experienced in managing a cooperation project',
          'Lead partner capacity to manage implementation and achieve results',
          'All partners have financial capacity for cash-flow (Annex 5 self-assessment)',
        ],
        afSections: ['C.3'],
        evidenceExpectation: "Lider ortağın önceki projeleri, Annex 5 sonucu (metinde yoksa 'belge yüklenmedi' bulgusu)",
      },
      {
        criterionKey: 'workplan_coherent',
        officialRef: '5.1',
        section: 'workplan',
        group: 'operational',
        name: 'The workplan is coherent',
        maxMark: 4,
        knockoutBelow: 3,
        subQuestions: [
          'Activities clearly described (what, how, when, where, by whom)',
          'Activities appropriate to achieve outputs and results',
          'Activities address relevant target group(s)',
          'Activities outside programme area described and compliant',
          'Investments relevant to project objectives',
        ],
        afSections: ['C.4', 'C.6', 'C.2.4'],
        evidenceExpectation: 'Faaliyet listesi 5N1K; hedef grup; program alanı dışı faaliyet ve yatırım gerekçesi',
      },
      {
        criterionKey: 'workplan_realistic',
        officialRef: '5.2',
        section: 'workplan',
        group: 'operational',
        name: 'The work-plan is realistic',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: ['Sequence of activities logical', 'Time-schedule feasible within the timeframe'],
        afSections: ['C.4', 'C.6'],
        evidenceExpectation: 'Takvim/Gantt; süre ≤30 ay (Regular) / ≤18 ay (SSP)',
      },
      {
        criterionKey: 'management_risk',
        officialRef: '5.3',
        section: 'workplan',
        group: 'operational',
        name: 'Sound project management, coordination and risk mitigation',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Management, coordination and risk mitigation measures described',
          'Joint development, joint implementation and joint financing demonstrated',
        ],
        afSections: ['C.7.1', 'C.7.2', 'C.7.4', 'C.7.5'],
        evidenceExpectation: "Yönetim yapısı, risk tablosu, 'joint development / implementation / financing' kanıtı",
      },
      {
        criterionKey: 'communication',
        officialRef: '6.1',
        section: 'communication',
        group: 'operational',
        name: 'Communication activities appropriate to reach target groups and stakeholders',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Communication objectives relevant and contribute to project specific objective',
          'Activities appropriate to reach target groups and stakeholders',
        ],
        afSections: ['C.4', 'C.7.3'],
        evidenceExpectation: 'İletişim hedefi ↔ proje hedefi bağı, kanal ↔ hedef grup eşlemesi',
      },
      {
        criterionKey: 'budget_value_for_money',
        officialRef: '7.1',
        section: 'budget',
        group: 'operational',
        name: 'Budget demonstrates value for money, coherent with work plan and outputs',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: [
          'Budget justified and necessary for activities, outputs, results',
          'Distribution per period in line with work plan',
          "Each partner's budget reflects its involvement",
          'Outputs and activities clearly reflected in the budget',
        ],
        afSections: ['D', 'C.4'],
        evidenceExpectation:
          'Bütçe–faaliyet eşleşmesi, dönem dağılımı, ortak payı ↔ rol; Interreg tutarı 500.001–1.500.000 € (Regular) / 250.000–500.000 € (SSP)',
      },
      {
        criterionKey: 'budget_eligibility',
        officialRef: '7.2',
        section: 'budget',
        group: 'operational',
        name: 'Costs eligible and reasonable',
        maxMark: 4,
        knockoutBelow: null,
        subQuestions: ['Costs eligible under programme rules', 'Costs reasonable', 'No duplication of costs'],
        afSections: ['D', 'C.4'],
        evidenceExpectation: 'Uygun olmayan kalem şüphesi, mükerrer kalem, piyasa fiyatına göre makullük gerekçesi',
      },
    ],
  },
];
