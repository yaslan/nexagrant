import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { getPilotState, assertTenantWritable } from '@/lib/billing/pilot';
import { canAccessStatus } from '@/lib/modules/state-machine';
import type { ModuleStatus } from '@/lib/modules/types';
import { isPresentId } from '@/lib/required-id';
import { errorMessage } from '@/lib/errors';
import type { Mailer } from '@/lib/email/mailer';
import { dayStartUtc, isReminderDue, staleCutoff, STALE_AFTER_DAYS } from './stale';
import { renderStaleRelationshipsEmail, type StaleDigestSection } from '@/lib/email/stale-relationships-email';

/**
 * M4 "60 gün temassız" reminder (docs/MODULES.md M4 "Kabul: 60 gün kuralı cron
 * ile", TASK-MULQL2NYKRGJX).
 *
 * Once a day every focal point gets at most ONE e-mail listing the
 * relationships they own whose last contact is 60 or more days old, across
 * every tenant they belong to. A relationship is named once per stale period:
 * the row is stamped after the mail is accepted with the contact it named
 * (`staleRemindedContactAt`), and is due again only when `lastContactAt` holds
 * another value — any new or re-dated contact — that has gone 60 days stale.
 *
 * "At most one a day" survives a crash (İNCELEME-51 B-1): before a digest is
 * sent the user's day is claimed (`User.staleDigestOn`, compare-and-set), the
 * rows are stamped as soon as that one mail is accepted, and the claim is
 * given back only when the send is rejected. A worker killed between claim and
 * stamp costs that user one day's digest (the unstamped rows go out the next
 * morning); it never sends a second one the same day.
 *
 * The day is the USER's, not a tenant's, so the claim sits on the user row
 * (İNCELEME-69 D-1, m4-stale-digest-user-claim.sql): a second run that skips
 * the tenant the first one mailed from (pilot over, M4 closed, the tenant's
 * read failing, the member removed, the tenant deleted) still finds it, and
 * two runs over different tenants race for the same row, so exactly one of
 * them sends. On the day this release goes out, a claim the previous release
 * still wrote on a membership after the migration's backfill (its worker
 * ticked between the migration and the worker swap) holds too: see
 * `legacyClaims` (TASK-MUOADTEOQVL4Z, İNCELEME-95 B-1).
 *
 * Skipped, and counted:
 *   - a tenant whose free pilot has run out (read-only: nothing is stamped, so
 *     nothing is mailed either — the mail and the stamp go together);
 *   - a tenant whose plan does not include M4, or where M4 is not open to the
 *     recipient (`canAccessStatus` with the recipient's own role: ON for all,
 *     PILOT for managers, DEV for platform staff, OFF for nobody);
 *   - a relationship with no owner, a never-contacted one (`lastContactAt`
 *     NULL — the /relationships list does not call those stale either), an
 *     owner who left the tenant or whose account is erased or awaiting erasure.
 *
 * There is no notification-preference or unsubscribe model in the schema yet;
 * when one exists, it belongs in `recipientFor`.
 */

export { STALE_AFTER_DAYS, staleCutoff, isStaleRelationship, isReminderDue, dayStartUtc } from './stale';

/** AuditEvent type of one tenant's reminders. Counts only, never a name or an address. */
export const STALE_REMINDER_AUDIT = 'relationship.stale_reminded';

export const STALE_PAGE_SIZE = 500;

/** Rows stamped per transaction, so a first run over a long backlog stays inside the transaction timeout. */
export const STALE_STAMP_CHUNK = 200;

interface DueRow {
  id: string;
  name: string;
  lastContactAt: Date;
}

interface Recipient {
  userId: string;
  email: string;
  locale: string;
}

/** One tenant's contribution to the day's digests. */
interface TenantDue {
  tenantId: string;
  tenantName: string;
  workspaceSlug: string | null;
  byOwner: Map<string, { recipient: Recipient; rows: DueRow[] }>;
}

