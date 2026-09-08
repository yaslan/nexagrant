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

/** One partner's line in a lump-sum budget table (Part A). */
export interface BudgetLine {
  partnerName: string;
  personMonths: number;
  countryCoefficient: number;
  subcontractingCost: number;
  travelCost: number;
  requestedTotal: number;
}

/** One work package in the implementation plan (Part A). */
export interface WorkPackageItem {
  code: string;
  title: string;
  leadPartner: string;
  startMonth: number;
  endMonth: number;
  deliverables: string[];
}

/**
 * Shape of `ApplicationPart.content`, the Json column that holds the whole
 * editable document. Every field is optional: a freshly created part stores
 * `{}`, and Part A and Part B populate disjoint halves of this.
 */
export interface PartContent {
  sections?: PartBSectionItem[];
  revisions?: SectionRevisionItem[];
  comments?: SectionCommentItem[];
  presence?: CollaboratorPresence[];
  budget?: BudgetLine[];
  workPackages?: WorkPackageItem[];
}

/**
 * An ApplicationPart row as this module reads it.
 *
 * `prisma generate` does not run in this repo (see src/types/prisma-override.d.ts),
 * so query results arrive untyped and the shape has to be stated at the call
 * site — that is what `withTenant<T>` is for.
 */
export interface ApplicationPartRow {
  id: string;
  tenantId: string;
  opportunityId: string;
  part: string;
  content: PartContent | null;
  magicToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The empty Horizon Europe Part B frame a newly created application starts from.
 *
 * Structure only: the official section list, its page targets and its word ceilings. It
 * carries NO authorship and NO prose, because a template cannot know either.
 *
 * It used to ship eight sections pre-attributed to invented people at invented
 * organisations (`Dr. Mehmet Yılmaz` / `Demo SME Consultancy`, `Prof. Klaus Müller` /
 * `Fraunhofer Institute`, `Doç. Dr. Selin Kaya` / `METU TTO`, `Dr. Sofia Rossi` /
 * `Politecnico di Milano`, `Marcus Schmidt` / `Siemens AG`) together with a fully written
 * battery-thermal proposal quoting figures nobody measured (`€4.2B by 2030`,
 * `420,000 metric tons of CO2`, `18%` unit-cost reduction, `WP1 Lead: Demo SME
 * Consultancy`). Every tenant that opened Part B inherited that text, saw a progress bar
 * reporting pages they had not written, and could export it to DOCX/PDF as their own
 * submission over names that had never agreed to anything.
 *
 * A section's lead author is therefore recorded only when a real signed-in user takes it on
 * (`updateSectionContent` writes `lastModifiedBy` from the session); until then the editor
 * and the exporter both state plainly that no lead author is assigned.
 */
export const DEFAULT_PART_B_SECTIONS: PartBSectionItem[] = [
  {
    key: '1.1_objectives',
    partGroup: '1_EXCELLENCE',
    title: '1.1 Objectives and Ambition',
    targetPages: 6,
    maxWords: 3000,
    content: '',
  },
  {
    key: '1.2_methodology',
    partGroup: '1_EXCELLENCE',
    title: '1.2 Methodology (Gender, Open Science & FAIR Data)',
    targetPages: 10,
    maxWords: 5000,
    content: '',
  },
  {
    key: '1.3_open_science',
    partGroup: '1_EXCELLENCE',
    title: '1.3 Open Science & Research Data Management',
    targetPages: 2,
    maxWords: 1000,
    content: '',
  },
  {
    key: '2.1_pathways',
    partGroup: '2_IMPACT',
    title: '2.1 Project\'s Pathways towards Impact',
    targetPages: 6,
    maxWords: 3000,
    content: '',
  },
  {
    key: '2.2_measures_dec',
    partGroup: '2_IMPACT',
    title: '2.2 Measures to Maximise Impact: DEC & IP Plan',
    targetPages: 6,
    maxWords: 3000,
    content: '',
  },
  {
    key: '2.3_summary_canvas',
    partGroup: '2_IMPACT',
    title: '2.3 Summary Canvas (Impact & Scale Matrix)',
    targetPages: 2,
    maxWords: 1000,
    content: '',
  },
  {
    key: '3.1_work_plan',
    partGroup: '3_IMPLEMENTATION',
    title: '3.1 Work Plan and Resources (Work Packages & Gantt)',
    targetPages: 8,
    maxWords: 4000,
    content: '',
  },
  {
    key: '3.2_consortium_capacity',
    partGroup: '3_IMPLEMENTATION',
    title: '3.2 Capacity of Participants & Consortium as a Whole',
    targetPages: 5,
    maxWords: 2500,
    content: '',
  },
];
