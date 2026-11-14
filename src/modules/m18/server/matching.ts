import { mapOrgType, normalisePlateCode } from './taxonomy';

/**
 * NG-137 (M18-F2). Client organisation × shared `Call`: hard rules decide whether the client
 * can apply at all, soft rules give a 0–100 fit. The result is what a `LeadMatch` row stores
 * (`hardFail`, `fitScore`, `reasons`).
 *
 * Not HibeLead's formula: its source is gone and its database held no match rows, so these
 * rules are written fresh (decision K-581471). Every point is in `SOFT_POINTS` below.
 * This is the consultancy matching ITS CLIENT; the tenant-matches-itself formulas
 * (`TopicMatch`, `g0Score`) are a different question and are not touched.
 */

export interface MatchOrganization {
  /** HibeLead org-type code as stored on `LeadOrganization.orgType`. */
  orgType: string | null;
  /** Licence-plate code, `LeadOrganization.provinceCode`. */
  provinceCode: string | null;
  nuts2: string | null;
  sectorCodes: readonly string[];
  themes: readonly string[];
  sizeBand: string | null;
  lifecycle: string;
  deletedAt?: Date | null;
}

/**
 * A call as the matcher needs it. `deadlineAt` and `keywords` live on the call's topics;
 * the caller passes the earliest open deadline and the union of topic keywords.
 */
export interface MatchCall {
  eligibleApplicantTypes: readonly string[];
  eligibleRegions: readonly string[];
  complexity: string | null;
  keywords: readonly string[];
  deadlineAt: Date | null;
}

export type HardFailCode = 'ORG_DISQUALIFIED' | 'CALL_CLOSED' | 'APPLICANT_TYPE' | 'REGION';

export type SoftReasonCode =
  | 'APPLICANT_TYPE_MATCH'
  | 'APPLICANT_TYPE_UNRESTRICTED'
  | 'APPLICANT_TYPE_UNKNOWN'
  | 'REGION_MATCH'
  | 'REGION_UNRESTRICTED'
  | 'REGION_UNKNOWN'
  | 'TOPIC_OVERLAP'
  | 'TOPIC_UNKNOWN'
  | 'CAPACITY'
  | 'CAPACITY_UNKNOWN';

export interface MatchReason {
  code: SoftReasonCode;
  points: number;
  max: number;
}

export interface MatchResult {
  hardFail: boolean;
  hardFailReasons: HardFailCode[];
  /** 0–100; 0 whenever `hardFail` is true. */
  fitScore: number;
  reasons: MatchReason[];
}

/** The soft rule table. The four maxima add up to 100. */
export const SOFT_POINTS = {
  applicantType: { max: 30, unrestricted: 15 },
  region: { max: 20, unrestricted: 10 },
  topic: { max: 30, keywordsForFull: 3 },
  capacity: { max: 20, unknown: 10 },
} as const;

/**
 * Capacity: can an organisation of this size carry a call of this complexity?
 * Rows are `Call.complexity`, columns HibeLead `size_band`.
 */
export const CAPACITY_POINTS: Record<string, Record<string, number>> = {
  LOW: { micro: 20, small: 20, medium: 20, large: 20, public: 20 },
  MEDIUM: { micro: 10, small: 20, medium: 20, large: 20, public: 20 },
  HIGH: { micro: 5, small: 10, medium: 15, large: 20, public: 20 },
};

const fold = (s: string) => s.trim().toLocaleLowerCase('tr-TR');

const reason = (code: SoftReasonCode, points: number, max: number): MatchReason => ({ code, points, max });

/** An eligibility rule either scores or hard-fails. */
type RuleOutcome = { reason: MatchReason } | { fail: HardFailCode };

