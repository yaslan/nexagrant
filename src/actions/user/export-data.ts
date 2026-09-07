'use server';

import { prisma } from '@/lib/db';
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

    const [
      user,
      memberships,
      accounts,
      evaluations,
      efforts,
      aiUsage,
      approvals,
      opportunities,
    ] = await Promise.all([
        prisma.user.findUnique({
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
        prisma.membership.findMany({
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
        prisma.account.findMany({
          where: { userId },
          select: {
            provider: true,
            type: true,
            createdAt: true,
          },
        }),
        prisma.evaluation.findMany({ where: { userId } }),
        // Soft-deleted rows are excluded: they are pending erasure, so handing
        // them back in a portability file would resurrect data the subject or
        // the tenant already asked to remove.
        prisma.effort.findMany({ where: { userId, deletedAt: null } }),
        prisma.aiUsageLog.findMany({ where: { userId } }),
        prisma.approvalRequest.findMany({
          where: { OR: [{ requesterId: userId }, { approverId: userId }] },
        }),
        // Opportunities the subject personally owns, with the linked proposal.
        // Scoped by ownerId, never by tenantId: the rest of the tenant's
        // pipeline is not this subject's personal data.
        prisma.opportunity.findMany({
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
      ]);

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