export interface StaleReminderResult {
  tenants: number;
  tenantsPilotExpired: number;
  tenantsModuleClosed: number;
  tenantsFailed: number;
  relationshipsDue: number;
  relationshipsReminded: number;
  skippedUnassigned: number;
  skippedNeverContacted: number;
  skippedAlreadyReminded: number;
  skippedRecipient: number;
  /** Owners left out because their digest for this (UTC) day was already claimed. */
  skippedMailedToday: number;
  digestsSent: number;
  digestsFailed: number;
  /** Set when there is no mail provider: nothing was sent and nothing stamped. */
  reason?: 'no_mail_provider';
  errors: Array<{ scope: 'tenant' | 'digest' | 'stamp'; reason: string }>;
  durationMs: number;
}

/** The recipient, or null when this owner must not be mailed about this tenant's M4 rows. */
async function recipientFor(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  m4Status: ModuleStatus
): Promise<Recipient | null> {
  const membership = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: {
      role: true,
      user: { select: { email: true, locale: true, isPlatformAdmin: true, deletedAt: true, deletionRequestedAt: true } },
    },
  });
  const user = membership?.user;
  if (!membership || !user || user.deletedAt || user.deletionRequestedAt || !user.email) return null;
  if (!canAccessStatus(m4Status, { role: membership.role, isPlatformAdmin: user.isPlatformAdmin }).allowed) return null;
  return { userId, email: user.email, locale: user.locale === 'en' ? 'en' : 'tr' };
}

/**
 * Adds to `into` the members of this tenant whose day the PREVIOUS release
 * claimed (`Membership.staleDigestOn`, today). m4-stale-digest-user-claim.sql
 * copies those claims onto the user row once; a claim that release's worker
 * writes after that — it ticked between the migration and the worker swap —
 * is only seen here, and without it the user gets a second digest that day
 * (İNCELEME-95 B-1, measured: 2 mails). Read in every tenant the run visits,
 * gated or not, since the old claim may sit on a tenant with nothing due now.
 * Goes with the column, in the file that drops it.
 */
async function legacyClaims(tx: TenantTx, tenantId: string, now: Date, into: Set<string>): Promise<void> {
  const rows = await tx.membership.findMany({
    where: { tenantId, staleDigestOn: { gte: dayStartUtc(now) } },
    select: { userId: true },
  });
  for (const r of rows) into.add(r.userId);
}

