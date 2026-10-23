import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createAdapterAlert, reportSchemaDrift } from '@/lib/adapters/alerts';
import {
  PARTNER_SEARCH_SOURCE,
  PartnerSearchBlockedError,
  PartnerSearchClient,
  PartnerSearchUnavailableError,
  type PartnerSearchAllowlistedRow,
  type PartnerSearchTopicResult,
} from '@/lib/adapters/partner-search';
import { isPresentId } from '@/lib/required-id';
import { isPartnerSearchIngestionEnabled } from './flag';
import { maskContact } from './mask';
import {
  matchKeyFor,
  matchPic,
  normalizePic,
  type CandidateOrganization,
} from './match-pic';

/**
 * Partner Search ingestor (FO-60 / TASK-MVCH2J271U5VY).
 *
 * Split in two, as the card asks:
 *  - pure core (`planTopicWrite`, `withdrawnIds`, `orgTypeFor`, `summarise`): no
 *    IO, unit-tested without a database;
 *  - IO shell (`runPartnerSearchIngestion`): reads Topic scope and CordisOrganization
 *    candidates, calls the adapter, writes the rows the core planned.
 *
 * Rules (from the card):
 *  - scope: Topic rows with status OPEN or FORTHCOMING only;
 *  - PERSON announcements: never written; counted into PartnerSearchTopicStat;
 *  - withdrawn: absent from the topic's scans on two different UTC days (the
 *    portal's withdraw list carries counts only, so ids cannot be matched to it);
 *  - schema drift → alert and stop, last good data kept; 403/429 → stop and alert;
 *  - one topic that fails to write does not stop the others (run is PARTIAL);
 *  - the whole run is a no-op while `partner_search_ingestion_enabled` is off.
 */

export const WITHDRAW_AFTER_MISSED_SCANS = 2;
const DESCRIPTION_MAX = 500;

/** Same UTC calendar day. Two runs on one day (nightly + K1 incremental) count one miss. */
export function sameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export type PartnerSearchOrgTypeCode = 'HES' | 'REC' | 'PRC' | 'PUB' | 'OTH';

/** The portal's organisationType strings → our enum. Unknown text becomes OTH, never an error. */
export function orgTypeFor(raw: string | null | undefined): PartnerSearchOrgTypeCode {
  const t = (raw ?? '').toLowerCase();
  if (!t) return 'OTH';
  // "Private … (excluding Higher or Secondary Education Establishments)" is a company, so private comes first.
  if (t.includes('private')) return 'PRC';
  if (t.includes('higher') || t.includes('secondary education')) return 'HES';
  if (t.includes('research')) return 'REC';
  if (t.includes('public')) return 'PUB';
  return 'OTH';
}

export interface ExistingAnnouncement {
  externalId: string;
  withdrawnAt: Date | null;
  missedScans: number;
  missedScanAt?: Date | null;
}

export interface AnnouncementWrite {
  externalId: string;
  kind: 'create' | 'update';
  missedScans: number;
  withdrawnAt: Date | null;
  missedScanAt: Date | null;
}

/**
 * Decide, for one successful topic scan, what each stored row becomes.
 * Rows in the scan are seen again (counter reset, un-withdrawn). Rows stored for
 * the topic but absent from the scan count one miss, at most one per UTC day; the
 * second miss on a later day sets `withdrawnAt`. Rows already withdrawn stay withdrawn.
 *
 * `elsewhereExternalIds`: rows the portal moved here from another topic. They exist
 * already, so they are updated; a create would hit the unique `externalId` and fail.
 */
