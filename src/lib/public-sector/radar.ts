import { prisma } from '@/lib/db';
import { inferEligibilityFromText } from '@/lib/adapters/schemas/common';
import { isCountryEligible } from '@/lib/scoring/g0-features';
import {
  PUBLIC_SECTOR_PROGRAMMES,
  matchesSediaTopic,
  type PublicOrgType,
  type PublicSectorProgramme,
} from './catalog';

/**
 * Municipal call radar: the SEDIA topics (already ingested by K1) that a
 * Turkish public body can look at, grouped under the catalogue programme they
 * belong to.
 *
 * Reads `Topic`/`Call` only — reference data with no `tenantId` and no RLS
 * policy, the same public read the /calls pages do. No tenant data is touched,
 * so there is no tenant scope to enter and no `withSystemScope` to justify.
 */

const COUNTRY = 'TR';

/** A call whose deadline passed within this window is still shown, marked closed. */
export const RECENTLY_CLOSED_DAYS = 120;

const MAX_CALLS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Programmes whose topics are not written for local authorities as a rule;
 * a topic from these must mention public bodies in its own text.
 */
const NEEDS_PUBLIC_BODY_TEXT = new Set(['digital-europe']);

/** Digital Europe cybersecurity (Specific Objective 3) is closed to Türkiye. */
const DIGITAL_SO3 = /CYBER|ECCC/i;

const PUBLIC_BODY_TEXT =
  /\b(local|regional)\s+(public\s+)?authorit|municipalit|public\s+(bodies|body|authorit|administration)|\bcities\b|\bcity\b/i;

/** Does the call text name public bodies / local authorities as participants? */
export function detectPublicBodySignal(text: string): boolean {
  return PUBLIC_BODY_TEXT.test(text);
}

export type CallPhase = 'open' | 'forthcoming' | 'recently_closed';

/** The Topic columns the radar reads. */
export interface RadarTopicRow {
  identifier: string;
  title: string;
  status: 'OPEN' | 'FORTHCOMING' | 'CLOSED';
  nextDeadlineAt: Date | null;
  deadlines: unknown;
  eligibility: unknown;
  description: string | null;
  sourceUrl: string | null;
}

export interface PublicSectorCall {
  identifier: string;
  title: string;
  phase: CallPhase;
  /** ISO instant (UTC) or null when the record carries none. */
  nextDeadlineAt: string | null;
  deadlineTz: string;
  sourceUrl: string;
  publicBodySignal: boolean;
  programme: {
    key: string;
    name: string;
    difficulty: PublicSectorProgramme['difficulty'];
    cofinancingPct: number | null;
    needsPic: boolean;
    needsPartners: PublicSectorProgramme['needsPartners'];
    turkeyEligibility: PublicSectorProgramme['turkeyEligibility'];
    officialUrl: string;
  };
}

export interface ListPublicSectorCallsInput {
  orgType: PublicOrgType;
  locale: string;
  now?: Date;
}

function toEligibility(value: unknown): {
  restricted?: string | null;
  countriesExcluded?: string[] | null;
} | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    restricted: typeof record.restricted === 'string' ? record.restricted : null,
    countriesExcluded: Array.isArray(record.countriesExcluded)
      ? record.countriesExcluded.filter((c): c is string => typeof c === 'string')
      : null,
  };
}

function deadlineTz(deadlines: unknown): string {
  if (Array.isArray(deadlines)) {
    for (const d of deadlines) {
      const tz = (d as { tz?: unknown } | null)?.tz;
      if (typeof tz === 'string' && tz.trim()) return tz.trim();
    }
  }
  return 'Europe/Brussels';
}

/** Is the call closed to Türkiye by its own record or by its text? */
function closedToTurkey(row: RadarTopicRow): boolean {
  if (!isCountryEligible(COUNTRY, toEligibility(row.eligibility)).eligible) return true;
  const inferred = inferEligibilityFromText(`${row.title} ${row.description ?? ''}`);
  return inferred !== null && !isCountryEligible(COUNTRY, inferred).eligible;
}

function phaseOf(row: RadarTopicRow, now: Date): CallPhase | null {
  if (row.status === 'CLOSED') return null;
  const deadline = row.nextDeadlineAt?.getTime();
  if (deadline !== undefined && deadline < now.getTime()) {
    return now.getTime() - deadline <= RECENTLY_CLOSED_DAYS * MS_PER_DAY ? 'recently_closed' : null;
  }
  return row.status === 'FORTHCOMING' ? 'forthcoming' : 'open';
}