function applicantTypeRule(org: MatchOrganization, call: MatchCall): RuleOutcome {
  const max = SOFT_POINTS.applicantType.max;
  if (call.eligibleApplicantTypes.length === 0) {
    return { reason: reason('APPLICANT_TYPE_UNRESTRICTED', SOFT_POINTS.applicantType.unrestricted, max) };
  }
  const mapped = mapOrgType(org.orgType);
  if (!mapped) return { reason: reason('APPLICANT_TYPE_UNKNOWN', 0, max) };
  const allowed = new Set(call.eligibleApplicantTypes.map(fold));
  // A call may name the broad `OrgType` ("SME") or the finer HibeLead code ("cooperative").
  if (allowed.has(fold(mapped.orgType)) || allowed.has(mapped.subType)) {
    return { reason: reason('APPLICANT_TYPE_MATCH', max, max) };
  }
  return { fail: 'APPLICANT_TYPE' };
}

/** A region entry is a plate code ("06") or a NUTS prefix ("TR", "TR5", "TR51"). */
function regionCovers(entry: string, plate: string | null, nuts2: string | null): boolean {
  const entryPlate = normalisePlateCode(entry);
  if (entryPlate !== null) return plate !== null && entryPlate === plate;
  return nuts2 !== null && nuts2.trim().toUpperCase().startsWith(entry.trim().toUpperCase());
}

function regionRule(org: MatchOrganization, call: MatchCall): RuleOutcome {
  const max = SOFT_POINTS.region.max;
  if (call.eligibleRegions.length === 0) {
    return { reason: reason('REGION_UNRESTRICTED', SOFT_POINTS.region.unrestricted, max) };
  }
  const plate = normalisePlateCode(org.provinceCode);
  const nuts2 = org.nuts2?.trim() ? org.nuts2 : null;
  if (plate === null && nuts2 === null) {
    return { reason: reason('REGION_UNKNOWN', 0, max) };
  }
  if (call.eligibleRegions.some((entry) => regionCovers(entry, plate, nuts2))) {
    return { reason: reason('REGION_MATCH', max, max) };
  }
  return { fail: 'REGION' };
}

function topicRule(org: MatchOrganization, call: MatchCall): MatchReason {
  const max = SOFT_POINTS.topic.max;
  const orgTerms = new Set([...org.sectorCodes, ...org.themes].map(fold).filter(Boolean));
  const keywords = new Set(call.keywords.map(fold).filter(Boolean));
  if (orgTerms.size === 0 || keywords.size === 0) return reason('TOPIC_UNKNOWN', 0, max);
  let shared = 0;
  for (const k of keywords) if (orgTerms.has(k)) shared += 1;
  const needed = Math.min(keywords.size, SOFT_POINTS.topic.keywordsForFull);
  return { code: 'TOPIC_OVERLAP', points: Math.round((max * Math.min(shared, needed)) / needed), max };
}

function capacityRule(org: MatchOrganization, call: MatchCall): MatchReason {
  const max = SOFT_POINTS.capacity.max;
  const row = call.complexity ? CAPACITY_POINTS[call.complexity.trim().toUpperCase()] : undefined;
  const points = row && org.sizeBand ? row[fold(org.sizeBand)] : undefined;
  if (points === undefined) return reason('CAPACITY_UNKNOWN', SOFT_POINTS.capacity.unknown, max);
  return reason('CAPACITY', points, max);
}

export function matchOrganizationToCall(org: MatchOrganization, call: MatchCall, now: Date): MatchResult {
  const hardFailReasons: HardFailCode[] = [];
  if (org.deletedAt || fold(org.lifecycle) === 'disqualified') hardFailReasons.push('ORG_DISQUALIFIED');
  if (call.deadlineAt && call.deadlineAt.getTime() < now.getTime()) hardFailReasons.push('CALL_CLOSED');

  const applicant = applicantTypeRule(org, call);
  const region = regionRule(org, call);
  const reasons: MatchReason[] = [];
  for (const outcome of [applicant, region]) {
    if ('fail' in outcome) hardFailReasons.push(outcome.fail);
    else reasons.push(outcome.reason);
  }
  reasons.push(topicRule(org, call), capacityRule(org, call));

  const hardFail = hardFailReasons.length > 0;
  const fitScore = hardFail ? 0 : reasons.reduce((sum, r) => sum + r.points, 0);
  return { hardFail, hardFailReasons, fitScore, reasons };
}
