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
 * the row is stamped (`staleRemindedAt`) after the mail is accepted, and is due
 * again only when a newer contact (`lastContactAt` > `staleRemindedAt`) has
 * itself gone 60 days stale.
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
  /** Owners left out because a digest already went to them earlier this (UTC) day. */
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

async function collectTenant(
  tenantId: string,
  now: Date,
  pageSize: number,
  runTenant: typeof withTenant,
  out: StaleReminderResult,
  mailedToday: Set<string>
): Promise<TenantDue | null> {
  const cutoff = staleCutoff(now);
  return runTenant(tenantId, async (tx) => {
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
    // Owners this tenant already stamped today: a second run on the same day
    // (a retry, a hand-added job) must not send them a second digest for rows
    // that went stale in between. Collected in every tenant, applied per user
    // across tenants below.
    const stampedToday = await tx.relationship.findMany({
      where: { tenantId, ownerUserId: { not: null }, staleRemindedAt: { gte: dayStartUtc(now) } },
      select: { ownerUserId: true },
      distinct: ['ownerUserId'],
    });
    for (const s of stampedToday) if (s.ownerUserId) mailedToday.add(s.ownerUserId);
    out.skippedUnassigned += unassigned;
    out.skippedNeverContacted += neverContacted;

    let cursor = '';
    for (;;) {
      const page = await tx.relationship.findMany({
        where: { tenantId, ownerUserId: { not: null }, lastContactAt: { not: null, lte: cutoff }, id: { gt: cursor } },
        select: {
          id: true, ownerUserId: true, counterpartName: true, organizationId: true, partnerOrgId: true,
          lastContactAt: true, staleRemindedAt: true,
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

/**
 * Stamps the rows a digest named, in their tenant, and records the count. The
 * pilot check repeats here: a pilot that ended between the read and the send
 * leaves the rows as they were.
 */
async function stampTenant(
  tenantId: string,
  ids: string[],
  recipients: number,
  now: Date,
  runTenant: typeof withTenant
): Promise<number> {
  if (!isPresentId(tenantId) || ids.length === 0) return 0;
  return runTenant(tenantId, async (tx) => {
    await assertTenantWritable(tenantId, tx, now);
    const { count } = await tx.relationship.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { staleRemindedAt: now },
    });
    if (count > 0) {
      await tx.auditEvent.create({
        data: { tenantId, type: STALE_REMINDER_AUDIT, data: { relationships: count, recipients, staleAfterDays: STALE_AFTER_DAYS } },
      });
    }
    return count;
  });
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
  const mailedToday = new Set<string>();
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
        const due = await collectTenant(tenantId, now, pageSize, runTenant, out, mailedToday);
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
  const byUser = new Map<string, { recipient: Recipient; sections: Array<StaleDigestSection & { tenantId: string; ids: string[] }> }>();
  for (const t of collected) {
    for (const [userId, { recipient, rows }] of t.byOwner) {
      if (mailedToday.has(userId)) {
        out.skippedMailedToday++;
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
        ids: rows.map((r) => r.id),
      });
      byUser.set(userId, entry);
    }
  }

  if (!options.mailer) {
    if (byUser.size > 0) out.reason = 'no_mail_provider';
    out.durationMs = Date.now() - started;
    return out;
  }

  // 3 — send, then stamp what the accepted mail named. A rejected send stamps
  // nothing, so tomorrow's run names the same rows.
  const stampByTenant = new Map<string, { ids: string[]; recipients: number }>();
  for (const { recipient, sections } of byUser.values()) {
    try {
      await options.mailer(renderStaleRelationshipsEmail({ to: recipient.email, locale: recipient.locale, now, sections }));
      out.digestsSent++;
      for (const s of sections) {
        const acc = stampByTenant.get(s.tenantId) ?? { ids: [], recipients: 0 };
        acc.ids.push(...s.ids);
        acc.recipients++;
        stampByTenant.set(s.tenantId, acc);
      }
    } catch (error) {
      out.digestsFailed++;
      out.errors.push({ scope: 'digest', reason: errorMessage(error) });
    }
  }
  for (const [tenantId, { ids, recipients }] of stampByTenant) {
    try {
      out.relationshipsReminded += await stampTenant(tenantId, ids, recipients, now, runTenant);
    } catch (error) {
      out.errors.push({ scope: 'stamp', reason: errorMessage(error) });
    }
  }

  out.durationMs = Date.now() - started;
  return out;
}
