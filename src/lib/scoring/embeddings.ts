import crypto from 'crypto';
import { prisma, withTenant } from '@/lib/db';
import { AiUsageLogWriteError, embedText } from '@/lib/llm';
import { errorStatus } from '@/lib/errors';
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
 *
 * One refused input never stops the run (TASK-MUNEGYCFJQZ9S, İNCELEME-55 B-1):
 * a 400 is retried once on a prefix that cannot exceed the model's token limit;
 * if that is refused too, the row is marked `rejected:<hash>` and skipped until
 * its text changes. Only failures that say nothing about the row (401, 429,
 * 5xx, network) count towards {@link MAX_CONSECUTIVE_FAILURES}.
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
 * A plain character cap, kept from the first version so the text (and so the
 * hash) of English rows already embedded does not move: 16 000 ASCII
 * characters estimate at ~4 800 tokens, under the cut below. The longest topic
 * description in the catalogue is ~36 000 characters.
 */
export const MAX_EMBED_CHARS = 16_000;

/**
 * text-embedding-3-large takes at most 8191 tokens. The text is also cut at
 * this many *estimated* tokens ({@link estimateEmbeddingTokens}); 16 000
 * characters of Greek are ~14 000 real tokens, which the character cap alone
 * let through (İNCELEME-55 B-1: a 400 on every run).
 */
export const MAX_EMBED_TOKENS_ESTIMATE = 8_000;

/**
 * The retry after a 400: a prefix of at most this many UTF-8 bytes. The
 * tokenizer is byte-level BPE, every token is at least one byte, so this can
 * never exceed 8191 tokens whatever the script — base64 or hex included, which
 * the estimate under-counts.
 */
export const FALLBACK_EMBED_BYTES = 8_000;

/** Marks a row whose text the provider refused; see {@link needsEmbedding}. */
export const REJECTED_HASH_PREFIX = 'rejected:';

/** After this many system failures in a row the run stops: a bad key or an outage. */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * After this many refused rows in a row the run stops too: every input being
 * refused says the request is wrong, not the rows. The rows already marked
 * come back once `embeddingHash` is cleared (see the result file).
 */
const MAX_CONSECUTIVE_REJECTIONS = 5;

export const EMBEDDING_PAGE_SIZE = 200;

export const TOPIC_EMBEDDING_PURPOSE = 'k1_topic_embedding';
export const PROFILE_EMBEDDING_PURPOSE = 'k1_profile_embedding';

/**
 * Upper-bound tokens one code point costs under cl100k_base, the tokenizer of
 * text-embedding-3-*. Measured with the real tokenizer on research-call prose
 * in 23 languages, plus emoji, digits and URLs (tests/fixtures/
 * cl100k-token-samples.json pins the counts):
 * real characters per token run from ~6 (English) to ~2.5 (Turkish, Polish),
 * ~1.1 (Greek), ~1.7–2.3 (Cyrillic) and below 1 (CJK, Armenian, emoji). Latin
 * letters with diacritics also split their neighbours, hence 2 each. Scripts
 * not listed get 3, at or above their UTF-8 length. Machine strings (base64,
 * hex) are not bounded by it; {@link FALLBACK_EMBED_BYTES} covers their length.
 */
function tokenWeight(c: number): number {
  if (c < 0x80) return c >= 0x30 && c <= 0x39 ? 0.6 : 0.3; // ASCII: digits split in threes
  if (c < 0x250 || (c >= 0x1e00 && c < 0x1f00)) return 2; // Latin-1, Latin Extended A/B and Additional
  if ((c >= 0x370 && c < 0x400) || (c >= 0x1f00 && c < 0x2000)) return 1.2; // Greek
  if (c >= 0x400 && c < 0x530) return 0.8; // Cyrillic
  if ((c >= 0x3040 && c < 0x3100) || (c >= 0x3400 && c < 0xa000) || (c >= 0xac00 && c < 0xd7b0) || (c >= 0xf900 && c < 0xfb00)) return 1.5; // kana, CJK, Hangul
  if (c > 0xffff) return 4; // emoji and other astral code points: 4 UTF-8 bytes
  return 3;
}

/** Upper-bound estimate of the tokens `text` costs (see {@link tokenWeight}). */
export function estimateEmbeddingTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) tokens += tokenWeight(ch.codePointAt(0)!);
  return Math.ceil(tokens);
}