export function planTopicWrite(input: {
  seenExternalIds: readonly string[];
  stored: readonly ExistingAnnouncement[];
  elsewhereExternalIds?: readonly string[];
  now: Date;
}): { writes: AnnouncementWrite[]; withdrawn: string[] } {
  const seen = new Set(input.seenExternalIds);
  const storedById = new Map(input.stored.map((s) => [s.externalId, s]));
  const elsewhere = new Set(input.elsewhereExternalIds ?? []);
  const writes: AnnouncementWrite[] = [];
  const withdrawn: string[] = [];

  for (const id of input.seenExternalIds) {
    const prev = storedById.get(id);
    writes.push({
      externalId: id,
      kind: prev || elsewhere.has(id) ? 'update' : 'create',
      missedScans: 0,
      withdrawnAt: null,
      missedScanAt: null,
    });
  }

  for (const s of input.stored) {
    if (seen.has(s.externalId)) continue;
    if (s.withdrawnAt) continue;
    const lastMiss = s.missedScanAt ?? null;
    const countedToday = lastMiss !== null && sameUtcDay(lastMiss, input.now);
    const missedScans = countedToday ? s.missedScans : s.missedScans + 1;
    const missedScanAt = countedToday && lastMiss ? lastMiss : input.now;
    const gone = missedScans >= WITHDRAW_AFTER_MISSED_SCANS;
    if (gone) withdrawn.push(s.externalId);
    writes.push({
      externalId: s.externalId,
      kind: 'update',
      missedScans,
      withdrawnAt: gone ? input.now : null,
      missedScanAt,
    });
  }
  return { writes, withdrawn };
}

export interface RunSummary {
  topicsScanned: number;
  created: number;
  updated: number;
  withdrawn: number;
  personAnnouncementCount: number;
}

export function emptySummary(): RunSummary {
  return { topicsScanned: 0, created: 0, updated: 0, withdrawn: 0, personAnnouncementCount: 0 };
}

export type PartnerSearchRunOutcome =
  | { kind: 'skipped'; reason: 'flag-off' }
  | { kind: 'done'; runId: string; status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; summary: RunSummary };

export interface RunOptions {
  /** Restrict to these topics (manual command or K1 event). Undefined = every OPEN/FORTHCOMING topic. */
  topicIdentifiers?: string[];
  trigger: 'FULL' | 'INCREMENTAL' | 'MANUAL';
  client?: PartnerSearchClient;
  now?: () => Date;
}

/**
 * Raw-fetch key hash: stable over the allowlisted rows, so an unchanged scan stores nothing new.
 * Sorted by id first: the portal does not guarantee row order (seen live: same rows, reordered).
 */