const PHASE_ORDER: Record<CallPhase, number> = { open: 0, forthcoming: 1, recently_closed: 2 };

/**
 * Pure selection step — unit-tested without a database. Picks the rows that
 * belong to a catalogue programme open to `orgType`, drops what Türkiye cannot
 * enter and what is long closed, and orders open calls by nearest deadline,
 * then forthcoming ones, then the recently closed (most recent first).
 */
export function selectPublicSectorCalls(
  rows: RadarTopicRow[],
  { orgType, locale, now = new Date() }: ListPublicSectorCallsInput
): PublicSectorCall[] {
  const programmes = PUBLIC_SECTOR_PROGRAMMES.filter(
    (p) => p.sediaTopicPattern !== null && p.eligibleOrgTypes.includes(orgType)
  );
  const lang: 'tr' | 'en' = locale === 'tr' ? 'tr' : 'en';
  const out: PublicSectorCall[] = [];

  for (const row of rows) {
    const programme = programmes.find((p) => matchesSediaTopic(p, row.identifier));
    if (!programme) continue;
    const phase = phaseOf(row, now);
    if (!phase) continue;
    if (closedToTurkey(row)) continue;
    if (programme.key === 'digital-europe' && DIGITAL_SO3.test(row.identifier)) continue;

    const publicBodySignal = detectPublicBodySignal(`${row.title} ${row.description ?? ''}`);
    if (NEEDS_PUBLIC_BODY_TEXT.has(programme.key) && !publicBodySignal) continue;

    out.push({
      identifier: row.identifier,
      title: row.title,
      phase,
      nextDeadlineAt: row.nextDeadlineAt ? row.nextDeadlineAt.toISOString() : null,
      deadlineTz: deadlineTz(row.deadlines),
      sourceUrl:
        row.sourceUrl ??
        `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${row.identifier}`,
      publicBodySignal,
      programme: {
        key: programme.key,
        name: programme.name[lang],
        difficulty: programme.difficulty,
        cofinancingPct: programme.cofinancingPct,
        needsPic: programme.needsPic,
        needsPartners: programme.needsPartners,
        turkeyEligibility: programme.turkeyEligibility,
        officialUrl: programme.officialUrl,
      },
    });
  }

  out.sort((a, b) => {
    const byPhase = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (byPhase !== 0) return byPhase;
    const ta = a.nextDeadlineAt ? Date.parse(a.nextDeadlineAt) : Number.POSITIVE_INFINITY;
    const tb = b.nextDeadlineAt ? Date.parse(b.nextDeadlineAt) : Number.POSITIVE_INFINITY;
    return a.phase === 'recently_closed' ? tb - ta : ta - tb;
  });
  return out.slice(0, MAX_CALLS);
}

/** Identifier prefixes worth fetching: one per SEDIA-backed programme. */
function sediaPrefixes(): string[] {
  const keys = PUBLIC_SECTOR_PROGRAMMES.map((p) => p.sourceKey).filter(
    (k): k is string => k !== null
  );
  return [...new Set(keys)].map((k) => `${k}-`);
}

/**
 * Public read of the calls a Turkish public body of `orgType` can look at.
 * No try/catch: an unreachable database must fail the page, not render an
 * empty radar that reads as "no calls today".
 */
export async function listPublicSectorCalls(
  input: ListPublicSectorCallsInput
): Promise<PublicSectorCall[]> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - RECENTLY_CLOSED_DAYS * MS_PER_DAY);
  const rows = (await prisma.topic.findMany({
    where: {
      status: { in: ['OPEN', 'FORTHCOMING'] },
      OR: sediaPrefixes().map((prefix) => ({ identifier: { startsWith: prefix } })),
      AND: [{ OR: [{ nextDeadlineAt: null }, { nextDeadlineAt: { gte: since } }] }],
    },
    orderBy: { nextDeadlineAt: 'asc' },
    take: 500,
    select: {
      identifier: true,
      title: true,
      status: true,
      nextDeadlineAt: true,
      deadlines: true,
      eligibility: true,
      description: true,
      sourceUrl: true,
    },
  })) as RadarTopicRow[];
  return selectPublicSectorCalls(rows, { ...input, now });
}