/** The longest prefix of `text` whose estimate stays within `budget` tokens. */
function cutToTokenEstimate(text: string, budget: number): string {
  let tokens = 0;
  let end = 0;
  for (const ch of text) {
    tokens += tokenWeight(ch.codePointAt(0)!);
    if (tokens > budget) return text.slice(0, end);
    end += ch.length;
  }
  return text;
}

/** The longest prefix of `text` that is at most `maxBytes` in UTF-8, never splitting a code point. */
export function utf8Prefix(text: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const ch of text) {
    bytes += Buffer.byteLength(ch, 'utf8');
    if (bytes > maxBytes) return text.slice(0, end);
    end += ch.length;
  }
  return text;
}

function clean(parts: Array<string | null | undefined>): string {
  const text = parts
    .map((p) => (p ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_EMBED_CHARS);
  return cutToTokenEstimate(text, MAX_EMBED_TOKENS_ESTIMATE);
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
  return (estimateEmbeddingTokens(text) / 1_000_000) * EMBEDDING_USD_PER_MTOK;
}

/** The per-run cap, from the environment. Defaults low on purpose. */
export function maxUsdPerRun(): number {
  return Number(env.K1_EMBEDDING_MAX_USD_PER_RUN);
}

/**
 * Why a row does (or does not) need a new vector. A row the provider refused
 * for this very text is not sent again; a new text (or model) is a new hash.
 */
export function needsEmbedding(row: { hasEmbedding: boolean; embeddingHash: string | null }, hash: string): boolean {
  if (row.embeddingHash === REJECTED_HASH_PREFIX + hash) return false;
  return !row.hasEmbedding || row.embeddingHash !== hash;
}

/** A refusal of this input, not of the request: retrying it unchanged fails the same way. */
function isInputRejection(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 400 || status === 413;
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
  /** Rows the provider refused this run, now marked and skipped until their text changes. */
  rejected: number;
  /** Rows skipped because an earlier run marked them refused. */
  previouslyRejected: number;
  /** Rows embedded from a byte-safe prefix after their full text was refused. */
  shortened: number;
  /** Rows whose text changed while their vector was being made; left for the next run. */
  raced: number;
  failed: number;
  /** Conservative USD estimate of what the run sent to the provider. */
  estimatedUsd: number;
  maxUsd: number;
  /** True when the cap stopped the run with rows still due. */
  budgetExhausted: boolean;
  /** True when {@link MAX_CONSECUTIVE_FAILURES} system failures (or {@link MAX_CONSECUTIVE_REJECTIONS} refusals) in a row stopped the run. */
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

/** What {@link Run.vector} made of one row. */
type VectorOutcome = { vec: string } | 'rejected' | null;

class Run {
  readonly out: EmbeddingRunResult;
  private streak = 0;
  private rejectedStreak = 0;
  constructor(
    maxUsd: number,
    private readonly embed: typeof embedText
  ) {
    this.out = {
      topicsScanned: 0, topicsEmbedded: 0, topicsUpToDate: 0, topicsEmpty: 0,
      profilesScanned: 0, profilesEmbedded: 0, profilesUpToDate: 0, profilesEmpty: 0, profilesPilotExpired: 0,
      rejected: 0, previouslyRejected: 0, shortened: 0, raced: 0, failed: 0, estimatedUsd: 0, maxUsd, budgetExhausted: false, aborted: false, errors: [], durationMs: 0,
    };
  }

  get stopped(): boolean {
    return this.out.budgetExhausted || this.out.aborted;
  }

  /** One provider call, cap first. `'cap'` when the cap stopped it; the error when it failed. */
  private async call(text: string, attribution: Parameters<typeof embedText>[1]): Promise<{ vec: string } | 'cap' | { error: unknown }> {
    const cost = estimateEmbeddingUsd(text);
    if (this.out.estimatedUsd + cost > this.out.maxUsd) {
      this.out.budgetExhausted = true;
      return 'cap';
    }
    this.out.estimatedUsd += cost;
    try {
      return { vec: toVector(await this.embed(text, attribution, { model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS })) };
    } catch (error) {
      // The provider was paid and nothing was recorded: never swallow that.
      if (error instanceof AiUsageLogWriteError) throw error;
      return { error };
    }
  }

  private fail(error: unknown): void {
    this.out.failed++;
    // The message can quote the provider's body; keep only its first line, and no key ever reaches it.
    if (this.out.errors.length < 10) this.out.errors.push((error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 200));
  }

  /**
   * The vector for `text`; `'rejected'` when the provider refused this input
   * (the caller marks the row); null when the cap is reached or the call
   * failed for a reason that is not the row's.
   */
  async vector(text: string, attribution: Parameters<typeof embedText>[1]): Promise<VectorOutcome> {
    let r = await this.call(text, attribution);
    if (r !== 'cap' && 'error' in r && isInputRejection(r.error)) {
      const prefix = utf8Prefix(text, FALLBACK_EMBED_BYTES);
      if (prefix.length < text.length) {
        const retry = await this.call(prefix, attribution);
        if (retry !== 'cap' && 'vec' in retry) this.out.shortened++;
        // A retry that failed for another reason is judged on its own error.
        if (retry === 'cap' || 'vec' in retry || !isInputRejection(retry.error)) r = retry;
      }
    }
    if (r === 'cap') return null;
    if ('vec' in r) {
      this.streak = 0;
      this.rejectedStreak = 0;
      return r;
    }
    this.fail(r.error);
    if (isInputRejection(r.error)) {
      this.out.rejected++;
      if (++this.rejectedStreak >= MAX_CONSECUTIVE_REJECTIONS) this.out.aborted = true;
      return 'rejected';
    }
    if (++this.streak >= MAX_CONSECUTIVE_FAILURES) this.out.aborted = true;
    return null;
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
      if (row.embeddingHash === REJECTED_HASH_PREFIX + hash) {
        run.out.previouslyRejected++;
        continue;
      }
      if (!needsEmbedding(row, hash)) {
        run.out.topicsUpToDate++;
        continue;
      }
      const got = await run.vector(text, { tenantId: null, module: 'K1', purpose: TOPIC_EMBEDDING_PURPOSE });
      if (!got) continue;
      if (got === 'rejected') {
        // Only the hash moves; a vector made from an earlier text stays until one for this text exists.
        await prisma.$executeRaw`
          UPDATE "Topic" SET "embeddingHash" = ${REJECTED_HASH_PREFIX + hash}
           WHERE id = ${row.id} AND "updatedAt" = ${row.updatedAt}`;
        continue;
      }
      const n = await prisma.$executeRaw`
        UPDATE "Topic" SET embedding = ${got.vec}::vector, "embeddingHash" = ${hash}
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
  if (head.profile.embeddingHash === REJECTED_HASH_PREFIX + hash) {
    run.out.previouslyRejected++;
    return;
  }
  if (!needsEmbedding(head.profile, hash)) {
    run.out.profilesUpToDate++;
    return;
  }
  // Outside any transaction: `embedText` opens its own tenant scope for the AiUsageLog row.
  const got = await run.vector(text, { tenantId, module: 'K1', purpose: PROFILE_EMBEDDING_PURPOSE });
  if (!got) return;
  const updatedAt = head.profile.updatedAt;
  if (got === 'rejected') {
    await withTenant(tenantId, async (tx) => {
      await assertTenantWritable(tenantId, tx, now);
      return tx.$executeRaw`
        UPDATE "TenantProfile" SET "embeddingHash" = ${REJECTED_HASH_PREFIX + hash}
         WHERE "tenantId" = ${tenantId} AND "updatedAt" = ${updatedAt}`;
    });
    return;
  }
  const n = await withTenant(tenantId, async (tx) => {
    await assertTenantWritable(tenantId, tx, now);
    return tx.$executeRaw`
      UPDATE "TenantProfile" SET embedding = ${got.vec}::vector, "embeddingHash" = ${hash}
       WHERE "tenantId" = ${tenantId} AND "updatedAt" = ${updatedAt}`;
  });
  if (n === 1) run.out.profilesEmbedded++;
  else run.out.raced++;
}

/**
 * One run: every live tenant's profile, then every due topic — or, with
 * `tenantId`, that tenant's profile only. Rows past the cap wait for the next run.
 *
 * Profiles go first (İNCELEME-55 B-4): they are few and cost < 0.0001 USD
 * each, and without them `k1-topic-match` writes nothing at all. Topics first
 * meant the cap was spent on the ~1300-topic backfill for several nights while
 * no profile got a vector; profiles first means matching works from night one
 * against the topics embedded so far.
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
    await embedTopics(run, pageSize, options.topicIds);
  }
  run.out.estimatedUsd = Math.round(run.out.estimatedUsd * 1e6) / 1e6;
  run.out.durationMs = Date.now() - started;
  return run.out;
}
