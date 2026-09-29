import crypto from 'crypto';
import { prisma, withTenant } from '@/lib/db';
import { AiUsageLogWriteError, embedText } from '@/lib/llm';
import { env } from '@/lib/env';
import { assertTenantWritable, getPilotState } from '@/lib/billing/pilot';
import { isPresentId } from '@/lib/required-id';

/**
 * K1 embeddings — fills `Topic.embedding` and `TenantProfile.embedding`, the two
 * vectors `k1-topic-match` compares (TASK-MUN7C48UHPOGI). Until this file
 * neither column was written anywhere, so the nightly match wrote 0 rows.
 *
 * Every provider call goes through `embedText` (src/lib/llm.ts), the one path
 * that writes `AiUsageLog`: a topic is booked to the platform scope (the shared
 * catalogue), a profile to its own tenant (it is that tenant's data).
 *
 * Idempotent by content hash: the text a vector is made from is hashed (with
 * the model and dimensions) into `embeddingHash`. A row is embedded only when
 * it has no vector, or its hash no longer matches its text. A second run over
 * unchanged rows makes no provider call.
 *
 * Spend is capped per run: before each call the run adds a conservative
 * estimate of that call's cost and stops once the next call would cross
 * `K1_EMBEDDING_MAX_USD_PER_RUN`. Rows left over are picked up by the next run.
 *
 * Writes are optimistic: the vector is stored only if the row's `updatedAt` is
 * still the one that was read. A row whose text changed while its vector was
 * being made is left for the next run rather than paired with a stale vector.
 */

/** Must match `embedText`'s default model and the `vector(1536)` columns. */
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * USD per 1M input tokens for {@link EMBEDDING_MODEL} — OpenAI's published
 * standard price, read from https://developers.openai.com/api/docs/pricing on
 * 2026-09-30. Used only for the per-run cap, never shown to a tenant.
 */
export const EMBEDDING_USD_PER_MTOK = 0.13;

/**
 * text-embedding-3-large takes at most 8191 tokens. Even at a pessimistic two
 * characters per token 16 000 characters stay under it; the longest topic
 * description in the catalogue today is ~36 000 characters and would otherwise
 * be a 400 on every run.
 */
export const MAX_EMBED_CHARS = 16_000;

/** Cost-cap estimate: 3 characters per token over-counts English and Turkish prose. */
const CHARS_PER_TOKEN_ESTIMATE = 3;

/** After this many provider failures in a row the run stops: a bad key or an outage. */
const MAX_CONSECUTIVE_FAILURES = 3;

export const EMBEDDING_PAGE_SIZE = 200;

export const TOPIC_EMBEDDING_PURPOSE = 'k1_topic_embedding';
export const PROFILE_EMBEDDING_PURPOSE = 'k1_profile_embedding';

function clean(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_EMBED_CHARS);
}

function list(values: unknown): string {
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string').join(', ') : '';
}

/** The text a topic's vector is made from. Empty when the topic says nothing. */
export function topicEmbeddingText(t: { title: string; keywords: unknown; description: string | null }): string {
  return clean([t.title, list(t.keywords), t.description]);
}

/** The text a tenant profile's vector is made from. */
export function profileEmbeddingText(p: { capabilities: string; keywords: unknown }): string {
  return clean([p.capabilities, list(p.keywords)]);
}

/** Hash of what the vector depends on: the text, the model and the dimensions. */
export function embeddingHash(text: string): string {
  return crypto.createHash('sha256').update(`${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}\n${text}`).digest('hex');
}

/** Upper-bound USD estimate of one embedding call. */
export function estimateEmbeddingUsd(text: string): number {
  return (Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE) / 1_000_000) * EMBEDDING_USD_PER_MTOK;
}

/** The per-run cap, from the environment. Defaults low on purpose. */
export function maxUsdPerRun(): number {
  return Number(env.K1_EMBEDDING_MAX_USD_PER_RUN);
}

/** Why a row does (or does not) need a new vector. */
export function needsEmbedding(row: { hasEmbedding: boolean; embeddingHash: string | null }, hash: string): boolean {
  return !row.hasEmbedding || row.embeddingHash !== hash;
}

