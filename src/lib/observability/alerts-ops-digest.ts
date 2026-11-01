/**
 * The hourly operator digest of `error` SystemAlerts (FO-246, RELEASE_CHECKLIST §5.2).
 *
 * Until this, an alert was pull-only: nobody saw it unless they opened
 * /[locale]/admin/alerts. The `alerts-ops-digest` job
 * (src/lib/jobs/tasks/alerts-ops-digest.ts) is a thin wrapper around
 * {@link runAlertsOpsDigest}; the logic lives here so it runs against a fake
 * client in a unit test and against the real table in a live one.
 *
 * What goes out: one mail, grouped by (source, level) — source, level, how many
 * alerts, how many occurrences they stand for, first and last seen, and a link
 * to the console. Never `message` or `meta`: `recordAlert` keeps tenant content
 * out of both by contract, but a mail leaves the deployment and a contract is
 * not a guarantee, so the digest simply does not carry them.
 *
 * Idempotency: a mailed row is stamped in its own `meta`
 * (`alertDigestedAt`, `alertDigestedCount`) AFTER the mail is accepted. A row is
 * picked up again only when it has no stamp, or when its repeat counter has
 * grown by {@link REPEAT_DIGEST_STEP} since the stamp. No new table: the stamp
 * rides on the row the operator already resolves, so resolving closes it for
 * the digest too. Delivery is at-least-once: if the stamp write fails after a
 * send, the next run mails the same rows once more rather than losing them.
 *
 * Failure mode: a send that fails is NOT an `error` SystemAlert. Such a row would
 * be picked up by the next digest, whose mail fails again — a loop that grows
 * one row per hour. It is logged, reported in the job output, and written as a
 * `warn` (never picked up by this job) so the console still shows it.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { appUrl } from '@/lib/app-url';
import { PRODUCT_NAME } from '@/lib/brand';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { smtpMailer, MailSendError, type Mailer } from '@/lib/email/mailer';
import { escapeHtml } from '@/lib/feedback/digest';
import {
  ALERT_DIGESTED_AT_KEY,
  ALERT_DIGESTED_COUNT_KEY,
  ALERT_REPEAT_COUNT_KEY,
  recordAlert,
  repeatCountOf,
  lastSeenAtOf,
} from '@/lib/observability/system-alert';

/** This job's own `SystemAlert.source`. Its alerts are never part of its digest. */
export const OPS_DIGEST_SOURCE = 'alerts-ops-digest';

/** A digested row comes back when its repeat counter grew by this much since the stamp. */
export const REPEAT_DIGEST_STEP = 10;

/**
 * Rows that still owe a mail, taken per run (newest first). The limit applies
 * AFTER the pending test (see `findPending`), so rows past it are all unmailed
 * and unstamped: the next run, once this run's batch is stamped, reaches them.
 * Hitting the limit is logged.
 */
export const CANDIDATE_LIMIT = 1000;
/** Groups listed in the mail body; the rest are counted, not listed. */
const MAX_LISTED_GROUPS = 25;

export interface DigestAlertRow {
  id: string;
  source: string;
  level: string;
  meta: unknown;
  createdAt: Date;
}

/**
 * The two database operations this module needs; tests pass a fake, production
 * uses {@link prismaDigestDb}. They are named for the guarantee, not the query:
 * the real implementation is SQL because both guarantees (pending-only
 * selection, atomic stamp) need the database to evaluate the JSON, which
 * Prisma's JSON filters cannot do (no field-to-field comparison).
 */
export interface DigestDbClient {
  /**
   * Open `error` rows (not from `excludeSource`) that {@link needsDigest} would
   * accept, newest first, at most `limit`. The limit must apply after that test.
   */
  findPending: (args: { limit: number; excludeSource: string }) => Promise<DigestAlertRow[]>;
  /**
   * Atomically merge the digest stamp into the row's meta. Must touch no other
   * key: a concurrent `recordAlert` counter bump has to survive.
   */
  stamp: (args: { id: string; at: Date; count: number }) => Promise<void>;
}

/**
 * The real implementation. `sourcePrefix` narrows selection to sources that
 * start with it — for the live test on a shared database; production passes none.
 *
 * The WHERE mirrors {@link needsDigest} exactly (same number coercions; the
 * nested CASEs matter — a cast must not run on a non-number), and
 * `runAlertsOpsDigest` still applies `needsDigest` to what comes back.
 */
