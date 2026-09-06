/**
 * K2 CORDIS CSV Schema Mapping & Data Normalization Engine
 * Handles official EU CORDIS datasets (Horizon Europe, H2020)
 */

export interface RawCsvRow {
  [key: string]: string | undefined;
}

export interface ParsedCordisProject {
  id: string;
  rcn?: string;
  acronym?: string;
  title: string;
  objective?: string;
  status?: string;
  framework: string;
  masterCall?: string;
  subCall?: string;
  fundingScheme?: string;
  legalBasis?: string;
  startDate?: Date;
  endDate?: Date;
  ecSignatureDate?: Date;
  totalCost?: bigint;
  ecMaxContribution?: bigint;
  grantDoi?: string;
  contentUpdateDate?: Date;
  rawJson?: Record<string, any>;
}

export interface ParsedCordisOrganization {
  organisationId: string;
  name: string;
  nameNormalized: string;
  shortName?: string;
  vatNumber?: string;
  activityType?: string;
  sme: boolean;
  country?: string;
  city?: string;
  postCode?: string;
  nutsCode?: string;
  geolocation?: string;
  url?: string;
  isTurkish: boolean;
  rawJson?: Record<string, any>;
}

export interface ParsedCordisParticipation {
  projectId: string;
  organisationId: string;
  role: string;
  order?: number;
  ecContribution?: bigint;
  netEcContribution?: bigint;
  totalCost?: bigint;
  endOfParticipation?: boolean;
  active?: boolean;
}

export interface ParsedCordisTopic {
  projectId: string;
  topicCode: string;
  topicTitle?: string;
}

export interface ParsedCordisSciVoc {
  projectId: string;
  scivocCode: string;
  scivocPath?: string;
  scivocTitle?: string;
}

/**
 * Normalizes organization names for resilient deduplication and matching
 */
export function normalizeOrgName(rawName: string): string {
  if (!rawName) return '';
  
  let name = rawName.toUpperCase().trim();
  
  // Replace Turkish/special accented characters to standard ASCII for uniform matching
  name = name
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');

  // Remove common corporate & legal suffixes across Europe & Turkey
  const suffixRegex = /\b(GMBH|LTD|LIMITED|SRL|A\.?S\.?|A\.?S|S\.?A\.?|LLC|INC|INCORPORATED|PLC|BV|NV|OY|AB|SP Z OO|S\.?P\.?A\.?|EPE|OOD|DOO|SL|KG|AG|KFT|ZRT|SAS|SARL|CO\.?|CORP\.?)\b/gi;
  name = name.replace(suffixRegex, '');

  // Remove non-alphanumeric characters except spaces
  name = name.replace(/[^A-Z0-9\s]/g, ' ');

  // Collapse multiple spaces
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Safely parses numeric/decimal strings (e.g., "2073781,25" or "150000.00") into BigInt EUR amounts
 */
export function parseBigIntEur(val?: string | number | null): bigint | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return BigInt(Math.round(val));

  const str = String(val).trim().replace(/\s/g, '');
  if (!str) return undefined;

  // Replace comma decimal with dot if present
  const normalized = str.replace(',', '.');
  const num = parseFloat(normalized);
  if (isNaN(num)) return undefined;

  return BigInt(Math.round(num));
}

/**
 * Parses date string safely into Date object
 */
export function parseDate(val?: string | null): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parses boolean flag from CORDIS CSV strings
 */
export function parseBoolean(val?: string | boolean | null): boolean {
  if (val === true || val === false) return val;
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

/**
 * Maps CSV row from project.csv into ParsedCordisProject
 */
export function mapProjectRow(row: RawCsvRow, defaultFramework: string): ParsedCordisProject | null {
  const id = row.id || row.projectID || row.ID;
  if (!id) return null;

  const knownFields = new Set([
    'id', 'projectID', 'ID', 'acronym', 'status', 'title', 'startDate', 'endDate',
    'totalCost', 'ecMaxContribution', 'topics', 'ecSignatureDate', 'frameworkProgramme',
    'masterCall', 'subCall', 'fundingScheme', 'nature', 'objective', 'contentUpdateDate',
    'rcn', 'grantDoi', 'keywords', 'Human-validated', 'legalBasis'
  ]);

  const rawJson: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    if (!knownFields.has(key) && row[key] !== undefined && row[key] !== '') {
      rawJson[key] = row[key];
    }
  }

  return {
    id: String(id).trim(),
    rcn: row.rcn?.trim(),
    acronym: row.acronym?.trim(),
    title: row.title?.trim() || `Project ${id}`,
    objective: row.objective?.trim(),
    status: row.status?.trim(),
    framework: row.frameworkProgramme?.trim() || defaultFramework,
    masterCall: row.masterCall?.trim(),
    subCall: row.subCall?.trim(),
    fundingScheme: row.fundingScheme?.trim(),
    legalBasis: row.legalBasis?.trim(),
    startDate: parseDate(row.startDate),
    endDate: parseDate(row.endDate),
    ecSignatureDate: parseDate(row.ecSignatureDate),
    totalCost: parseBigIntEur(row.totalCost),
    ecMaxContribution: parseBigIntEur(row.ecMaxContribution),
    grantDoi: row.grantDoi?.trim(),
    contentUpdateDate: parseDate(row.contentUpdateDate),
    rawJson: Object.keys(rawJson).length > 0 ? rawJson : undefined,
  };
}

