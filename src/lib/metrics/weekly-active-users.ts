import { Prisma } from '@prisma/client';

import { assertTenantScope, withTenant, type TenantTx } from '@/lib/db';

/**
 * Weekly active users per tenant — pilot success measure Ö1
 * (docs/kamu/ILKADIM-PILOT.md §5, TASK-MULRS12Y8F087).
 *
 * Ö1 counts a user as active in a week when they created or changed a record.
 * No new tracking exists for this: the number is derived from rows the product
 * already writes with the acting user on them. Two facts shaped that choice:
 *
 *   • `Session` is empty. NextAuth runs with `strategy: "jwt"` (src/lib/auth.ts),
 *     so a sign-in leaves no row anywhere. "Signed in this week" is not
 *     answerable from the database, and this function does not pretend it is.
 *   • `AuditEvent` alone is too thin: it records admin actions (modules, plans,
 *     billing, erasure), not the pipeline and writing work a pilot user does.
 *
 * So the count is a LOWER BOUND. It sees the writes that carry an actor and an
 * activity time (below); it does not see edits to an existing row that keep no
 * editor — a concept note edited in place, a stage moved with
 * `moveOpportunityStage`, an owner reassigned. A user whose whole week was such
 * edits reads as inactive. For a pilot threshold ("4 of 6 seats") an undercount
 * is the safe direction: it can miss a success, it cannot invent one. Closing
 * the gap needs a schema change; the design is in
 * docs/agent-results/TASK-MULRS12Y8F087-se-fb.md.
 *
 * Only users who are members of the tenant count. Platform admins act inside a
 * customer's tenant (admin/modules writes an `AuditEvent` there); without the
 * `Membership` join they would be counted as the customer's users. A member who
 * later leaves the tenant drops out of past weeks too — the history is "current
 * members' activity", not a frozen ledger.
 *
 * Weeks are Monday-to-Sunday in Turkey time (UTC+3, no DST since 2016). The
 * offset is fixed here rather than taken from Postgres' tz database so the SQL
 * bucketing and the JS week bounds are one rule, not two.
 *
 * The result carries counts only — never user ids — so a dashboard or console
 * reading it handles no personal data.
 */

/** One Monday-to-Sunday week, oldest first in the returned array. */
export interface WeeklyActiveUsersWeek {
  /** Monday of the week in Turkey time, `YYYY-MM-DD`. */
  weekStart: string;
  /** Distinct tenant members with at least one attributed write that week. */
  activeUsers: number;
}

/** Turkey has been on permanent UTC+3 since September 2016. */
const TR_OFFSET_HOURS = 3;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** Two years. Past that the caller wants a report, not a dashboard read. */
export const MAX_WEEKS = 104;

export class InvalidWeeksError extends Error {
  readonly code = 'INVALID_WEEKS';

  constructor(weeks: unknown) {
    super(`weeks must be an integer from 1 to ${MAX_WEEKS}; got ${String(weeks)}.`);
    this.name = 'InvalidWeeksError';
  }
}

/**
 * The UTC instant at which the Turkey-time week containing `now` began, and the
 * `YYYY-MM-DD` label of each of the last `weeks` weeks, oldest first.
 */
