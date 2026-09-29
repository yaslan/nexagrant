'use server';

import { createHash } from 'node:crypto';
import { prisma, withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { auth } from '@/lib/auth';

/**
 * KVKK md.11 / GDPR art.15 & art.20 — right of access and data portability.
 *
 * Collects every row that belongs to the signed-in subject and returns it as a
 * portable JSON document. Authentication secrets (OAuth tokens, session tokens)
 * are deliberately excluded: portability does not cover credentials, and writing
 * them to a file the user downloads would turn an export into a secret leak.
 */

export interface UserDataExport {
  timestamp: string;
  tenant: string;
  /** Carries the Evaluator Lens disclaimer out of the UI with the data. */
  notice: { tr: string; en: string };
  tables: Record<string, unknown[]>;
}

export interface ExportResult {
  success: boolean;
  data?: UserDataExport;
  error?: string;
}

export async function exportUserData(): Promise<ExportResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const tenantId = (session as unknown as { tenantId?: string } | null)?.tenantId;

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // GDPR Art. 15/20 is a question about a PERSON, not about a tenant: the
    // subject's rows are collected across every tenant they belong to, and a
    // single tenant scope would silently under-deliver the export. Under
    // `fabrika_app` the unscoped reads return nothing at all, which would hand
    // the subject an empty — and therefore wrong — portability file.
    //
    // One system scope around the whole batch rather than one per table: it is
    // a single transaction, so the export is a consistent snapshot, and the
    // gate counts one recorded escape instead of six.
    const [
      user,
      memberships,
      accounts,
      evaluations,
      efforts,
      aiUsage,
      approvals,
      opportunities,
    ] = await withSystemScope('subject-scoped', 'gdpr-export.subjectRows', (tx) =>
      Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            locale: true,
            emailVerified: true,
            isPlatformAdmin: true,
            createdAt: true,
            updatedAt: true,
            deletionRequestedAt: true,
            deletedAt: true,
            deletionReason: true,
          },
        }),
        tx.membership.findMany({
          where: { userId },
          select: {
            id: true,
            tenantId: true,
            role: true,
            workspaceIds: true,
            createdAt: true,
          },
        }),
        // Provider linkage only — refresh_token / access_token / id_token are secrets.
        tx.account.findMany({
          where: { userId },
          select: {
            provider: true,
            type: true,
            createdAt: true,
          },
        }),
        tx.evaluation.findMany({ where: { userId } }),
        // Soft-deleted rows are excluded: they are pending erasure, so handing
        // them back in a portability file would resurrect data the subject or
        // the tenant already asked to remove.
        tx.effort.findMany({ where: { userId, deletedAt: null } }),
        tx.aiUsageLog.findMany({ where: { userId } }),
        tx.approvalRequest.findMany({
          where: { OR: [{ requesterId: userId }, { approverId: userId }] },
        }),
        // Opportunities the subject personally owns, with the linked proposal.
        // Scoped by ownerId, never by tenantId: the rest of the tenant's
        // pipeline is not this subject's personal data.
        tx.opportunity.findMany({
          where: { ownerId: userId, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            workspaceId: true,
            title: true,
            stage: true,
            status: true,
            intendedRole: true,
            g0Score: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
            proposal: {
              select: {
                id: true,
                acronym: true,
                submittedAt: true,
                esrScores: true,
                outcome: true,
                deletedAt: true,
              },
            },
          },
        }),
      ])
    );

    // Split the nested proposal out so each table reads as its own list.
    const proposals = opportunities
      .map((o: { id: string; proposal: { deletedAt: Date | null } | null }) =>
        o.proposal && !o.proposal.deletedAt
          ? { opportunityId: o.id, ...o.proposal }
          : null
      )
      .filter((p: unknown): p is Record<string, unknown> => p !== null);

    const opportunityRows = opportunities.map((o: Record<string, unknown>) => {
      const row = { ...o };
      delete row.proposal;
      return row;
    });

    let tenantName = 'unknown';
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      if (tenant) tenantName = tenant.name;
    }

    const tables: Record<string, unknown[]> = {
      User: user ? [user] : [],
      Membership: memberships,
      Account: accounts,
      Evaluation: evaluations,
      Opportunity: opportunityRows,
      Proposal: proposals,
      Effort: efforts,
      AiUsageLog: aiUsage,
      ApprovalRequest: approvals,
    };

    await recordAccessAudit(userId, tenantId, tables);

    return {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        tenant: tenantName,
        // CLAUDE.md — the Evaluation rows below are Evaluator Lens output. The dump
        // leaves the product's UI behind, so it carries the disclaimer with it rather
        // than relying on a badge the reader can no longer see. Bilingual because the
        // file has no locale of its own.
        notice: {
          tr: 'Evaluation kayıtları iç ön değerlendirmedir; resmî Komisyon değerlendirmesi yerine geçmez.',
          en: 'Evaluation records are an internal pre-assessment; they do not replace the official Commission evaluation.',
        },
        tables,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export user data';
    console.error('[export-data]', message);
    return { success: false, error: message };
  }
}

/**
 * GDPR art.5(2) — the controller must be able to demonstrate that a subject
 * access request was answered. The purge job already writes `user.erased`; an
 * access request left no trace at all, so a completed export was impossible to
 * evidence after the fact.
 *
 * The subject is referenced by `sha256(userId)`, exactly as the erasure audit
 * does, and `actorId` is deliberately left unset: once the account is purged,
 * an audit row still holding the raw id would re-create the identifier the
 * erasure was supposed to remove. Anyone holding the original id can recompute
 * the hash and find the record.
 *
 * A failed audit write must never deny a data subject their access right, so
 * this is best-effort and only logged.
 */
async function recordAccessAudit(
  userId: string,
  tenantId: string | undefined,
  tables: Record<string, unknown[]>
): Promise<void> {
  try {
    const subjectRef = createHash('sha256').update(userId).digest('hex');
    // Row counts only — the audit trail records that the export happened, never
    // a second copy of the personal data it contained.
    const rowCounts = Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.length])
    );

    const data = { subjectRef, rowCounts };

    // AuditEvent is strict (TASK-MULUJ8O4JH1PF): a row for the session's tenant
    // is written in that tenant's scope; a tenant-less one belongs to no tenant
    // and goes through system scope, the only place it can be read back.
    if (tenantId) {
      await withTenant(tenantId, (tx) =>
        tx.auditEvent.create({
          data: { tenantId, type: 'user.data.exported', target: subjectRef, data },
        })
      );
      return;
    }
    await withSystemScope('subject-scoped', 'gdpr-export.accessAudit', (tx) =>
      tx.auditEvent.create({ data: { type: 'user.data.exported', target: subjectRef, data } })
    );
  } catch (error) {
    console.warn('[export-data] audit write failed:', error);
  }
}