async function collectTenant(
  tenantId: string,
  now: Date,
  pageSize: number,
  runTenant: typeof withTenant,
  out: StaleReminderResult,
  legacy: Set<string>
): Promise<TenantDue | null> {
  const cutoff = staleCutoff(now);
  return runTenant(tenantId, async (tx) => {
    await legacyClaims(tx, tenantId, now, legacy);
    if ((await getPilotState(tenantId, tx, now)).kind === 'expired') {
      out.tenantsPilotExpired++;
      return null;
    }
    const entitlements = await getEntitlements(tenantId, tx);
    const state = await tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId: 'M4' } },
      select: { status: true },
    });
    const m4Status = (state?.status ?? 'OFF') as ModuleStatus;
    if (!entitlements.allowedModules.includes('M4') || m4Status === 'OFF') {
      out.tenantsModuleClosed++;
      return null;
    }

    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const workspace = await tx.workspace.findFirst({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { slug: true },
    });
    const due: TenantDue = { tenantId, tenantName: tenant?.name ?? '', workspaceSlug: workspace?.slug ?? null, byOwner: new Map() };
    const recipients = new Map<string, Recipient | null>();

    const [unassigned, neverContacted] = await Promise.all([
      tx.relationship.count({ where: { tenantId, ownerUserId: null, lastContactAt: { lte: cutoff } } }),
      tx.relationship.count({ where: { tenantId, ownerUserId: { not: null }, lastContactAt: null } }),
    ]);
    out.skippedUnassigned += unassigned;
    out.skippedNeverContacted += neverContacted;

    // Already reminded about this very contact: counted here, and left out of
    // the page query below so a tenant's daily scan grows with what is DUE,
    // not with every relationship it ever reminded about (İNCELEME-51 Y-1).
    const stale = { tenantId, ownerUserId: { not: null }, lastContactAt: { not: null, lte: cutoff } } as const;
    out.skippedAlreadyReminded += await tx.relationship.count({
      where: { ...stale, staleRemindedContactAt: { equals: tx.relationship.fields.lastContactAt } },
    });

    let cursor = '';
    for (;;) {
      const page = await tx.relationship.findMany({
        where: {
          ...stale,
          OR: [{ staleRemindedContactAt: null }, { NOT: { staleRemindedContactAt: { equals: tx.relationship.fields.lastContactAt } } }],
          id: { gt: cursor },
        },
        select: {
          id: true, ownerUserId: true, counterpartName: true, organizationId: true, partnerOrgId: true,
          lastContactAt: true, staleRemindedContactAt: true,
        },
        orderBy: { id: 'asc' },
        take: pageSize,
      });
      for (const r of page) {
        if (!isReminderDue(r, now)) {
          out.skippedAlreadyReminded++;
          continue;
        }
        const ownerId = r.ownerUserId as string;
        if (!recipients.has(ownerId)) recipients.set(ownerId, await recipientFor(tx, tenantId, ownerId, m4Status));
        const recipient = recipients.get(ownerId);
        if (!recipient) {
          out.skippedRecipient++;
          continue;
        }
        out.relationshipsDue++;
        const bucket = due.byOwner.get(ownerId) ?? { recipient, rows: [] };
        bucket.rows.push({
          id: r.id,
          name: r.counterpartName || r.organizationId || r.partnerOrgId || r.id,
          lastContactAt: r.lastContactAt as Date,
        });
        due.byOwner.set(ownerId, bucket);
      }
      if (page.length < pageSize) break;
      cursor = page[page.length - 1]!.id;
    }
    return due.byOwner.size > 0 ? due : null;
  });
}

/** `now`'s UTC day as the DATE literal the claim binds (text, so no session time zone can shift it). */
function utcDay(now: Date): string {
  return dayStartUtc(now).toISOString().slice(0, 10);
}

/**
 * Claims `userId`'s digest for `now`'s UTC day: one statement that reads the
 * row under a lock and writes it only if the day is not claimed yet, so of any
 * number of runs racing for the same user exactly one gets it, whatever
 * tenants each of them looked at. Returns the previous day (to give the claim
 * back if the send is rejected), or `false` when the day is already claimed or
 * the user is gone.
 *
 * Raw SQL on purpose: Prisma's `update` would also move `User.updatedAt`,
 * which the GDPR export hands to the data subject as their account's last change.
 */
async function claimDigest(userId: string, now: Date): Promise<{ previous: string | null } | false> {
  if (!isPresentId(userId)) return false;
  const today = utcDay(now);
  const rows = await prisma.$queryRaw<Array<{ previous: string | null }>>`
    UPDATE "User" u
       SET "staleDigestOn" = ${today}::date
      FROM (SELECT id, "staleDigestOn" AS prev FROM "User" WHERE id = ${userId} FOR UPDATE) o
     WHERE u.id = o.id
       AND (o.prev IS NULL OR o.prev < ${today}::date)
    RETURNING o.prev::text AS previous`;
  return rows.length === 1 ? { previous: rows[0]!.previous } : false;
}

/** Gives a claim back after a rejected send, so a later run the same day may try again. */
async function releaseDigest(userId: string, previous: string | null, now: Date): Promise<void> {
  if (!isPresentId(userId)) return;
  await prisma.$executeRaw`
    UPDATE "User" SET "staleDigestOn" = ${previous}::date
     WHERE id = ${userId} AND "staleDigestOn" = ${utcDay(now)}::date`;
}

/**
 * The owners, of `userIds`, whose day is already claimed: a second run on the
 * same day (a retry after a crash, a hand-added job) must not mail them again,
 * even about rows that went stale in between. Read before the claims only to
 * count them (and for the dry run); claimDigest decides.
 */
