/**
 * The single writer for operator-visible alerts.
 *
 * Replaces the third-party error-tracker forwarder this repo used to carry.
 * That forwarder was only ever an amplifier — the database row was always the
 * record of truth — so this is a change of delivery channel, not a loss of
 * signal. Alerts now land in the `SystemAlert` table and are read by platform
 * admins at /[locale]/admin/alerts. Nothing leaves the deployment.
 *
 * Contract (kept identical to the forwarder it replaces):
 *   - Never throws. A caller writing an alert is already on an error path; a
 *     failure here must not turn a degraded request into a broken one.
 *   - Never logs or stores a secret.
 *   - Returns { status: 'recorded', id } or { status: 'failed', reason }.
 *
 * Privacy — read this before adding a field to `meta`:
 *   `SystemAlert` carries no `tenantId` and has NO row-level security policy
 *   (see prisma/rls.sql — it is not in either table list). Anything written
 *   here is therefore outside tenant isolation. Tenant content (report titles,
 *   bodies, e-mail addresses, page URLs, tenant ids) must NOT go into an alert.
 *   Reference the tenant-scoped, RLS-protected row by id instead and let the
 *   privileged screen join it back. `SENSITIVE_META_KEYS` enforces the easy
 *   half of that rule mechanically.
 *
 * Deduplication (TASK-MTS80DUAF39Z8):
 *   A job that fails the same way every run used to append an identical row
 *   every run — measured at n=3 identical rows for two separate jobs. An alert
 *   is identified by (level, source, message, caller meta); when an
 *   *unresolved* alert with that identity already exists, the existing row is
 *   updated with a repeat counter and a last-seen timestamp instead of a new row
 *   being written. Resolving an alert closes the window: the next occurrence
 *   opens a fresh row, so an operator who ticked something off still sees the
 *   problem come back rather than watching a counter tick behind their back.
 */

import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/** Mirrors the vocabulary the `SystemAlert.level` column documents. */
export type AlertLevel = 'info' | 'warn' | 'error';

export type AlertRecordStatus = 'recorded' | 'failed';

export interface RecordAlertInput {
  level: AlertLevel;
  /** Stable, machine-readable origin, e.g. `beta-feedback`, `tubitak_adapter`. */
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface AlertRecord {
  status: AlertRecordStatus;
  /** `SystemAlert.id` on success. Safe to store as a reference. */
  id?: string;
  reason?: string;
  /**
   * True when this occurrence folded into an already-open alert instead of
   * creating a row. Callers can ignore it; the console reads the stored
   * counter, not this field.
   */
  deduped?: boolean;
  /** How many occurrences the row now stands for. 1 on a freshly created row. */
  repeatCount?: number;
}

/**
 * Meta keys that are dropped before the row is written. A deny-list is not a
 * substitute for thinking, but it stops the obvious accidents on a table that
 * has no tenant isolation. Matching is case-insensitive and substring-based,
 * so `userEmail` and `X-Api-Key` are both caught.
 */
const SENSITIVE_META_KEYS = [
  'email',
  'password',
  'secret',
  'token',
  'apikey',
  'authorization',
  'credential',
  'dsn',
  'cookie',
];

/** Postgres takes longer strings happily; the alert list does not. */
const MAX_MESSAGE_LENGTH = 500;

/**
 * Keys this module owns inside `meta`. They are stripped from incoming meta
 * before anything is compared or written, so a job that echoes an alert's own
 * meta back into a new alert cannot inflate a counter or fake a last-seen time.
 */
const RESERVED_META_KEYS = ['alertRepeatCount', 'alertLastSeenAt'] as const;

export const ALERT_REPEAT_COUNT_KEY = 'alertRepeatCount';
export const ALERT_LAST_SEEN_KEY = 'alertLastSeenAt';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_META_KEYS.some((needle) => lower.includes(needle));
}

/**
 * Drop `undefined` values and anything whose key looks like a credential or a
 * personal identifier. Removals are reported under `redactedKeys` rather than
 * hidden: an operator reading the alert should be able to tell that a field was
 * filtered, not silently wonder where it went.
 *
 * Exported for the unit test — this is the security-relevant half of the module.
 */
export function sanitizeMeta(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  const clean: Record<string, unknown> = {};
  const redacted: string[] = [];

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (isSensitiveKey(key)) {
      redacted.push(key);
      continue;
    }
    clean[key] = value;
  }

  if (redacted.length > 0) clean.redactedKeys = redacted.sort();
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/**
 * Deterministic JSON: object keys sorted at every depth, so two metas that
 * differ only in key order compare equal. Array order is meaningful and is left
 * alone — `["a","b"]` and `["b","a"]` are different facts about a run.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** `meta` is `Json?` on the way back out of Postgres — narrow before reading. */
function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Drop the keys this module writes itself. Applied to caller input (so meta
 * cannot be forged) and to a stored row (so a row already carrying a counter
 * still compares equal to the next plain occurrence of the same alert).
 */
