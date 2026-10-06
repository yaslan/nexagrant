import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { EXPIRING_SOON_DAYS, VERIFIED_STATUSES, evidenceBadge } from '@/lib/evidence-status';
import { evidenceExpiringDedupeKey, recordNotification } from '@/lib/notifications/store';

/**
 * "Your document is about to expire" notifications (ADR-0011 §2.2, TASK-MUVR7HQQZVA2Z).
 *
 * Decisions K-4956 = B, K-4958 = A, K-4959 = A:
 *   - Recipient: the uploader (`Evidence.createdBy`, written by evidence/actions.ts
 *     on upload). When that is 'system' (seeded or legacy rows), or the uploader is
 *     no longer a member or their account is erased or awaiting erasure, every
 *     TENANT_OWNER of the tenant gets it instead, so no expiring document goes
 *     unannounced.
 *   - Rule: exactly the badge's. A document is announced only when
 *     `evidenceBadge` says EXPIRING_SOON — verified, and within
 *     EXPIRING_SOON_DAYS. The query below only narrows the scan; the badge
 *     function decides, so the bell cannot say "expiring" while the list says
 *     "unverified".
 *   - `EvidenceReminder` is not used: the notification's `dedupeKey` is the only
 *     state. One notification per (document, validUntil): a second run writes
 *     nothing, a renewed document (new `validUntil`) is announced again.
 *
 * The payload is ids and the date only (ADR-0011 §3.1); the document title is
 * user text and stays out of the store.
 */

export const EVIDENCE_EXPIRING_PAGE_SIZE = 500;

const DAY_MS = 24 * 3600 * 1000;

export interface EvidenceExpiringResult {
  tenants: number;
  tenantsFailed: number;
  /** Documents the badge calls EXPIRING_SOON in this run. */
  documentsDue: number;
  /** Rows written; a recipient already told about this document and date writes none. */
  notificationsWritten: number;
  /** Already notified (same dedupeKey) — the second run of a day lands here. */
  notificationsSkipped: number;
  /** Documents with neither a usable uploader nor any tenant owner. */
  documentsWithoutRecipient: number;
  errors: Array<{ scope: 'tenant'; reason: string }>;
}

type TenantCounts = Pick<
  EvidenceExpiringResult,
  'documentsDue' | 'notificationsWritten' | 'notificationsSkipped' | 'documentsWithoutRecipient'
>;

type TenantRunner = <T>(tenantId: string, callback: (tx: TenantTx) => Promise<T>) => Promise<T>;

/** Of `userIds`, the members of this tenant whose account is still live. */
async function liveMemberIds(tx: TenantTx, tenantId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await tx.membership.findMany({
    where: { tenantId, userId: { in: userIds }, user: { deletedAt: null, deletionRequestedAt: null } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

async function tenantOwnerIds(tx: TenantTx, tenantId: string): Promise<string[]> {
  const rows = await tx.membership.findMany({
    where: { tenantId, role: 'TENANT_OWNER', user: { deletedAt: null, deletionRequestedAt: null } },
    select: { userId: true },
    orderBy: { userId: 'asc' },
  });
  return rows.map((r) => r.userId);
}

async function notifyTenant(
  tx: TenantTx,
  tenantId: string,
  now: Date,
  pageSize: number
): Promise<TenantCounts> {
  const out: TenantCounts = { documentsDue: 0, notificationsWritten: 0, notificationsSkipped: 0, documentsWithoutRecipient: 0 };
  const horizon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
  let owners: string[] | null = null;
  let cursor = '';
  for (;;) {
    const page = await tx.evidence.findMany({
      where: {
        tenantId,
        status: { in: [...VERIFIED_STATUSES] },
        validUntil: { gt: now, lte: horizon },
        id: { gt: cursor },
      },
      select: { id: true, status: true, validUntil: true, createdBy: true },
      orderBy: { id: 'asc' },
      take: pageSize,
    });
    const due = page.filter((e) => evidenceBadge(e, now).kind === 'EXPIRING_SOON');
    const members = await liveMemberIds(tx, tenantId, [...new Set(due.map((e) => e.createdBy))]);

    for (const e of due) {
      out.documentsDue++;
      let recipients: string[];
      if (members.has(e.createdBy)) {
        recipients = [e.createdBy];
      } else {
        owners ??= await tenantOwnerIds(tx, tenantId);
        recipients = owners;
      }
      if (recipients.length === 0) {
        out.documentsWithoutRecipient++;
        continue;
      }
      const validUntil = e.validUntil as Date;
      for (const userId of recipients) {
        const wrote = await recordNotification(tx, {
          tenantId,
          userId,
          type: 'EVIDENCE_EXPIRING',
          payload: { evidenceId: e.id, validUntil: validUntil.toISOString() },
          dedupeKey: evidenceExpiringDedupeKey(e.id, validUntil),
        });
        if (wrote) out.notificationsWritten++;
        else out.notificationsSkipped++;
      }
    }
    if (page.length < pageSize) break;
    cursor = page[page.length - 1]!.id;
  }
  return out;
}

/**
 * The day's run over every live tenant (or `tenantIds`). One tenant failing is
 * counted and reported; it does not stop the others.
 */
export async function notifyExpiringEvidence(options: {
  now?: Date;
  pageSize?: number;
  runTenant?: TenantRunner;
  tenantIds?: readonly string[];
} = {}): Promise<EvidenceExpiringResult> {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? EVIDENCE_EXPIRING_PAGE_SIZE;
  const runTenant: TenantRunner = options.runTenant ?? ((id, cb) => withTenant(id, cb));
  const out: EvidenceExpiringResult = {
    tenants: 0, tenantsFailed: 0, documentsDue: 0, notificationsWritten: 0,
    notificationsSkipped: 0, documentsWithoutRecipient: 0, errors: [],
  };

  // `Tenant` carries no tenant_isolation policy (prisma/rls.sql), so the list is
  // readable here; every row read after it goes through the tenant's own scope.
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
        // Counted only after the transaction commits: a tenant that fails half-way
        // has its writes rolled back and must not report them as written.
        const c = await runTenant(tenantId, (tx) => notifyTenant(tx, tenantId, now, pageSize));
        out.documentsDue += c.documentsDue;
        out.notificationsWritten += c.notificationsWritten;
        out.notificationsSkipped += c.notificationsSkipped;
        out.documentsWithoutRecipient += c.documentsWithoutRecipient;
      } catch (error) {
        out.tenantsFailed++;
        out.errors.push({ scope: 'tenant', reason: errorMessage(error) });
      }
    }
    if (tenants.length < pageSize) break;
    cursor = tenants[tenants.length - 1]!.id;
  }
  return out;
}
