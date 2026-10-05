import { createHash } from 'node:crypto';
import { defineJob } from '../define';
import { prisma, withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { errorCode } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';
import {
  UsersScheduledDeletionEventSchema,
  UsersScheduledDeletionOutputSchema,
  type UsersScheduledDeletionOutput,
} from '../events';

const DEFAULT_GRACE_PERIOD_DAYS = 30;

/**
 * Identity of the "erasure did not finish" alert.
 *
 * `source` and `message` are constants and the meta below is derived only from
 * *which* accounts failed and *how*, never from anything that varies run to
 * run. That is deliberate: `recordAlert` identifies an alert by
 * (level, source, message, meta) and folds a repeat into the open row
 * (TASK-MTS80DUAF39Z8). A timestamp, an attempt counter or a raw error string
 * in `meta` would silently defeat that and go back to one row per night.
 */
const PURGE_ALERT_SOURCE = 'users-scheduled-deletion';
const PURGE_ALERT_MESSAGE = 'Scheduled erasure did not complete for every due account';

/** One account the purge could not finish, reduced to what an alert may carry. */
export interface PurgeFailure {
  userId: string;
  /** `P2011`, `ENOENT`, or the error class name — never the message text. */
  kind: string;
}

/**
 * The alert a failed purge run writes, built without touching the database so
 * the shape can be pinned in a unit test.
 *
 * `SystemAlert` has no tenant column and no RLS policy, so nothing here may be
 * personal data or tenant content: the subject is referenced by the `User.id`
 * an operator can look up under tenant scope, and the reason is reduced to an
 * error *code*. The messages themselves stay in the job output and the server
 * log, which are already tenant-privileged.
 */
export function buildPurgeFailureAlert(failures: PurgeFailure[]): {
  level: 'error';
  source: string;
  message: string;
  meta: Record<string, unknown>;
} {
  return {
    level: 'error',
    source: PURGE_ALERT_SOURCE,
    message: PURGE_ALERT_MESSAGE,
    meta: {
      failedCount: failures.length,
      // Sorted, because `stableStringify` treats array order as meaningful and
      // the same two accounts failing in the other order is the same alert.
      failedUserIds: [...new Set(failures.map((f) => f.userId))].sort(),
      failureKinds: [...new Set(failures.map((f) => f.kind))].sort(),
    },
  };
}

/**
 * Finds every account whose erasure grace period has expired and purges it.
 *
 * Exported separately from the job wrapper so the rule can be unit-tested
 * and run on demand without a queue — the scheduled function below
 * is only a trigger around this.
 */
export async function purgeDueUsers(
  gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS
): Promise<UsersScheduledDeletionOutput> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - gracePeriodDays);

  // Memberships are read here, before the purge: they cascade away with the
  // user row, and the audit trail needs to know which tenants were touched.
  //
  // `memberships` is a NESTED read of the tenant-scoped Membership table, and a
  // nested read obeys RLS exactly like a top-level one. Outside a scope it comes
  // back empty under `fabrika_app`, and then every erasure audit below is
  // written with no tenant attribution at all — a silently weaker audit trail,
  // not an error. Hence the system scope on a query whose own model is unpoliced.
  const dueUsers = await withSystemScope('subject-scoped', 'erasure-sweep.dueUsers', (tx) =>
    tx.user.findMany({
      where: { deletionRequestedAt: { not: null, lte: cutoff } },
      select: {
        id: true,
        deletionRequestedAt: true,
        deletionReason: true,
        memberships: { select: { tenantId: true } },
      },
    })
  );

  let purgedCount = 0;
  let failedCount = 0;
  const errors: Array<{ userId: string; message: string }> = [];
  const failures: PurgeFailure[] = [];

  for (const user of dueUsers) {
    const userId = user.id;
    try {
      // 1. Object storage: nothing to do, deliberately (TASK-MUPL2D9B8QWAB).
      //    Every stored object is a tenant's — evidence under `<tenant>/`, the
      //    co-brand logo under `<tenant>/agency/cobrand/`, a feedback screenshot
      //    under `feedback/<tenant>/` whose row step 3b keeps — and none is
      //    keyed by a person. This step used to list `users/<id>/`, a prefix no
      //    code writes, so it removed nothing. The files go when their tenant
      //    is deleted, not when one of its members is. Declared in
      //    docs/legal/processing-register.md §15.

      // 2-3. Everything below detaches or removes the subject across EVERY tenant
      //      they belong to at once — `where: { userId }`, no tenantId anywhere —
      //      so scoping it per tenant would mean enumerating tenants from the row
      //      set it is about to change. Under `fabrika_app` each of these matches
      //      nothing and reports `count: 0`: the sweep would announce a completed
      //      erasure having deleted not one row.
      //
      //      One system scope around the whole subject rather than one per
      //      statement, so a crash halfway cannot leave a half-erased person.
      await withSystemScope('subject-scoped', 'erasure-sweep.detachSubject', async (tx) => {
        // 2. Anonymise records the tenant must keep for billing/audit.
        await tx.aiUsageLog.updateMany({
          where: { userId },
          data: { userId: null },
        });

        // 3. Remove person-level rows that have no FK cascade.
        await tx.effort.deleteMany({ where: { userId } });

        // 3b. Ten columns in this schema hold a `User.id` without a foreign key,
        //     so `DELETE FROM "User"` cannot reach any of them and the erased
        //     person survives in every one the job does not name here.
        //
        //     Two of them are the subject's own data and are removed outright.
        //     `CalendarConnection` matters most: it stores a Google calendar
        //     access and refresh token in clear text, so leaving the row behind
        //     leaves a working credential for the mailbox of someone the
        //     platform has just promised to forget.
        await tx.calendarConnection.deleteMany({ where: { userId } });
        await tx.savedSearch.deleteMany({ where: { userId } });
        //     ADR-0011: notifications are addressed to the subject and nobody
        //     else, so they go outright, in every tenant.
        await tx.notification.deleteMany({ where: { userId } });

        //     The rest are the tenant's records, not the subject's. Erasure must
        //     not delete the tenant's opportunities, bug reports or audit trail,
        //     so those rows stay and only the link to the person is dropped —
        //     the same choice already made for `AiUsageLog` above and for the
        //     hashed subject reference in the erasure audit below.
        await tx.auditEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } });
        await tx.opportunity.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
        await tx.feedback.updateMany({ where: { userId }, data: { userId: null } });
        await tx.proposalUsage.updateMany({ where: { usedByUserId: userId }, data: { usedByUserId: null } });

        //     `Relationship.ownerUserId` is the same kind of row — the tenant's
        //     record, not the subject's — but it needed a migration first: it was
        //     NOT NULL until `relationship-owner-nullable.sql`. Detaching it is
        //     complete erasure for this table, because the only person named on a
        //     relationship apart from the focal point is the external counterpart
        //     (`counterpartName`/`counterpartEmail`), who is not the subject. The
        //     relationship stays and becomes unassigned.
        await tx.relationship.updateMany({ where: { ownerUserId: userId }, data: { ownerUserId: null } });

        //     Not handled here, and deliberately so: `DualApprovalStep.actorUserId`
        //     is retained. An approval is a signature and `@@unique([followupDocId,
        //     actorUserId])` enforces the four-eyes rule over it, so the row must
        //     outlive the user it names. That retention is declared by name — the
        //     id *and* `actorName` — in docs/legal/processing-register.md §12.
        //     Decided 2026-09-08 (A4, option C); the two columns were separate
        //     cases and got separate answers.
        //
        //     `Consent.userId` is retained for the same reason and on the same
        //     basis (TASK-MTSWLANXSU0IG). It is the eleventh FK-less `User.id`
        //     column and it is named here so that it is *decided* rather than
        //     merely unlisted: the row proves that this person was told what
        //     would be done with their data. Nulling the id would leave a record
        //     proving that somebody was told something, which proves nothing, and
        //     deleting it would destroy the controller's own art.5(2) evidence at
        //     the request of the one person it is evidence about. Declared in
        //     docs/legal/processing-register.md §18b and docs/DATA_MODEL.md §7.1.1.
        //     The row carries no network identifier, so retaining it does not
        //     retain an IP address — see the `Consent` model comment for why that
        //     column does not exist.
      });

      // 4. Finally the user row; cascades clear accounts, sessions,
      //    memberships and requested approvals, and null out approver/
      //    evaluation references.
      await prisma.user.delete({ where: { id: userId } });

      // 5. Record that the erasure happened. GDPR art.5(2) requires us to be
      //    able to demonstrate compliance, but the record must not re-create
      //    the identifier we just erased — so the subject is referenced by a
      //    one-way hash of their id. Anyone holding the original id can
      //    recompute the hash and confirm the deletion; the log on its own
      //    points at nobody.
      await writeErasureAudit(user);

      purgedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[users-scheduled-deletion] failed for user ${userId}:`, error);
      failedCount++;
      errors.push({ userId, message });
      failures.push({
        userId,
        kind: errorCode(error) ?? (error instanceof Error ? error.name : 'UnknownError'),
      });
    }
  }

  const output: UsersScheduledDeletionOutput = {
    success: true,
    dueCount: dueUsers.length,
    purgedCount,
    failedCount,
  };

  if (errors.length > 0) output.errors = errors;

  // A statutory erasure deadline that was missed must not be visible only as a
  // `console.error` and a number in a return value nobody reads. `recordAlert`
  // never throws, so a failure to raise the alarm cannot make the job worse
  // than it already is.
  if (failures.length > 0) {
    await recordAlert(buildPurgeFailureAlert(failures));
  }

  return UsersScheduledDeletionOutputSchema.parse(output);
}

interface PurgedUser {
  id: string;
  deletionRequestedAt: Date | string | null;
  deletionReason: string | null;
  memberships: Array<{ tenantId: string }>;
}

/** Writes one `user.erased` AuditEvent per tenant the subject belonged to. */
async function writeErasureAudit(user: PurgedUser): Promise<void> {
  const subjectRef = createHash('sha256').update(user.id).digest('hex');
  const data = {
    subjectRef,
    // Values crossing a step.run boundary are JSON, so this can arrive as a
    // string even though Prisma selected a Date. new Date() accepts both.
    requestedAt: user.deletionRequestedAt
      ? new Date(user.deletionRequestedAt).toISOString()
      : null,
    reason: user.deletionReason ?? 'subject_request',
  };

  const tenantIds = [...new Set(user.memberships.map((m) => m.tenantId))];

  // A subject with no tenant: the record belongs to no tenant, so it is written
  // through system scope. AuditEvent is under strict tenant_isolation
  // (TASK-MULUJ8O4JH1PF), which refuses a NULL tenantId from any tenant session
  // and hides it from every tenant — the erasure record is kept, not published.
  if (tenantIds.length === 0) {
    await withSystemScope('subject-scoped', 'erasure-sweep.erasureAudit', (tx) =>
      tx.auditEvent.create({
        data: { type: 'user.erased', target: subjectRef, data },
      })
    );
    return;
  }

  // The tenant is known here, so this is a scoped write, not a system-scoped
  // one. It matters: AuditEvent's tenant_isolation WITH CHECK REFUSES an insert
  // naming a tenantId outside that tenant's scope — under `fabrika_app` these
  // creates would throw rather than quietly do nothing.
  for (const tenantId of tenantIds) {
    await withTenant(tenantId, (tx) =>
      tx.auditEvent.create({
        data: { tenantId, type: 'user.erased', target: subjectRef, data },
      })
    );
  }
}

/**
 * Users Scheduled Deletion — daily, 3 AM UTC.
 *
 * Permanently removes accounts whose KVKK/GDPR erasure grace period has expired.
 * `requestAccountDeletion` only soft-deletes; this job is the single place where
 * the irreversible purge happens, so a subject can still cancel until it runs.
 */
export const usersScheduledDeletionTask = defineJob(
  'users-scheduled-deletion',
  async ({ payload }): Promise<UsersScheduledDeletionOutput> => {
    // A job added by hand may shorten the grace period (tests only); the cron never does.
    const { gracePeriodDays } = UsersScheduledDeletionEventSchema.parse(payload);
    return purgeDueUsers(gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS);
  }
);