function stripReserved(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if ((RESERVED_META_KEYS as readonly string[]).includes(key)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * Build the row without writing it. Pure, so the shape and the truncation rule
 * can be asserted in a unit test with no database.
 *
 * The returned object must stay assignable to `prisma.systemAlert.create`'s
 * `data` — src/lib/calendar/__tests__/sync.test.ts hands it to the real client
 * and fails on any field the schema does not have.
 */
export function buildAlertRow(input: RecordAlertInput): {
  level: AlertLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
} {
  const row: {
    level: AlertLevel;
    source: string;
    message: string;
    meta?: Record<string, unknown>;
  } = {
    level: input.level,
    source: input.source.slice(0, 100),
    message: input.message.slice(0, MAX_MESSAGE_LENGTH),
  };
  const sanitized = sanitizeMeta(input.meta);
  const meta = sanitized ? stripReserved(sanitized) : undefined;
  if (meta && Object.keys(meta).length > 0) row.meta = meta;
  return row;
}

/**
 * The identity of an alert for deduplication: level, source, message and the
 * caller's own meta, with this module's bookkeeping keys ignored.
 *
 * Exported so the unit test can assert what does and does not count as "the
 * same alert" without going near a database.
 */
export function alertIdentity(row: {
  level: string;
  source: string;
  message: string;
  meta?: unknown;
}): string {
  return stableStringify([row.level, row.source, row.message, stripReserved(asObject(row.meta))]);
}

/** How many occurrences a stored row stands for. An absent counter means one. */
export function repeatCountOf(meta: unknown): number {
  const raw = asObject(meta)[ALERT_REPEAT_COUNT_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/** When the alert was last seen, or null when it has only ever happened once. */
export function lastSeenAtOf(meta: unknown): string | null {
  const raw = asObject(meta)[ALERT_LAST_SEEN_KEY];
  return typeof raw === 'string' ? raw : null;
}

/**
 * The subset of a Prisma client this module touches. `findFirst`/`update` are
 * optional: a create-only fake still works, it simply cannot deduplicate.
 */
export interface AlertDbClient {
  systemAlert: {
    create: (args: unknown) => Promise<{ id: string }>;
    findMany?: (args: unknown) => Promise<Array<{ id: string; meta: unknown }>>;
    update?: (args: unknown) => Promise<unknown>;
  };
}

/**
 * How many open alerts from the same source, with the same level and message,
 * are examined before giving up and writing a new row. In practice this is 0 or
 * 1 — the only way to get more is a race between two writers.
 */
const DEDUPE_CANDIDATE_LIMIT = 5;

/**
 * Write one alert, or fold it into the open alert that already says exactly the
 * same thing.
 *
 * The candidate query filters on `source` first so it rides the existing
 * `[source, createdAt]` index; `meta` is compared in JS, because two metas that
 * are equal as values are not necessarily equal as stored JSON text.
 *
 * `client` exists so a job running under a different database role, or a test,
 * can supply its own connection; production uses the singleton.
 */
export async function recordAlert(
  input: RecordAlertInput,
  options: { client?: AlertDbClient } = {}
): Promise<AlertRecord> {
  const db: AlertDbClient = options.client ?? (prisma as unknown as AlertDbClient);
  const row = buildAlertRow(input);

  try {
    const existing = await findOpenDuplicate(db, row);

    if (existing && db.systemAlert.update) {
      const repeatCount = repeatCountOf(existing.meta) + 1;
      await db.systemAlert.update({
        where: { id: existing.id },
        data: {
          meta: {
            ...asObject(existing.meta),
            [ALERT_REPEAT_COUNT_KEY]: repeatCount,
            [ALERT_LAST_SEEN_KEY]: new Date().toISOString(),
          },
        },
      });
      return { status: 'recorded', id: existing.id, deduped: true, repeatCount };
    }

    const created = await db.systemAlert.create({ data: row, select: { id: true } });
    return { status: 'recorded', id: created.id };
  } catch (error) {
    // Console only. Re-raising would break the caller, and the message could
    // carry a connection string, so nothing from `error` is returned upward.
    console.error(`[recordAlert] could not write SystemAlert: ${errorMessage(error)}`);
    return { status: 'failed', reason: 'write_failed' };
  }
}

/**
 * The open alert this occurrence repeats, or null.
 *
 * Only *unresolved* rows are candidates. Resolving an alert deliberately closes
 * the window: an operator who ticked something off should see the problem come
 * back as a new row rather than watch a counter move behind their back.
 */
async function findOpenDuplicate(
  db: AlertDbClient,
  row: { level: AlertLevel; source: string; message: string; meta?: Record<string, unknown> }
): Promise<{ id: string; meta: unknown } | null> {
  if (!db.systemAlert.findMany) return null;

  const candidates = await db.systemAlert.findMany({
    where: {
      level: row.level,
      source: row.source,
      message: row.message,
      resolvedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: DEDUPE_CANDIDATE_LIMIT,
    select: { id: true, meta: true },
  });

  const identity = alertIdentity(row);
  for (const candidate of candidates) {
    if (alertIdentity({ ...row, meta: candidate.meta }) === identity) return candidate;
  }
  return null;
}
