export interface PartBSectionItem {
  key: string;
  partGroup: '1_EXCELLENCE' | '2_IMPACT' | '3_IMPLEMENTATION';
  title: string;
  targetPages: number;
  maxWords: number;
  content: string;
  leadAuthor?: string;
  leadAuthorOrg?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
  lockedBy?: string | null;
  lockedByName?: string | null;
  lockedByOrg?: string | null;
  lockedAt?: string | null;
}

export interface SectionRevisionItem {
  id: string;
  sectionKey: string;
  authorName: string;
  authorOrg: string;
  timestamp: string;
  wordCount: number;
  summary: string;
  content: string;
}

export interface SectionCommentItem {
  id: string;
  sectionKey: string;
  authorName: string;
  authorOrg: string;
  timestamp: string;
  text: string;
  resolved: boolean;
}

export interface CollaboratorPresence {
  userId: string;
  name: string;
  org: string;
  color: string;
  activeSection: string;
  lastSeenAt: string;
}

export const DEFAULT_PART_B_SECTIONS: PartBSectionItem[] = [
  {
    key: '1.1_objectives',
    partGroup: '1_EXCELLENCE',
    title: '1.1 Objectives and Ambition',
    targetPages: 6,
    maxWords: 3000,
    leadAuthor: 'Dr. Mehmet Yılmaz',
    leadAuthorOrg: 'Demo SME Consultancy',
    content: `### 1.1 Objectives and Ambition

#### 1.1.1 Project Objectives (SMART)
The overarching objective of the project is to pioneer next-generation energy storage and high-efficiency thermal management architectures that exceed state-of-the-art parameters by at least 35%.

1. **Specific Objective 1 (SO1):** Synthesize high-energy-density cathode materials exhibiting cycling degradation <0.02% per cycle at 2C discharge rates.
2. **Specific Objective 2 (SO2):** Develop an AI-driven digital twin platform capable of predicting battery thermal runaway risks with >99.2% accuracy.
3. **Specific Objective 3 (SO3):** Validate the integrated multi-cell modular prototype across 3 European geographical demo sites (TR, DE, IT) under extreme operational temperature envelopes (-20°C to +50°C).

#### 1.1.2 Ambition & Beyond State-of-the-Art
Current industry solutions rely on heavy liquid-cooling loops with high parasitic energy consumption. Our approach introduces micro-channel phase-change cooling integrated directly into cell separators.`,
    lastModifiedBy: 'Dr. Mehmet Yılmaz',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '1.2_methodology',
    partGroup: '1_EXCELLENCE',
    title: '1.2 Methodology (Gender, Open Science & FAIR Data)',
    targetPages: 10,
    maxWords: 5000,
    leadAuthor: 'Prof. Klaus Müller',
    leadAuthorOrg: 'Fraunhofer Institute',
    content: `### 1.2 Methodology

#### 1.2.1 Overall Research Methodology & TRL Progression
The project progresses from Technology Readiness Level 4 (validation in laboratory environment) to TRL 7 (system prototype demonstration in operational environment). The agile development sprint cycle integrates physical testing with high-fidelity multiphysics modeling.

#### 1.2.2 Sex and Gender Dimension in Research & Innovation
Gender balance and ergonomic variability are factored directly into driver-vehicle interaction testing and HMI design matrices.

#### 1.2.3 Open Science Practices and FAIR Data Management
All datasets generated under WP2 and WP3 will be curated according to FAIR principles (Findable, Accessible, Interoperable, Reusable) and deposited in open repositories (Zenodo) under CC-BY 4.0 licensing with open-access publication in peer-reviewed journals.`,
    lastModifiedBy: 'Prof. Klaus Müller',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '1.3_open_science',
    partGroup: '1_EXCELLENCE',
    title: '1.3 Open Science & Research Data Management',
    targetPages: 2,
    maxWords: 1000,
    leadAuthor: 'Doç. Dr. Selin Kaya',
    leadAuthorOrg: 'METU TTO',
    content: `### 1.3 Open Science Practices
The consortium adopts mandatory open access for all scientific publications, early data sharing protocols, and open collaborative research data repositories with standardized metadata schemas.`,
    lastModifiedBy: 'Doç. Dr. Selin Kaya',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '2.1_pathways',
    partGroup: '2_IMPACT',
    title: '2.1 Project\'s Pathways towards Impact',
    targetPages: 6,
    maxWords: 3000,
    leadAuthor: 'Dr. Sofia Rossi',
    leadAuthorOrg: 'Politecnico di Milano',
    content: `### 2.1 Project\'s Pathways towards Impact

#### 2.1.1 Expected Scientific & Technological Outcomes
- Creation of 4 new open benchmark datasets for cell-level thermal dissipation.
- Filing of 2 priority patent applications covering modular solid-state separator cooling.

#### 2.1.2 Economic & Industrial Impacts
- Reduction of electric bus battery pack manufacturing unit costs by 18%.
- Accelerated time-to-market for European battery OEM suppliers by 14 months.`,
    lastModifiedBy: 'Dr. Sofia Rossi',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '2.2_measures_dec',
    partGroup: '2_IMPACT',
    title: '2.2 Measures to Maximise Impact: DEC & IP Plan',
    targetPages: 6,
    maxWords: 3000,
    leadAuthor: 'Marcus Schmidt',
    leadAuthorOrg: 'Siemens AG',
    content: `### 2.2 Measures to Maximise Impact: Dissemination, Exploitation & Communication (DEC)

#### 2.2.1 Target Stakeholder Matrix
- European automotive OEMs, regional public transport authorities, regulatory standards bodies (CEN/CENELEC).

#### 2.2.2 Exploitation Strategy & Consortium IP Agreement
Foreground IP generated during WP3 and WP4 will be governed by the Consortium Agreement with defined commercial exploitation licenses.`,
    lastModifiedBy: 'Marcus Schmidt',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '2.3_summary_canvas',
    partGroup: '2_IMPACT',
    title: '2.3 Summary Canvas (Impact & Scale Matrix)',
    targetPages: 2,
    maxWords: 1000,
    leadAuthor: 'Dr. Sofia Rossi',
    leadAuthorOrg: 'Politecnico di Milano',
    content: `### 2.3 Impact Summary Canvas
- **Target Market Size:** European commercial EV thermal market (€4.2B by 2030).
- **Scale:** 15,000 commercial vehicles upgraded across 6 Member States by 2032.
- **Significance:** 420,000 metric tons of CO2 equivalent emissions avoided annually.`,
    lastModifiedBy: 'Dr. Sofia Rossi',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '3.1_work_plan',
    partGroup: '3_IMPLEMENTATION',
    title: '3.1 Work Plan and Resources (Work Packages & Gantt)',
    targetPages: 8,
    maxWords: 4000,
    leadAuthor: 'Dr. Mehmet Yılmaz',
    leadAuthorOrg: 'Demo SME Consultancy',
    content: `### 3.1 Work Plan and Resources
The work plan comprises 4 interconnected Work Packages:
- **WP1: Management, Coordination & Legal Ethics** (Lead: Demo SME Consultancy, M1-M36)
- **WP2: Multiphysics Simulation & Cell Separator Design** (Lead: METU TTO, M1-M12)
- **WP3: High-Rate Pilot Prototyping & Bench Testing** (Lead: Fraunhofer Institute, M7-M24)
- **WP4: Industrial Scale Dissemination, Exploitation & Policy Feedback** (Lead: Siemens AG, M1-M36)`,
    lastModifiedBy: 'Dr. Mehmet Yılmaz',
    lastModifiedAt: new Date().toISOString(),
  },
  {
    key: '3.2_consortium_capacity',
    partGroup: '3_IMPLEMENTATION',
    title: '3.2 Capacity of Participants & Consortium as a Whole',
    targetPages: 5,
    maxWords: 2500,
    leadAuthor: 'Prof. Klaus Müller',
    leadAuthorOrg: 'Fraunhofer Institute',
    content: `### 3.2 Capacity of Participants and Consortium
The consortium brings together 4 leading European industrial and academic institutions from 3 countries (TR, DE, IT), combining world-class expertise in advanced electrochemistry, automotive engineering, and industrial scale deployment.`,
    lastModifiedBy: 'Prof. Klaus Müller',
    lastModifiedAt: new Date().toISOString(),
  },
];