async function claimedToday(userIds: readonly string[], now: Date, pageSize: number): Promise<Set<string>> {
  const claimed = new Set<string>();
  const ids = userIds.filter(isPresentId);
  for (let i = 0; i < ids.length; i += pageSize) {
    const rows = await prisma.user.findMany({
      where: { id: { in: ids.slice(i, i + pageSize) }, staleDigestOn: { gte: dayStartUtc(now) } },
      select: { id: true },
    });
    for (const r of rows) claimed.add(r.id);
  }
  return claimed;
}

/**
 * Stamps the rows one accepted digest named in one tenant, each with the
 * contact it named. A row whose `lastContactAt` changed since it was read (a
 * contact logged meanwhile) is left alone: it is in a new period already. The
 * pilot check repeats here: a pilot that ended between the read and the send
 * leaves the rows as they were.
 */
async function stampRows(
  tenantId: string,
  rows: Array<{ id: string; lastContactAt: Date }>,
  now: Date,
  runTenant: typeof withTenant
): Promise<number> {
  if (!isPresentId(tenantId)) return 0;
  let stamped = 0;
  for (let i = 0; i < rows.length; i += STALE_STAMP_CHUNK) {
    const chunk = rows.slice(i, i + STALE_STAMP_CHUNK);
    stamped += await runTenant(tenantId, async (tx) => {
      await assertTenantWritable(tenantId, tx, now);
      let n = 0;
      for (const r of chunk) {
        if (!isPresentId(r.id)) continue;
        const { count } = await tx.relationship.updateMany({
          where: { tenantId, id: r.id, lastContactAt: r.lastContactAt },
          data: { staleRemindedAt: now, staleRemindedContactAt: r.lastContactAt },
        });
        n += count;
      }
      return n;
    });
  }
  return stamped;
}

/** One tenant's audit row for the run: counts only, never a name or an address. */
async function auditTenant(tenantId: string, relationships: number, recipients: number, runTenant: typeof withTenant): Promise<void> {
  if (!isPresentId(tenantId) || relationships === 0) return;
  await runTenant(tenantId, (tx) =>
    tx.auditEvent.create({
      data: { tenantId, type: STALE_REMINDER_AUDIT, data: { relationships, recipients, staleAfterDays: STALE_AFTER_DAYS } },
    })
  );
}

/**
 * The day's run. `mailer` null means "no mail provider": the due rows are
 * counted, nothing is sent and nothing is stamped, so the same rows go out on
 * the first run that can send.
 */
