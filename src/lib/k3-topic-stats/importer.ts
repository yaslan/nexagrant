/**
 * K3 — Horizon Dashboard import into `TopicStat` (TASK-MULQKV3BJT6VM).
 *
 *   readXlsx → parseHorizonDashboard → planTopicStatImport (preview) → applyTopicStatImport
 *
 * `TopicStat` has no natural unique constraint (prisma/schema.prisma — only `id`), and the schema
 * is locked this sprint, so the upsert key lives here: (topicPrefix, topicId, country, orgType).
 * `source` is deliberately NOT part of the key. G0 (`loadG0Snapshot`) reads every row for a topic
 * family with no ordering, so a second quarter's import must overwrite the first quarter's row,
 * not sit next to it and be picked at random.
 *
 * Without a unique index, two concurrent imports could both decide "insert" for the same key.
 * `applyTopicStatImport` therefore re-plans inside its transaction under a transaction-scoped
 * advisory lock, so imports serialise and the plan it writes is the one it just read.
 *
 * Unmatched codes (no `Topic` row with that identifier, and no topic in that family) are NOT
 * written, and are returned by name so the preview lists them — never dropped silently.
 */
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { rescoreOpportunityG0 } from '@/lib/scoring/g0-compute';
import { topicPrefixOf } from '@/lib/scoring/g0-features';
import { recordRawFetch } from '@/lib/k2-cordis/raw-fetch';
import { logger } from '@/lib/logger';
import { readXlsx } from './xlsx';
import { parseHorizonDashboard, type HorizonDashboardParse, type ParsedTopicStatRow } from './horizonDashboard';

export const TOPIC_STAT_SOURCE_PREFIX = 'horizon-dashboard';
export const RAW_FETCH_SOURCE = 'horizon_dashboard_xlsx';

/** Advisory-lock key; any constant works as long as every importer uses the same one. */
const IMPORT_LOCK_KEY = 0x4b3_7374; // "K3st"

/** Shape every Prisma client (singleton or transaction) shares for the calls made here. */
type Db = Pick<typeof prisma, 'topic' | 'topicStat'>;

export type PlanAction = 'insert' | 'update' | 'unchanged';

export interface PlannedRow extends ParsedTopicStatRow {
  action: PlanAction;
  topicId: string | null;
  topicPrefix: string;
  /** What the row was matched as: an exact topic identifier or a whole topic family. */
  matchedAs: 'topic' | 'family';
}

export interface UnmatchedRow {
  rowNumber: number;
  topicCode: string;
}

export interface TopicStatImportPlan {
  parse: Omit<HorizonDashboardParse, 'rows'>;
  source: string;
  planned: PlannedRow[];
  unmatched: UnmatchedRow[];
  counts: { insert: number; update: number; unchanged: number; unmatched: number; rejected: number; blank: number };
}

/** `horizon-dashboard|<file>|<YYYY-MM-DD>` — the file and the data date, the provenance CLAUDE.md §7 asks for. */
export function buildSource(fileName: string, dataDate: string): string {
  return `${TOPIC_STAT_SOURCE_PREFIX}|${fileName}|${dataDate}`;
}

/** Strips any path and control characters from the browser-supplied name, and bounds it. */
export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f|]/g, '').trim().slice(0, 120);
  return clean || 'upload.xlsx';
}

export function isValidDataDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getTime() <= Date.now() + 86_400_000;
}

export function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const keyOf = (r: { topicPrefix: string; topicId: string | null; country: string | null; orgType: string | null }) =>
  `${r.topicPrefix}|${r.topicId ?? ''}|${r.country ?? ''}|${r.orgType ?? ''}`;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Resolves each code to a topic (exact identifier) or a topic family (identifier prefix). */
async function matchTopics(db: Db, codes: string[]): Promise<Map<string, { topicId: string | null; topicPrefix: string; matchedAs: 'topic' | 'family' }>> {
  const out = new Map<string, { topicId: string | null; topicPrefix: string; matchedAs: 'topic' | 'family' }>();
  const unique = [...new Set(codes)];

  for (const batch of chunks(unique, 500)) {
    const exact: { id: string; identifier: string }[] = await db.topic.findMany({
      where: { identifier: { in: batch } },
      select: { id: true, identifier: true },
    });
    for (const t of exact) {
      out.set(t.identifier, { topicId: t.id, topicPrefix: topicPrefixOf(t.identifier), matchedAs: 'topic' });
    }
  }

  const remaining = unique.filter((c) => !out.has(c));
  for (const batch of chunks(remaining, 100)) {
    const family: { identifier: string }[] = await db.topic.findMany({
      where: { OR: batch.map((c) => ({ identifier: { startsWith: `${c}-` } })) },
      select: { identifier: true },
    });
    for (const code of batch) {
      if (family.some((t) => t.identifier.startsWith(`${code}-`) && topicPrefixOf(t.identifier) === code)) {
        out.set(code, { topicId: null, topicPrefix: code, matchedAs: 'family' });
      }
    }
  }
  return out;
}