/**
 * Maps CSV row from organization.csv into ParsedCordisOrganization and ParsedCordisParticipation
 */
export function mapOrganizationAndParticipationRow(
  row: RawCsvRow
): { organization: ParsedCordisOrganization; participation: ParsedCordisParticipation } | null {
  const organisationId = row.organisationID || row.organisationId || row.organizationID;
  const projectId = row.projectID || row.projectId;
  if (!organisationId || !projectId) return null;

  const knownFields = new Set([
    'projectID', 'projectId', 'projectAcronym', 'organisationID', 'organisationId', 'vatNumber',
    'name', 'shortName', 'SME', 'activityType', 'street', 'postCode', 'city', 'country',
    'nutsCode', 'geolocation', 'organizationURL', 'contactForm', 'contentUpdateDate', 'rcn',
    'order', 'role', 'ecContribution', 'netEcContribution', 'totalCost', 'endOfParticipation', 'active'
  ]);

  const rawJson: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    if (!knownFields.has(key) && row[key] !== undefined && row[key] !== '') {
      rawJson[key] = row[key];
    }
  }

  const country = row.country?.trim().toUpperCase();
  const name = row.name?.trim() || `Organization ${organisationId}`;

  const organization: ParsedCordisOrganization = {
    organisationId: String(organisationId).trim(),
    name,
    nameNormalized: normalizeOrgName(name),
    shortName: row.shortName?.trim(),
    vatNumber: row.vatNumber?.trim(),
    activityType: row.activityType?.trim().toUpperCase(),
    sme: parseBoolean(row.SME),
    country,
    city: row.city?.trim(),
    postCode: row.postCode?.trim(),
    nutsCode: row.nutsCode?.trim(),
    geolocation: row.geolocation?.trim(),
    url: row.organizationURL?.trim(),
    isTurkish: country === 'TR',
    rawJson: Object.keys(rawJson).length > 0 ? rawJson : undefined,
  };

  const participation: ParsedCordisParticipation = {
    projectId: String(projectId).trim(),
    organisationId: String(organisationId).trim(),
    role: row.role?.trim().toLowerCase() || 'participant',
    order: row.order ? parseInt(row.order, 10) : undefined,
    ecContribution: parseBigIntEur(row.ecContribution),
    netEcContribution: parseBigIntEur(row.netEcContribution),
    totalCost: parseBigIntEur(row.totalCost),
    endOfParticipation: parseBoolean(row.endOfParticipation),
    active: row.active !== undefined ? parseBoolean(row.active) : true,
  };

  return { organization, participation };
}

/**
 * Maps CSV row from topics.csv
 */
export function mapTopicRow(row: RawCsvRow): ParsedCordisTopic | null {
  const projectId = row.projectID || row.projectId;
  const topicCode = row.topic || row.topicCode;
  if (!projectId || !topicCode) return null;

  return {
    projectId: String(projectId).trim(),
    topicCode: String(topicCode).trim(),
    topicTitle: row.title?.trim(),
  };
}

/**
 * Maps CSV row from euroSciVoc.csv
 */
export function mapSciVocRow(row: RawCsvRow): ParsedCordisSciVoc | null {
  const projectId = row.projectID || row.projectId;
  const scivocCode = row.euroSciVocCode || row.scivocCode;
  if (!projectId || !scivocCode) return null;

  return {
    projectId: String(projectId).trim(),
    scivocCode: String(scivocCode).trim(),
    scivocPath: row.euroSciVocPath?.trim(),
    scivocTitle: row.euroSciVocTitle?.trim(),
  };
}
