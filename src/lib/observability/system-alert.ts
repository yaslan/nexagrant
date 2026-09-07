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
 * Build the row without writing it. Pure, so the shape and the truncation rule
 * can be asserted in a unit test with no database.
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
  const meta = sanitizeMeta(input.meta);
  if (meta) row.meta = meta;
  return row;
}

/**
 * Write one alert. `client` exists so a job running under a different database
 * role, or a test, can supply its own connection; production uses the singleton.
 */
export async function recordAlert(
  input: RecordAlertInput,
  options: { client?: { systemAlert: { create: (args: unknown) => Promise<{ id: string }> } } } = {}
): Promise<AlertRecord> {
  const db = options.client ?? prisma;
  try {
    const created = await db.systemAlert.create({
      data: buildAlertRow(input),
      select: { id: true },
    });
    return { status: 'recorded', id: created.id };
  } catch (error) {
    // Console only. Re-raising would break the caller, and the message could
    // carry a connection string, so nothing from `error` is returned upward.
    console.error(`[recordAlert] could not write SystemAlert: ${errorMessage(error)}`);
    return { status: 'failed', reason: 'write_failed' };
  }
}