export async function sendStaleRelationshipReminders(options: {
  mailer: Mailer | null;
  appUrl: string;
  now?: Date;
  pageSize?: number;
  runTenant?: typeof withTenant;
  tenantIds?: readonly string[];
}): Promise<StaleReminderResult> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? STALE_PAGE_SIZE;
  const runTenant = options.runTenant ?? withTenant;
  const out: StaleReminderResult = {
    tenants: 0, tenantsPilotExpired: 0, tenantsModuleClosed: 0, tenantsFailed: 0,
    relationshipsDue: 0, relationshipsReminded: 0,
    skippedUnassigned: 0, skippedNeverContacted: 0, skippedAlreadyReminded: 0, skippedRecipient: 0, skippedMailedToday: 0,
    digestsSent: 0, digestsFailed: 0, errors: [], durationMs: 0,
  };

  // 1 — collect, tenant by tenant (the tenant list itself read in pages).
  const collected: TenantDue[] = [];
  const legacy = new Set<string>();
  let cursor = '';
  for (;;) {
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
        const due = await collectTenant(tenantId, now, pageSize, runTenant, out, legacy);
        if (due) collected.push(due);
      } catch (error) {
        out.tenantsFailed++;
        out.errors.push({ scope: 'tenant', reason: errorMessage(error) });
      }
    }
    if (tenants.length < pageSize) break;
    cursor = tenants[tenants.length - 1]!.id;
  }

  // 2 — one digest per user, across tenants.
  type Section = StaleDigestSection & { tenantId: string; due: Array<{ id: string; lastContactAt: Date }> };
  const byUser = new Map<string, { recipient: Recipient; sections: Section[] }>();
  const mailedToday = await claimedToday([...new Set(collected.flatMap((t) => [...t.byOwner.keys()]))], now, pageSize);
  for (const userId of legacy) mailedToday.add(userId);
  const mailedTodayDue = new Set<string>();
  for (const t of collected) {
    for (const [userId, { recipient, rows }] of t.byOwner) {
      if (mailedToday.has(userId)) {
        mailedTodayDue.add(userId);
        out.relationshipsDue -= rows.length;
        continue;
      }
      const entry = byUser.get(userId) ?? { recipient, sections: [] };
      rows.sort((a, b) => a.lastContactAt.getTime() - b.lastContactAt.getTime());
      entry.sections.push({
        tenantId: t.tenantId,
        tenantName: t.tenantName,
        link: t.workspaceSlug ? `${options.appUrl}/${recipient.locale}/${t.workspaceSlug}/relationships` : `${options.appUrl}/${recipient.locale}`,
        rows: rows.map((r) => ({ name: r.name, lastContactAt: r.lastContactAt })),
        due: rows.map((r) => ({ id: r.id, lastContactAt: r.lastContactAt })),
      });
      byUser.set(userId, entry);
    }
  }

  out.skippedMailedToday += mailedTodayDue.size;

  if (!options.mailer) {
    if (byUser.size > 0) out.reason = 'no_mail_provider';
    out.durationMs = Date.now() - started;
    return out;
  }

  // 3 — per user: claim the day, send, stamp what the accepted mail named.
  // Nothing is held back until the end of the run, so a run cut short leaves
  // every digest it sent claimed and stamped (İNCELEME-51 B-1).
  const auditByTenant = new Map<string, { relationships: number; recipients: number }>();
  for (const [userId, { recipient, sections }] of byUser) {
    let claim: { previous: string | null } | false;
    try {
      claim = await claimDigest(userId, now);
    } catch (error) {
      out.digestsFailed++;
      out.errors.push({ scope: 'digest', reason: errorMessage(error) });
      continue;
    }
    if (!claim) {
      // Another run claimed this user's day after this one read it, whichever
      // tenants it went through (İNCELEME-56 Y-1, İNCELEME-69 D-1).
      out.skippedMailedToday++;
      out.relationshipsDue -= sections.reduce((n, s) => n + s.due.length, 0);
      continue;
    }
    const { previous } = claim;
    const release = async () => {
      try {
        await releaseDigest(userId, previous, now);
      } catch (error) {
        // The claim stays: this user waits for tomorrow instead of risking a second mail.
        out.errors.push({ scope: 'digest', reason: errorMessage(error) });
      }
    };

    try {
      await options.mailer(renderStaleRelationshipsEmail({ to: recipient.email, locale: recipient.locale, now, sections }));
    } catch (error) {
      out.digestsFailed++;
      out.errors.push({ scope: 'digest', reason: errorMessage(error) });
      await release();
      continue;
    }
    out.digestsSent++;

    // Sent: from here on the claim is kept whatever happens, so this user gets
    // no second mail today. A failed stamp only means tomorrow names these rows again.
    for (const s of sections) {
      try {
        const n = await stampRows(s.tenantId, s.due, now, runTenant);
        out.relationshipsReminded += n;
        const acc = auditByTenant.get(s.tenantId) ?? { relationships: 0, recipients: 0 };
        acc.relationships += n;
        acc.recipients++;
        auditByTenant.set(s.tenantId, acc);
      } catch (error) {
        out.errors.push({ scope: 'stamp', reason: errorMessage(error) });
      }
    }
  }
  for (const [tenantId, { relationships, recipients }] of auditByTenant) {
    try {
      await auditTenant(tenantId, relationships, recipients, runTenant);
    } catch (error) {
      out.errors.push({ scope: 'stamp', reason: errorMessage(error) });
    }
  }

  out.durationMs = Date.now() - started;
  return out;
}
