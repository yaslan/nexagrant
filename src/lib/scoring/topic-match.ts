import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { isCountryEligible, type G0TopicSnapshot } from '@/lib/scoring/g0-features';
import { assertTenantWritable, getPilotState } from '@/lib/billing/pilot';
import { isPresentId } from '@/lib/required-id';

/**
 * K1 topic match — the nightly `fitScore` of every tenant × open topic pair
 * (docs/ARCHITECTURE.md §4 "Uyum skoru", TASK-MULQL2NYKRGJX).
 *
 * The score is the cosine similarity of `TenantProfile.embedding` and
 * `Topic.embedding`, 0..100, with one rule correction: a topic the tenant's
 * country may not apply to (`isCountryEligible`, the same rule the G0 gate
 * reads) scores 0 and says why in `breakdown`. It is written onto the K1 row of
 * `TopicMatch` — the one with `opportunityId` NULL (docs/DATA_MODEL.md §14) —
 * which `loadG0Snapshot` then reads as the measured alignment feature.
 *
 * What is deliberately not here:
 *   - No embedding is generated here. The `k1-embeddings` job fills both
 *     columns (src/lib/scoring/embeddings.ts, TASK-MUN7C48UHPOGI) at 02:15,
 *     before this run. A pair with either vector missing gets no row, and the
 *     run counts it: a keyword
 *     overlap passed off as a K1 match would turn G0's documented fallback
 *     (`TenantProfile.keywords ∩ Topic.keywords`) into "measured".
 *   - No KOBİ-role correction. Nothing in the schema says which role a topic
 *     wants, so any number here would be invented.
 *   - No module gate. K1 is core, on every plan (docs/MODULES.md lists M1..M11
 *     only); the tenant gates are "not deleted" and "pilot not expired".
 *
 * Memory: the cosine is computed in Postgres, a page of `pageSize` topics at a
 * time, and only (topic id, eligibility, similarity) comes back — never a
 * vector. Each page is its own short tenant transaction.
 */

export const TOPIC_MATCH_VERSION = 'k1-cosine-1';

/** `TopicMatch.breakdown.source` of a row this job wrote. */
export const TOPIC_MATCH_SOURCE = 'k1-topic-match';

/** AuditEvent type of one tenant's run. Counts only. */
export const TOPIC_MATCH_AUDIT = 'topic_match.recomputed';

export const TOPIC_MATCH_PAGE_SIZE = 500;

export interface TopicMatchCandidate {
  topicId: string;
  eligibility: unknown;
  /** Cosine similarity -1..1, or null when Postgres could not compute one (a zero vector). */
  similarity: number | null;
}