export function prismaDigestDb(client: Pick<PrismaClient, '$queryRaw' | '$executeRaw'>, scope: { sourcePrefix?: string } = {}): DigestDbClient {
  const prefix = scope.sourcePrefix ?? null;
  return {
    findPending: ({ limit, excludeSource }) =>
      client.$queryRaw<DigestAlertRow[]>(Prisma.sql`
        SELECT s."id", s."source", s."level", s."meta", s."createdAt"
        FROM "SystemAlert" s
        WHERE s."level" = 'error'
          AND s."resolvedAt" IS NULL
          AND s."source" <> ${excludeSource}
          AND (${prefix}::text IS NULL OR starts_with(s."source", ${prefix}::text))
          AND (
            jsonb_typeof(s."meta"->${ALERT_DIGESTED_AT_KEY}::text) IS DISTINCT FROM 'string'
            OR (
              CASE WHEN jsonb_typeof(s."meta"->${ALERT_REPEAT_COUNT_KEY}::text) = 'number'
                   THEN CASE WHEN (s."meta"->>${ALERT_REPEAT_COUNT_KEY}::text)::numeric >= 1
                             THEN floor((s."meta"->>${ALERT_REPEAT_COUNT_KEY}::text)::numeric) ELSE 1 END
                   ELSE 1 END
              >=
              CASE WHEN jsonb_typeof(s."meta"->${ALERT_DIGESTED_COUNT_KEY}::text) = 'number'
                   THEN CASE WHEN (s."meta"->>${ALERT_DIGESTED_COUNT_KEY}::text)::numeric >= 1
                             THEN floor((s."meta"->>${ALERT_DIGESTED_COUNT_KEY}::text)::numeric) ELSE 1 END
                   ELSE 1 END
              + ${REPEAT_DIGEST_STEP}::int
            )
          )
        ORDER BY s."createdAt" DESC, s."id"
        LIMIT ${limit}::int
      `),
    stamp: async ({ id, at, count }) => {
      await client.$executeRaw(Prisma.sql`
        UPDATE "SystemAlert"
        SET "meta" = (CASE WHEN jsonb_typeof("meta") = 'object' THEN "meta" ELSE '{}'::jsonb END)
          || jsonb_build_object(
               ${ALERT_DIGESTED_AT_KEY}::text, ${at.toISOString()}::text,
               ${ALERT_DIGESTED_COUNT_KEY}::text, ${count}::int
             )
        WHERE "id" = ${id}
      `);
    },
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function digestedCountOf(meta: unknown): number | null {
  const o = asObject(meta);
  if (typeof o[ALERT_DIGESTED_AT_KEY] !== 'string') return null;
  const raw = o[ALERT_DIGESTED_COUNT_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/** True when the digest still owes the operator this row. Pure. */
export function needsDigest(row: Pick<DigestAlertRow, 'meta'>): boolean {
  const done = digestedCountOf(row.meta);
  return done === null || repeatCountOf(row.meta) >= done + REPEAT_DIGEST_STEP;
}

export interface DigestGroup {
  source: string;
  level: string;
  alerts: number;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
}

/** Groups by (source, level), busiest first. Pure. */
export function groupAlerts(rows: readonly DigestAlertRow[]): DigestGroup[] {
  const groups = new Map<string, DigestGroup>();
  for (const row of rows) {
    const key = `${row.level}\u0000${row.source}`;
    const seenRaw = lastSeenAtOf(row.meta);
    const seen = seenRaw && !Number.isNaN(Date.parse(seenRaw)) ? new Date(seenRaw) : row.createdAt;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        source: row.source,
        level: row.level,
        alerts: 1,
        occurrences: repeatCountOf(row.meta),
        firstSeen: row.createdAt,
        lastSeen: seen,
      });
      continue;
    }
    g.alerts += 1;
    g.occurrences += repeatCountOf(row.meta);
    if (row.createdAt < g.firstSeen) g.firstSeen = row.createdAt;
    if (seen > g.lastSeen) g.lastSeen = seen;
  }
  return [...groups.values()].sort(
    (a, b) => b.occurrences - a.occurrences || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0)
  );
}

/** Control characters and line separators out of anything that reaches a Subject header. */
const HEADER_UNSAFE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/**
 * Subject and HTML of the digest. Pure, so the escaping and the "no personal
 * data" rule are testable without SMTP. Operator mail: English, like the other
 * operator mails (feedback digest, saved-search alert), not a UI string.
 */
export function renderOpsDigest(params: {
  groups: readonly DigestGroup[];
  alertCount: number;
  consoleUrl: string;
}): { subject: string; html: string } {
  const { groups, alertCount, consoleUrl } = params;
  const listed = groups.slice(0, MAX_LISTED_GROUPS);
  const hidden = groups.length - listed.length;
  const subject = `[${PRODUCT_NAME}] ${alertCount} open error alert${alertCount === 1 ? '' : 's'} to review`
    .replace(HEADER_UNSAFE, ' ')
    .trim();
  const cell = 'padding:6px 10px;border-bottom:1px solid #e2e8f0';
  const rows = listed
    .map(
      (g) => `
        <tr>
          <td style="${cell};font-family:monospace">${escapeHtml(g.source)}</td>
          <td style="${cell}">${escapeHtml(g.level)}</td>
          <td style="${cell};text-align:right">${g.alerts}</td>
          <td style="${cell};text-align:right">${g.occurrences}</td>
          <td style="${cell}">${escapeHtml(g.firstSeen.toISOString())}</td>
          <td style="${cell}">${escapeHtml(g.lastSeen.toISOString())}</td>
        </tr>`
    )
    .join('');
  const more = hidden > 0 ? `<p>…and ${hidden} more source${hidden === 1 ? '' : 's'} in the console.</p>` : '';
  const html = `
    <h2>${PRODUCT_NAME} — open error alerts</h2>
    <p>${alertCount} error alert${alertCount === 1 ? ' is' : 's are'} new or have repeated since the last digest.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <thead>
        <tr>
          <th style="${cell};text-align:left">Source</th>
          <th style="${cell};text-align:left">Level</th>
          <th style="${cell};text-align:right">Alerts</th>
          <th style="${cell};text-align:right">Occurrences</th>
          <th style="${cell};text-align:left">First seen (UTC)</th>
          <th style="${cell};text-align:left">Last seen (UTC)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${more}
    <p><a href="${escapeHtml(consoleUrl)}">Open the alerts console</a></p>
    <p style="color:#64748b;font-size:12px">Sent at most once an hour, only when there is something new. Resolve an alert in the console to close it.</p>
  `;
  return { subject, html };
}