function toVector(v: number[]): string {
  if (v.length !== EMBEDDING_DIMENSIONS || !v.every(Number.isFinite)) {
    throw new Error(`embedding has ${v.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
  }
  return `[${v.join(',')}]`;
}

export interface EmbeddingRunResult {
  topicsScanned: number;
  topicsEmbedded: number;
  topicsUpToDate: number;
  topicsEmpty: number;
  profilesScanned: number;
  profilesEmbedded: number;
  profilesUpToDate: number;
  profilesEmpty: number;
  profilesPilotExpired: number;
  /** Rows whose text changed while their vector was being made; left for the next run. */
  raced: number;
  failed: number;
  /** Conservative USD estimate of what the run sent to the provider. */
  estimatedUsd: number;
  maxUsd: number;
  /** True when the cap stopped the run with rows still due. */
  budgetExhausted: boolean;
  /** True when {@link MAX_CONSECUTIVE_FAILURES} failures in a row stopped the run. */
  aborted: boolean;
  /** Set when nothing was attempted: `no_api_key`. */
  skipped?: 'no_api_key';
  errors: string[];
  durationMs: number;
}

export interface EmbeddingRunOptions {
  /** Only this tenant's profile (a profile save); topics are not touched. */
  tenantId?: string;
  /**
   * Narrow the sweep to these topics / tenants (the live test's own fixtures).
   * An empty list narrows it to nothing, never to "all".
   */
  topicIds?: readonly string[];
  tenantIds?: readonly string[];
  maxUsd?: number;
  pageSize?: number;
  now?: Date;
  embed?: typeof embedText;
}

class Run {
  readonly out: EmbeddingRunResult;
  private streak = 0;
  constructor(
    maxUsd: number,
    private readonly embed: typeof embedText
  ) {
    this.out = {
      topicsScanned: 0, topicsEmbedded: 0, topicsUpToDate: 0, topicsEmpty: 0,
      profilesScanned: 0, profilesEmbedded: 0, profilesUpToDate: 0, profilesEmpty: 0, profilesPilotExpired: 0,
      raced: 0, failed: 0, estimatedUsd: 0, maxUsd, budgetExhausted: false, aborted: false, errors: [], durationMs: 0,
    };
  }

  get stopped(): boolean {
    return this.out.budgetExhausted || this.out.aborted;
  }

  /** The vector for `text`, or null when the cap is reached or the call failed. */
  async vector(text: string, attribution: Parameters<typeof embedText>[1]): Promise<string | null> {
    const cost = estimateEmbeddingUsd(text);
    if (this.out.estimatedUsd + cost > this.out.maxUsd) {
      this.out.budgetExhausted = true;
      return null;
    }
    this.out.estimatedUsd += cost;
    try {
      const v = toVector(await this.embed(text, attribution, { model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS }));
      this.streak = 0;
      return v;
    } catch (error) {
      // The provider was paid and nothing was recorded: never swallow that.
      if (error instanceof AiUsageLogWriteError) throw error;
      this.out.failed++;
      // The message can quote the provider's body; keep only its first line, and no key ever reaches it.
      if (this.out.errors.length < 10) this.out.errors.push((error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 200));
      if (++this.streak >= MAX_CONSECUTIVE_FAILURES) this.out.aborted = true;
      return null;
    }
  }
}

async function embedTopics(run: Run, pageSize: number, topicIds: readonly string[] | undefined): Promise<void> {
  const only = topicIds ? [...topicIds] : null;
  let cursor = '';
  while (!run.stopped) {
    // `Topic` is the shared catalogue: no tenantId, no RLS. CLOSED topics are
    // never matched (topic-match.ts), so they are not paid for either.
    const rows = await prisma.$queryRaw<
      Array<{ id: string; title: string; keywords: string[]; description: string | null; embeddingHash: string | null; hasEmbedding: boolean; updatedAt: Date }>
    >`
      SELECT id, title, keywords, description, "embeddingHash", (embedding IS NOT NULL) AS "hasEmbedding", "updatedAt"
        FROM "Topic"
       WHERE status <> 'CLOSED' AND id > ${cursor}
         AND (${only}::text[] IS NULL OR id = ANY(${only}::text[]))
       ORDER BY id
       LIMIT ${pageSize}`;
    for (const row of rows) {
      if (run.stopped) break;
      run.out.topicsScanned++;
      const text = topicEmbeddingText(row);
      if (!text) {
        run.out.topicsEmpty++;
        continue;
      }
      const hash = embeddingHash(text);
      if (!needsEmbedding(row, hash)) {
        run.out.topicsUpToDate++;
        continue;
      }
      const vec = await run.vector(text, { tenantId: null, module: 'K1', purpose: TOPIC_EMBEDDING_PURPOSE });
      if (!vec) continue;
      const n = await prisma.$executeRaw`
        UPDATE "Topic" SET embedding = ${vec}::vector, "embeddingHash" = ${hash}
         WHERE id = ${row.id} AND "updatedAt" = ${row.updatedAt}`;
      if (n === 1) run.out.topicsEmbedded++;
      else run.out.raced++;
    }
    if (rows.length < pageSize) break;
    cursor = rows[rows.length - 1]!.id;
  }
}

async function embedProfile(run: Run, tenantId: string, now: Date): Promise<void> {
  if (!isPresentId(tenantId)) throw new Error('k1-embeddings: tenantId is missing');
  const head = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { deletedAt: true } });
    if (!tenant || tenant.deletedAt) return { pilotExpired: false, profile: null };
    const pilot = await getPilotState(tenantId, tx, now);
    const rows = await tx.$queryRaw<
      Array<{ capabilities: string; keywords: string[]; embeddingHash: string | null; hasEmbedding: boolean; updatedAt: Date }>
    >`
      SELECT capabilities, keywords, "embeddingHash", (embedding IS NOT NULL) AS "hasEmbedding", "updatedAt"
        FROM "TenantProfile" WHERE "tenantId" = ${tenantId}`;
    return { pilotExpired: pilot.kind === 'expired', profile: rows[0] ?? null };
  });
  if (!head.profile) return;
  run.out.profilesScanned++;
  // A read-only tenant is neither written nor paid for; k1-topic-match skips it too.
  if (head.pilotExpired) {
    run.out.profilesPilotExpired++;
    return;
  }
  const text = profileEmbeddingText(head.profile);
  if (!text) {
    run.out.profilesEmpty++;
    return;
  }
  const hash = embeddingHash(text);
  if (!needsEmbedding(head.profile, hash)) {
    run.out.profilesUpToDate++;
    return;
  }
  // Outside any transaction: `embedText` opens its own tenant scope for the AiUsageLog row.
  const vec = await run.vector(text, { tenantId, module: 'K1', purpose: PROFILE_EMBEDDING_PURPOSE });
  if (!vec) return;
  const updatedAt = head.profile.updatedAt;
  const n = await withTenant(tenantId, async (tx) => {
    await assertTenantWritable(tenantId, tx, now);
    return tx.$executeRaw`
      UPDATE "TenantProfile" SET embedding = ${vec}::vector, "embeddingHash" = ${hash}
       WHERE "tenantId" = ${tenantId} AND "updatedAt" = ${updatedAt}`;
  });
  if (n === 1) run.out.profilesEmbedded++;
  else run.out.raced++;
}

/**
 * One run: every due topic, then every live tenant's profile — or, with
 * `tenantId`, that tenant's profile only. Rows past the cap wait for the next run.
 */
export async function runK1Embeddings(options: EmbeddingRunOptions = {}): Promise<EmbeddingRunResult> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? EMBEDDING_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError(`k1-embeddings: pageSize must be >= 1, got ${pageSize}`);
  const run = new Run(options.maxUsd ?? maxUsdPerRun(), options.embed ?? embedText);

  if (!options.embed && !env.OPENAI_API_KEY) {
    run.out.skipped = 'no_api_key';
    run.out.durationMs = Date.now() - started;
    return run.out;
  }

  if (options.tenantId !== undefined) {
    await embedProfile(run, options.tenantId, now);
  } else {
    await embedTopics(run, pageSize, options.topicIds);
    let cursor = '';
    while (!run.stopped) {
      // `Tenant` is read unscoped, as in topic-match.ts; each profile under its own scope.
      const tenants = await prisma.tenant.findMany({
        where: {
          deletedAt: null,
          id: options.tenantIds ? { in: [...options.tenantIds], gt: cursor } : { gt: cursor },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: pageSize,
      });
      for (const { id } of tenants) {
        if (run.stopped) break;
        await embedProfile(run, id, now);
      }
      if (tenants.length < pageSize) break;
      cursor = tenants[tenants.length - 1]!.id;
    }
  }
  run.out.estimatedUsd = Math.round(run.out.estimatedUsd * 1e6) / 1e6;
  run.out.durationMs = Date.now() - started;
  return run.out;
}