interface ExistingStat {
  id: string;
  topicId: string | null;
  topicPrefix: string;
  country: string | null;
  orgType: string | null;
  proposals: number | null;
  funded: number | null;
  successRate: number | null;
  source: string;
}

async function planRows(db: Db, parse: HorizonDashboardParse, source: string): Promise<Omit<TopicStatImportPlan, 'parse' | 'source'>> {
  const matches = await matchTopics(db, parse.rows.map((r) => r.topicCode));
  const unmatched: UnmatchedRow[] = [];
  const matched: (ParsedTopicStatRow & { topicId: string | null; topicPrefix: string; matchedAs: 'topic' | 'family' })[] = [];
  for (const row of parse.rows) {
    const m = matches.get(row.topicCode);
    if (!m) unmatched.push({ rowNumber: row.rowNumber, topicCode: row.topicCode });
    else matched.push({ ...row, ...m });
  }

  const existing = new Map<string, ExistingStat[]>();
  for (const batch of chunks([...new Set(matched.map((r) => r.topicPrefix))], 500)) {
    const rows: ExistingStat[] = await db.topicStat.findMany({
      where: { topicPrefix: { in: batch } },
      select: { id: true, topicId: true, topicPrefix: true, country: true, orgType: true, proposals: true, funded: true, successRate: true, source: true },
    });
    for (const r of rows) {
      const k = keyOf(r);
      existing.set(k, [...(existing.get(k) ?? []), r]);
    }
  }

  const planned: PlannedRow[] = matched.map((row) => {
    const have = existing.get(keyOf(row)) ?? [];
    let action: PlanAction = 'insert';
    if (have.length > 0) {
      const same = have.every(
        (e) =>
          e.proposals === row.proposals &&
          e.funded === row.funded &&
          e.successRate !== null &&
          Math.abs(e.successRate - row.successRate) < 1e-9 &&
          e.source === source,
      );
      action = same ? 'unchanged' : 'update';
    }
    return { ...row, action };
  });

  const count = (a: PlanAction) => planned.filter((p) => p.action === a).length;
  return {
    planned,
    unmatched,
    counts: {
      insert: count('insert'),
      update: count('update'),
      unchanged: count('unchanged'),
      unmatched: unmatched.length,
      rejected: parse.rejected.length,
      blank: parse.blankRows,
    },
  };
}

/** The parse result without its row array — the plan carries the rows as `planned`. */
function parseMetaOf(parse: HorizonDashboardParse): TopicStatImportPlan['parse'] {
  const { sheetName, headerRowNumber, mapping, rejected, blankRows, rateScale } = parse;
  return { sheetName, headerRowNumber, mapping, rejected, blankRows, rateScale };
}

/** Parses the workbook and reads the database; writes nothing. */
export async function planTopicStatImport(
  bytes: Buffer,
  fileName: string,
  dataDate: string,
  db: Db = prisma,
): Promise<TopicStatImportPlan> {
  const parse = parseHorizonDashboard(await readXlsx(bytes));
  const source = buildSource(fileName, dataDate);
  const rest = await planRows(db, parse, source);
  return { parse: parseMetaOf(parse), source, ...rest };
}

export interface TopicStatApplyResult {
  plan: TopicStatImportPlan;
  written: { inserted: number; updatedRows: number };
  /** Topic families touched, for the G0 rescore that follows. */
  prefixes: string[];
  rawFetch: 'recorded' | 'unchanged' | 'failed';
}

/**
 * Writes the plan. Re-plans inside the transaction under the import lock, so what is written is
 * decided against the rows as they are at write time, not as they were at preview time.
 */