function rowsHash(rows: readonly PartnerSearchAllowlistedRow[]): string {
  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

/** Code points, not UTF-16 units: a slice must not split an emoji or a surrogate pair. */
function clip(text: string | null): string | null {
  return text == null ? null : Array.from(text).slice(0, DESCRIPTION_MAX).join('');
}

/** Contact details out of the free text before anything is stored (FO-65 F3). */
function maskRow(row: PartnerSearchAllowlistedRow): PartnerSearchAllowlistedRow {
  return { ...row, summary: maskContact(row.summary) };
}

/** IO shell: runs one ingestion. Always writes a PartnerSearchIngestionRun row unless the flag is off. */
export async function runPartnerSearchIngestion(options: RunOptions): Promise<PartnerSearchRunOutcome> {
  if (!(await isPartnerSearchIngestionEnabled())) {
    logger.info('[partner-search] flag OFF; ingestion skipped');
    return { kind: 'skipped', reason: 'flag-off' };
  }

  const now = options.now ?? (() => new Date());
  const client = options.client ?? new PartnerSearchClient();
  const summary = emptySummary();
  const run = await prisma.partnerSearchIngestionRun.create({
    data: { trigger: options.trigger },
    select: { id: true },
  });

  const topics = await prisma.topic.findMany({
    where: options.topicIdentifiers
      ? { identifier: { in: options.topicIdentifiers }, status: { in: ['OPEN', 'FORTHCOMING'] } }
      : { status: { in: ['OPEN', 'FORTHCOMING'] } },
    select: { identifier: true },
  });

  const errors: string[] = [];
  let blocked = false;
  let drift = false;
  let aborted = false;
  let okTopics = 0;
  const touchedPics = new Set<string>();

  try {
    const ccm2 = await client.fetchCcm2Map();
    for (const topic of topics) {
      const ccm2Id = ccm2.get(topic.identifier);
      if (!ccm2Id) {
        errors.push(`${topic.identifier}: no ccm2Id in the SEDIA listing`);
        continue;
      }
      let result: PartnerSearchTopicResult;
      try {
        result = await client.fetchTopic(topic.identifier, ccm2Id);
      } catch (error) {
        if (error instanceof PartnerSearchBlockedError) {
          blocked = true;
          break;
        }
        if (error instanceof PartnerSearchUnavailableError) {
          errors.push(`${topic.identifier}: ${error.message}`);
          if (client.circuitOpen) break;
          continue;
        }
        throw error;
      }
      if (result.status === 'drift') {
        drift = true;
        await reportSchemaDrift(PARTNER_SEARCH_SOURCE, result.schemaDrift);
        break;
      }
      let topicTouched: boolean;
      try {
        topicTouched = await writeTopic(result.topicIdentifier, result.rows.map(maskRow), now(), summary, touchedPics);
      } catch (error) {
        // One topic's write failing (a unique clash, a lost connection) must not stop the rest.
        errors.push(`${topic.identifier}: write failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      summary.personAnnouncementCount += result.personCount;
      await prisma.partnerSearchTopicStat.upsert({
        where: { topicIdentifier: topic.identifier },
        update: { personAnnouncementCount: result.personCount },
        create: { topicIdentifier: topic.identifier, personAnnouncementCount: result.personCount },
      });
      summary.topicsScanned++;
      okTopics++;
      if (!topicTouched) logger.info(`[partner-search] ${topic.identifier}: no change`);
    }
    await refreshOrganisationFlags(touchedPics);
  } catch (error) {
    if (error instanceof PartnerSearchBlockedError) {
      blocked = true;
    } else {
      aborted = true;
      errors.push(`run aborted: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (blocked) {
    await createAdapterAlert(
      PARTNER_SEARCH_SOURCE,
      'error',
      'Partner Search portal refused the request (HTTP 403/429); ingestion stopped for this run.',
      { topicsScanned: summary.topicsScanned },
      'partner_search:blocked'
    );
  }
  if (errors.length > 0) {
    logger.warn(`[partner-search] ${errors.length} topic(s) not ingested`);
  }

  const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' =
    blocked || drift || aborted || (okTopics === 0 && topics.length > 0)
      ? 'FAILED'
      : errors.length > 0
        ? 'PARTIAL'
        : 'SUCCESS';

  await prisma.partnerSearchIngestionRun.update({
    where: { id: run.id },
    data: {
      finishedAt: now(),
      status,
      topicsScanned: summary.topicsScanned,
      created: summary.created,
      updated: summary.updated,
      withdrawn: summary.withdrawn,
      personAnnouncementCount: summary.personAnnouncementCount,
      error: errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
    },
  });
  return { kind: 'done', runId: run.id, status, summary };
}

/** Write one topic's scan. Returns true when any row changed. */
async function writeTopic(
  topicIdentifier: string,
  rows: readonly PartnerSearchAllowlistedRow[],
  now: Date,
  summary: RunSummary,
  touchedPics: Set<string>
): Promise<boolean> {
  const stored = await prisma.partnerSearchAnnouncement.findMany({
    where: { topicIdentifier },
    select: { externalId: true, withdrawnAt: true, missedScans: true, missedScanAt: true, organizationPic: true },
  });
  // A row the portal moved from another topic: same externalId, so an update, not a create.
  const elsewhere = await prisma.partnerSearchAnnouncement.findMany({
    where: { externalId: { in: rows.map((r) => r.id) }, topicIdentifier: { not: topicIdentifier } },
    select: { externalId: true },
  });

  // PIC match (PS-K1 match-pic). Candidates: CORDIS organisations whose id is one of
  // the announced PICs, or whose name is one of the announced names.
  const pics = rows.map((r) => normalizePic(r.pic)).filter((p): p is string => p !== null);
  const names = Array.from(new Set(rows.map((r) => r.organisationName)));
  const candidates: CandidateOrganization[] = await prisma.cordisOrganization.findMany({
    where: { OR: [{ organisationId: { in: pics } }, { name: { in: names } }] },
    select: { organisationId: true, name: true, country: true },
  });

  const picByExternal = new Map<string, string | null>();
  for (const row of rows) {
    const match = matchPic(
      { pic: row.pic, name: row.organisationName, country: row.country },
      candidates
    );
    if (match.kind === 'unmatched') {
      const key = matchKeyFor({ pic: row.pic, name: row.organisationName, country: row.country });
      if (key) {
        await prisma.unmatchedOrganization.upsert({
          where: { matchKey: key },
          update: { lastSeenAt: now, name: row.organisationName, country: row.country },
          create: {
            matchKey: key,
            pic: normalizePic(row.pic),
            name: row.organisationName,
            country: row.country,
            lastSeenAt: now,
          },
        });
      }
      picByExternal.set(row.id, null);
    } else {
      picByExternal.set(row.id, match.pic);
      touchedPics.add(match.pic);
    }
  }

  const { writes } = planTopicWrite({
    seenExternalIds: rows.map((r) => r.id),
    stored,
    elsewhereExternalIds: elsewhere.map((e) => e.externalId),
    now,
  });

  let changed = false;
  for (const w of writes) {
    const row = rows.find((r) => r.id === w.externalId);
    if (!row) {
      // Absent from this scan: only the miss counter and withdrawal move.
      const prev = stored.find((s) => s.externalId === w.externalId);
      if (prev?.organizationPic) touchedPics.add(prev.organizationPic);
      await prisma.partnerSearchAnnouncement.update({
        where: { externalId: w.externalId },
        data: { missedScans: w.missedScans, missedScanAt: w.missedScanAt, withdrawnAt: w.withdrawnAt },
      });
      if (w.withdrawnAt) summary.withdrawn++;
      changed = true;
      continue;
    }
    const data = {
      topicIdentifier,
      type: row.expertise === 'Expertise_request' ? 'EXPERTISE_REQUEST' as const : 'EXPERTISE_OFFER' as const,
      description: clip(row.summary),
      publishedAt: row.requestDate ? new Date(row.requestDate) : null,
      lastSeenAt: now,
      withdrawnAt: null,
      missedScans: 0,
      missedScanAt: null,
      organizationPic: picByExternal.get(row.id) ?? null,
      organizationName: row.organisationName,
      organizationType: orgTypeFor(row.organisationType),
      country: row.country,
      keywords: [],
      programmeCodes: [],
      source: 'PORTAL_API' as const,
      raw: {
        id: row.id,
        organisationType: row.organisationType,
        interestStatus: row.interestStatus,
        expertise: row.expertise,
        topicIdentifier: row.topicIdentifier,
      },
    };
    if (w.kind === 'create') {
      await prisma.partnerSearchAnnouncement.create({ data: { externalId: row.id, ...data } });
      summary.created++;
    } else {
      await prisma.partnerSearchAnnouncement.update({ where: { externalId: row.id }, data });
      summary.updated++;
    }
    changed = true;
  }

  // Raw payload: only when the allowlisted rows changed (same rule as K1 RawFetch).
  const hash = rowsHash(rows);
  const last = await prisma.rawFetch.findFirst({
    where: { source: PARTNER_SEARCH_SOURCE, key: topicIdentifier },
    orderBy: { fetchedAt: 'desc' },
    select: { hash: true },
  });
  if (!last || last.hash !== hash) {
    await prisma.rawFetch.create({
      data: { source: PARTNER_SEARCH_SOURCE, key: topicIdentifier, hash, payload: rows as unknown as object },
    });
  }
  return changed;
}

/**
 * Recompute `CordisOrganization.hasActiveAnnouncements` / `lastAnnouncementAt` for
 * every PIC this run touched. Active = not withdrawn.
 */
export async function refreshOrganisationFlags(pics: ReadonlySet<string>): Promise<void> {
  for (const pic of pics) {
    // An undefined PIC would drop out of the `where` and rewrite every organisation row.
    if (!isPresentId(pic)) continue;
    const active = await prisma.partnerSearchAnnouncement.findMany({
      where: { organizationPic: pic, withdrawnAt: null },
      select: { lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 1,
    });
    await prisma.cordisOrganization.updateMany({
      where: { organisationId: pic },
      data: {
        hasActiveAnnouncements: active.length > 0,
        lastAnnouncementAt: active[0]?.lastSeenAt ?? null,
      },
    });
  }
}