export type OpsDigestOutcome = 'sent' | 'nothing_new' | 'no_recipient' | 'no_mail_provider' | 'send_failed';

export interface OpsDigestResult {
  outcome: OpsDigestOutcome;
  /** Alert rows the mail covered (0 unless `sent`). */
  alerts: number;
  /** Rows whose stamp could not be written after a successful send. */
  stampFailures: number;
}

export interface OpsDigestOptions {
  /** Defaults to `env.ALERTS_OPS_EMAIL`. */
  recipient?: string | undefined;
  /** Defaults to the SMTP mailer; null = no provider. */
  mailer?: Mailer | null;
  db?: DigestDbClient;
  now?: Date;
  consoleUrl?: string;
}

let warnedNoRecipient = false;
let warnedNoMailer = false;
/** Test hook: the "warn once" memory is module state. */
export function resetOpsDigestWarnings(): void {
  warnedNoRecipient = false;
  warnedNoMailer = false;
}

export async function runAlertsOpsDigest(options: OpsDigestOptions = {}): Promise<OpsDigestResult> {
  const recipient = 'recipient' in options ? options.recipient : env.ALERTS_OPS_EMAIL;
  if (!recipient) {
    if (!warnedNoRecipient) {
      warnedNoRecipient = true;
      logger.warn('[alerts-ops-digest] ALERTS_OPS_EMAIL is unset: error alerts are not mailed');
    }
    return { outcome: 'no_recipient', alerts: 0, stampFailures: 0 };
  }

  const db = options.db ?? prismaDigestDb(prisma);
  const now = options.now ?? new Date();

  // SystemAlert has no tenant column and no row security (system-alert.ts), so
  // the plain client is the right one here, as it is for `recordAlert`.
  const pending = await db.findPending({ limit: CANDIDATE_LIMIT, excludeSource: OPS_DIGEST_SOURCE });
  if (pending.length >= CANDIDATE_LIMIT) {
    logger.warn('[alerts-ops-digest] pending-row limit reached; the rest are mailed by the following runs', {
      limit: CANDIDATE_LIMIT,
    });
  }
  // The database already applied this; it stays as the contract for any other client.
  const fresh = pending.filter(needsDigest);
  if (fresh.length === 0) return { outcome: 'nothing_new', alerts: 0, stampFailures: 0 };

  const mailer = 'mailer' in options ? options.mailer : smtpMailer();
  if (!mailer) {
    // Nothing is stamped: the rows wait for a provider. `reportMailNotConfigured`
    // is deliberately not used — it writes an `error` row that this job would
    // then try to mail.
    if (!warnedNoMailer) {
      warnedNoMailer = true;
      logger.warn('[alerts-ops-digest] SMTP_HOST is unset: error alerts are not mailed', { pending: fresh.length });
    }
    return { outcome: 'no_mail_provider', alerts: 0, stampFailures: 0 };
  }

  const { subject, html } = renderOpsDigest({
    groups: groupAlerts(fresh),
    alertCount: fresh.length,
    consoleUrl: options.consoleUrl ?? `${appUrl()}/tr/admin/alerts`,
  });

  try {
    await mailer({ to: recipient, subject, html });
  } catch (error) {
    // Code only: a raw mailer error can quote the server or the address.
    const reason = error instanceof MailSendError ? error.message : 'send_error';
    logger.warn('[alerts-ops-digest] send failed; rows stay unstamped and are retried next run', {
      reason,
      pending: fresh.length,
    });
    await recordAlert({
      level: 'warn',
      source: OPS_DIGEST_SOURCE,
      message: 'Error-alert digest could not be mailed',
      meta: { reason },
      dedupeKey: 'send-failed',
    });
    return { outcome: 'send_failed', alerts: 0, stampFailures: 0 };
  }

  let stampFailures = 0;
  for (const row of fresh) {
    try {
      // The count is the one the mail carried (the snapshot), not whatever the
      // row says now: a repeat that landed after the select was not mailed.
      await db.stamp({ id: row.id, at: now, count: repeatCountOf(row.meta) });
    } catch {
      stampFailures += 1;
    }
  }
  if (stampFailures > 0) {
    logger.warn('[alerts-ops-digest] mailed, but some rows could not be stamped; they repeat next run', {
      stampFailures,
    });
  }
  return { outcome: 'sent', alerts: fresh.length, stampFailures };
}