export interface TopicMatchScore {
  fitScore: number;
  breakdown: {
    source: typeof TOPIC_MATCH_SOURCE;
    version: typeof TOPIC_MATCH_VERSION;
    cosine: number;
    eligible: boolean;
    note: string;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toEligibility(value: unknown): G0TopicSnapshot['eligibility'] {
  return value && typeof value === 'object' ? (value as G0TopicSnapshot['eligibility']) : null;
}

/**
 * Pure: one pair's score. Negative similarity is "no fit", not a negative
 * score; an ineligible country is 0 whatever the text says. Null when there is
 * no similarity to score (NaN from a zero vector) — such a pair gets no row.
 */
export function scoreTopicMatch(country: string | null, candidate: TopicMatchCandidate): TopicMatchScore | null {
  const sim = candidate.similarity;
  if (sim === null || !Number.isFinite(sim)) return null;
  const clamped = Math.min(1, Math.max(-1, sim));
  const cosine = Math.round(clamped * 10_000) / 10_000;
  const { eligible, note } = isCountryEligible(country, toEligibility(candidate.eligibility));
  const fitScore = eligible ? round2(Math.max(0, clamped) * 100) : 0;
  return {
    fitScore,
    breakdown: { source: TOPIC_MATCH_SOURCE, version: TOPIC_MATCH_VERSION, cosine, eligible, note },
  };
}

/**
 * One page of open/forthcoming topics that have an embedding, with their
 * similarity to this tenant's profile, after `cursor` in id order. Empty when
 * the tenant has no profile embedding. `Topic` is the shared catalogue (no
 * `tenantId`, no RLS); the profile row is read under the tenant's scope.
 */
export async function candidatePage(
  tx: TenantTx,
  tenantId: string,
  cursor: string,
  pageSize: number,
  /** Only these topics (a live test's own fixtures); undefined = every topic. */
  topicIds?: readonly string[]
): Promise<TopicMatchCandidate[]> {
  const only = topicIds ? [...topicIds] : null;
  const rows = await tx.$queryRaw<Array<{ topicId: string; eligibility: unknown; similarity: number | null }>>`
    SELECT t.id AS "topicId", t.eligibility,
           (1 - (t.embedding <=> p.embedding))::float8 AS similarity
      FROM "Topic" t
      JOIN "TenantProfile" p ON p."tenantId" = ${tenantId}
     WHERE p.embedding IS NOT NULL
       AND t.embedding IS NOT NULL
       AND t.status <> 'CLOSED'
       AND t.id > ${cursor}
       AND (${only}::text[] IS NULL OR t.id = ANY(${only}::text[]))
     ORDER BY t.id
     LIMIT ${pageSize}`;
  return rows.map((r) => ({ topicId: r.topicId, eligibility: r.eligibility, similarity: r.similarity === null ? null : Number(r.similarity) }));
}

export interface TenantTopicMatchResult {
  tenantId: string;
  status: 'done' | 'no_profile_embedding' | 'pilot_expired';
  scored: number;
  created: number;
  updated: number;
  unchanged: number;
  ineligible: number;
  unscorable: number;
  pages: number;
}

function sameBreakdown(a: unknown, b: TopicMatchScore['breakdown']): boolean {
  if (!a || typeof a !== 'object') return false;
  const r = a as Record<string, unknown>;
  return (
    r.source === b.source && r.version === b.version && r.cosine === b.cosine && r.eligible === b.eligible && r.note === b.note
  );
}

/**
 * Writes one page's scores onto the K1 rows. Idempotent: an unchanged score is
 * not rewritten (so `computedAt` keeps meaning "when this number last
 * changed"), a changed one is updated, a new pair is inserted with ON CONFLICT
 * DO NOTHING — the K1 key is `NULLS NOT DISTINCT`, so two overlapping runs
 * cannot make a second row. Prisma cannot put null in a compound-unique
 * `where`, hence findMany + update by id rather than upsert (DATA_MODEL §14).
 */
async function writePage(
  tx: TenantTx,
  tenantId: string,
  scored: Array<{ topicId: string; score: TopicMatchScore }>,
  now: Date
): Promise<{ created: number; updated: number; unchanged: number }> {
  if (scored.length === 0) return { created: 0, updated: 0, unchanged: 0 };
  const existing = await tx.topicMatch.findMany({
    where: { tenantId, opportunityId: null, topicId: { in: scored.map((s) => s.topicId) } },
    select: { id: true, topicId: true, fitScore: true, breakdown: true },
  });
  const byTopic = new Map(existing.map((e) => [e.topicId, e]));

  let updated = 0;
  let unchanged = 0;
  const fresh: Array<{ tenantId: string; topicId: string; fitScore: number; breakdown: TopicMatchScore['breakdown']; computedAt: Date }> = [];
  for (const { topicId, score } of scored) {
    const row = byTopic.get(topicId);
    if (!row) {
      fresh.push({ tenantId, topicId, fitScore: score.fitScore, breakdown: score.breakdown, computedAt: now });
      continue;
    }
    if (row.fitScore === score.fitScore && sameBreakdown(row.breakdown, score.breakdown)) {
      unchanged++;
      continue;
    }
    await tx.topicMatch.update({
      where: { id: row.id },
      data: { fitScore: score.fitScore, breakdown: score.breakdown, computedAt: now },
    });
    updated++;
  }
  const { count } = fresh.length
    ? await tx.topicMatch.createMany({ data: fresh, skipDuplicates: true })
    : { count: 0 };
  return { created: count, updated, unchanged };
}

/**
 * Recomputes one tenant's K1 matches, page by page. A tenant whose pilot has
 * run out is read-only (src/lib/billing/pilot.ts) and is not written; the
 * check repeats inside every page's transaction, so a pilot that ends mid-run
 * stops the writes at the next page.
 */
export async function recomputeTenantTopicMatches(
  tenantId: string,
  options: { now?: Date; pageSize?: number; runTenant?: typeof withTenant; topicIds?: readonly string[] } = {}
): Promise<TenantTopicMatchResult> {
  if (!isPresentId(tenantId)) throw new Error('topic-match: tenantId is missing');
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? TOPIC_MATCH_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError(`topic-match: pageSize must be >= 1, got ${pageSize}`);
  const runTenant = options.runTenant ?? withTenant;

  const result: TenantTopicMatchResult = {
    tenantId, status: 'done', scored: 0, created: 0, updated: 0, unchanged: 0, ineligible: 0, unscorable: 0, pages: 0,
  };

  const head = await runTenant(tenantId, async (tx) => {
    const pilot = await getPilotState(tenantId, tx, now);
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { country: true } });
    const profile = await tx.$queryRaw<Array<{ has: boolean }>>`
      SELECT (embedding IS NOT NULL) AS has FROM "TenantProfile" WHERE "tenantId" = ${tenantId}`;
    return { pilotExpired: pilot.kind === 'expired', country: tenant?.country ?? null, hasProfile: profile[0]?.has === true };
  });
  if (head.pilotExpired) return { ...result, status: 'pilot_expired' };
  if (!head.hasProfile) return { ...result, status: 'no_profile_embedding' };