export function weekWindow(now: Date, weeks: number): { fromUtc: Date; toUtc: Date; labels: string[] } {
  // Shift to Turkey wall-clock, truncate to Monday 00:00, shift back.
  const local = new Date(now.getTime() + TR_OFFSET_HOURS * HOUR_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysSinceMonday * DAY_MS;
  const firstMondayLocal = mondayLocal - (weeks - 1) * WEEK_MS;

  const labels = Array.from({ length: weeks }, (_, i) =>
    new Date(firstMondayLocal + i * WEEK_MS).toISOString().slice(0, 10)
  );
  return {
    fromUtc: new Date(firstMondayLocal - TR_OFFSET_HOURS * HOUR_MS),
    toUtc: new Date(mondayLocal + WEEK_MS - TR_OFFSET_HOURS * HOUR_MS),
    labels,
  };
}

/** Prisma `DateTime` columns are `timestamp(3)` without zone, holding UTC. */
function pgTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * The same read as {@link getWeeklyActiveUsers}, inside a transaction the
 * caller has already bound to `tenantId` — for a loader that reads several
 * figures in one `withTenant`, and for the live test's RLS-subject client.
 *
 * Every branch filters on `tenantId` explicitly as well as through RLS: the app
 * connects as a BYPASSRLS role locally, and there the WHERE is the only fence.
 */
export async function getWeeklyActiveUsersIn(
  tx: TenantTx,
  tenantId: string,
  weeks: number,
  now: Date = new Date()
): Promise<WeeklyActiveUsersWeek[]> {
  assertTenantScope(tenantId, 'getWeeklyActiveUsers');
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) throw new InvalidWeeksError(weeks);

  const { fromUtc, toUtc, labels } = weekWindow(now, weeks);
  const from = pgTimestamp(fromUtc);
  const to = pgTimestamp(toUtc);

  // Each source is (acting user, when it happened). Tables whose only time is
  // user-entered (`Effort.date`, `Interaction.at` — the day of the meeting, not
  // of the write) are left out: they would place activity in the wrong week.
  const rows = await tx.$queryRaw<Array<{ week: string; n: number }>>(Prisma.sql`
    WITH activity (uid, at) AS (
      SELECT "actorId", "createdAt" FROM "AuditEvent"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "decidedBy", "decidedAt" FROM "GateDecision"
        WHERE "tenantId" = ${tenantId} AND "decidedAt" >= ${from}::timestamp AND "decidedAt" < ${to}::timestamp
      UNION ALL SELECT "createdBy", "createdAt" FROM "ConceptNote"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "createdBy", "createdAt" FROM "Evidence"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "userId", "createdAt" FROM "AiUsageLog"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "userId", "createdAt" FROM "SavedSearch"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "userId", "createdAt" FROM "Evaluation"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "requesterId", "createdAt" FROM "ApprovalRequest"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
      UNION ALL SELECT "actorUserId", "decidedAt" FROM "DualApprovalStep"
        WHERE "tenantId" = ${tenantId} AND "decidedAt" >= ${from}::timestamp AND "decidedAt" < ${to}::timestamp
      UNION ALL SELECT "usedByUserId", "usedAt" FROM "ProposalUsage"
        WHERE "tenantId" = ${tenantId} AND "usedAt" >= ${from}::timestamp AND "usedAt" < ${to}::timestamp
      UNION ALL SELECT "userId", "createdAt" FROM "Feedback"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from}::timestamp AND "createdAt" < ${to}::timestamp
    )
    SELECT to_char(date_trunc('week', a.at + make_interval(hours => ${TR_OFFSET_HOURS})), 'YYYY-MM-DD') AS week,
           count(DISTINCT a.uid)::int AS n
    FROM activity a
    JOIN "Membership" m ON m."tenantId" = ${tenantId} AND m."userId" = a.uid
    GROUP BY 1
  `);

  const byWeek = new Map(rows.map((r) => [r.week, Number(r.n)]));
  return labels.map((weekStart) => ({ weekStart, activeUsers: byWeek.get(weekStart) ?? 0 }));
}

/**
 * Weekly active users of one tenant for the last `weeks` weeks, the current
 * (partial) week last. Weeks with no activity are present with `0`, so a chart
 * or a "weeks at or above 4" count reads the array as is.
 *
 * Runs under `withTenant`: the caller must already have established that its
 * viewer may see this tenant (a member's own dashboard, or a platform-admin
 * console behind `requirePlatformAdmin`). An agency panel reading a linked
 * client calls this once per client, after its own link check.
 */
export async function getWeeklyActiveUsers(
  tenantId: string,
  weeks = 12,
  now: Date = new Date()
): Promise<WeeklyActiveUsersWeek[]> {
  assertTenantScope(tenantId, 'getWeeklyActiveUsers');
  return withTenant(tenantId, (tx) => getWeeklyActiveUsersIn(tx, tenantId, weeks, now));
}