export async function applyTopicStatImport(
  bytes: Buffer,
  fileName: string,
  dataDate: string,
): Promise<TopicStatApplyResult> {
  const parse = parseHorizonDashboard(await readXlsx(bytes));
  const source = buildSource(fileName, dataDate);

  const { rest, written } = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IMPORT_LOCK_KEY})`;
      const rest = await planRows(tx, parse, source);
      const importedAt = new Date();
      const inserts = rest.planned.filter((p) => p.action === 'insert');
      const updates = rest.planned.filter((p) => p.action === 'update');

      let inserted = 0;
      if (inserts.length > 0) {
        const res = await tx.topicStat.createMany({
          data: inserts.map((p) => ({
            topicId: p.topicId,
            topicPrefix: p.topicPrefix,
            country: p.country,
            orgType: p.orgType,
            proposals: p.proposals,
            funded: p.funded,
            successRate: p.successRate,
            source,
            importedAt,
          })),
        });
        inserted = res.count;
      }

      let updatedRows = 0;
      for (const p of updates) {
        const res = await tx.topicStat.updateMany({
          where: { topicPrefix: p.topicPrefix, topicId: p.topicId, country: p.country, orgType: p.orgType },
          data: { proposals: p.proposals, funded: p.funded, successRate: p.successRate, source, importedAt },
        });
        updatedRows += res.count;
      }
      return { rest, written: { inserted, updatedRows } };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  const plan: TopicStatImportPlan = { parse: parseMetaOf(parse), source, ...rest };

  // CLAUDE.md §6: the raw upstream answer is kept. The bytes are not stored (see raw-fetch.ts),
  // the hash is, so a later question "which file produced these rows" has an answer.
  const raw = await recordRawFetch({
    source: RAW_FETCH_SOURCE,
    key: fileName,
    hash: sha256(bytes),
    payload: {
      fileName,
      dataDate,
      sizeBytes: bytes.length,
      sheet: parse.sheetName,
      headerRow: parse.headerRowNumber,
      mapping: parse.mapping,
      rateScale: parse.rateScale,
      counts: plan.counts,
      written,
      unmatchedCodes: plan.unmatched.map((u) => u.topicCode).slice(0, 200),
    },
  });

  const prefixes = [...new Set(plan.planned.map((p) => p.topicPrefix))];
  return { plan, written, prefixes, rawFetch: raw.status };
}

export interface RescoreSummary {
  opportunities: number;
  scored: number;
  unscorable: number;
  failed: number;
  /** True when more opportunities matched than one click rescored. */
  truncated: boolean;
}

export const RESCORE_MAX_OPPORTUNITIES = 500;

/**
 * Re-derives G0 for every live opportunity whose topic belongs to one of `prefixes`.
 *
 * Opportunities live in every tenant, so finding them is a cross-tenant read — `platform-admin`
 * system scope, recorded in scripts/tenant-bypass-baseline.json. Each rescore then runs in its
 * own tenant's scope through `rescoreOpportunityG0`, the same path the pipeline form uses.
 */
export async function rescoreG0ForPrefixes(prefixes: string[]): Promise<RescoreSummary> {
  const wanted = new Set(prefixes);
  const refs = new Set<string>();
  for (const batch of chunks([...wanted], 100)) {
    const topics: { id: string; identifier: string }[] = await prisma.topic.findMany({
      where: { OR: batch.flatMap((p) => [{ identifier: p }, { identifier: { startsWith: `${p}-` } }]) },
      select: { id: true, identifier: true },
    });
    for (const t of topics) {
      if (wanted.has(topicPrefixOf(t.identifier)) || wanted.has(t.identifier)) {
        // `Opportunity.topicId` holds either the Topic.id or the portal identifier (see loadG0Snapshot).
        refs.add(t.id);
        refs.add(t.identifier);
      }
    }
  }
  if (refs.size === 0) return { opportunities: 0, scored: 0, unscorable: 0, failed: 0, truncated: false };

  const opportunities: { id: string; tenantId: string }[] = await withSystemScope(
    'platform-admin',
    'k3-topic-stats.rescoreG0ForPrefixes',
    (tx) =>
      tx.opportunity.findMany({
        where: { deletedAt: null, topicId: { in: [...refs] } },
        select: { id: true, tenantId: true },
        orderBy: { createdAt: 'asc' },
        take: RESCORE_MAX_OPPORTUNITIES + 1,
      }),
  );

  const truncated = opportunities.length > RESCORE_MAX_OPPORTUNITIES;
  const batch = opportunities.slice(0, RESCORE_MAX_OPPORTUNITIES);
  let scored = 0;
  let unscorable = 0;
  let failed = 0;
  for (const opp of batch) {
    try {
      const res = await rescoreOpportunityG0(opp.tenantId, opp.id);
      if (res && res.score !== null) scored++;
      else unscorable++;
    } catch (err) {
      failed++;
      logger.error('K3 G0 rescore failed', err, { opportunityId: opp.id, tenantId: opp.tenantId });
    }
  }
  return { opportunities: batch.length, scored, unscorable, failed, truncated };
}