  let cursor = '';
  for (;;) {
    const page = await runTenant(tenantId, async (tx) => {
      await assertTenantWritable(tenantId, tx, now);
      const candidates = await candidatePage(tx, tenantId, cursor, pageSize, options.topicIds);
      const scored: Array<{ topicId: string; score: TopicMatchScore }> = [];
      let unscorable = 0;
      let ineligible = 0;
      for (const c of candidates) {
        const score = scoreTopicMatch(head.country, c);
        if (!score) {
          unscorable++;
          continue;
        }
        if (!score.breakdown.eligible) ineligible++;
        scored.push({ topicId: c.topicId, score });
      }
      const written = await writePage(tx, tenantId, scored, now);
      return { size: candidates.length, last: candidates.at(-1)?.topicId, scored: scored.length, unscorable, ineligible, ...written };
    });
    if (page.size === 0) break;
    result.pages++;
    result.scored += page.scored;
    result.unscorable += page.unscorable;
    result.ineligible += page.ineligible;
    result.created += page.created;
    result.updated += page.updated;
    result.unchanged += page.unchanged;
    if (page.size < pageSize || !page.last) break;
    cursor = page.last;
  }

  if (result.created + result.updated > 0) {
    await runTenant(tenantId, (tx) =>
      tx.auditEvent.create({
        data: {
          tenantId,
          type: TOPIC_MATCH_AUDIT,
          data: {
            scored: result.scored,
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            ineligible: result.ineligible,
            version: TOPIC_MATCH_VERSION,
          },
        },
      })
    );
  }
  return result;
}

export interface TopicMatchRunResult {
  tenants: number;
  done: number;
  noProfileEmbedding: number;
  pilotExpired: number;
  failed: number;
  scored: number;
  created: number;
  updated: number;
  unchanged: number;
  ineligible: number;
  /** Open/forthcoming topics with no embedding: they cannot be matched for anyone. */
  topicsWithoutEmbedding: number;
  errors: Array<{ tenantId: string; reason: string }>;
  durationMs: number;
}

/**
 * Every live tenant, one after another. The tenant list is read in pages of
 * `pageSize` ids — `Tenant` is the table the scope is derived from, read
 * unscoped as in credits-monthly-grant. One tenant's failure is recorded and
 * the run moves on.
 */
export async function recomputeAllTopicMatches(
  options: {
    now?: Date;
    pageSize?: number;
    runTenant?: typeof withTenant;
    tenantIds?: readonly string[];
    /** Narrows the topics each tenant is scored against (a live test's own fixtures). */
    topicIds?: readonly string[];
  } = {}
): Promise<TopicMatchRunResult> {
  const started = Date.now();
  const pageSize = options.pageSize ?? TOPIC_MATCH_PAGE_SIZE;
  const out: TopicMatchRunResult = {
    tenants: 0, done: 0, noProfileEmbedding: 0, pilotExpired: 0, failed: 0,
    scored: 0, created: 0, updated: 0, unchanged: 0, ineligible: 0, topicsWithoutEmbedding: 0, errors: [], durationMs: 0,
  };

  const missing = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "Topic" WHERE embedding IS NULL AND status <> 'CLOSED'`;
  out.topicsWithoutEmbedding = Number(missing[0]?.n ?? 0);

  let cursor = '';
  for (;;) {
    // `tenantIds` narrows the run (the live test's own fixtures); an empty
    // list narrows it to nothing, never to "every tenant".
    const tenants = await prisma.tenant.findMany({
      where: {
        deletedAt: null,
        id: options.tenantIds ? { in: [...options.tenantIds], gt: cursor } : { gt: cursor },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: pageSize,
    });
    for (const { id: tenantId } of tenants) {
      out.tenants++;
      try {
        const r = await recomputeTenantTopicMatches(tenantId, options);
        if (r.status === 'pilot_expired') out.pilotExpired++;
        else if (r.status === 'no_profile_embedding') out.noProfileEmbedding++;
        else out.done++;
        out.scored += r.scored;
        out.created += r.created;
        out.updated += r.updated;
        out.unchanged += r.unchanged;
        out.ineligible += r.ineligible;
      } catch (error) {
        out.failed++;
        out.errors.push({ tenantId, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    if (tenants.length < pageSize) break;
    cursor = tenants[tenants.length - 1]!.id;
  }
  out.durationMs = Date.now() - started;
  return out;
}
