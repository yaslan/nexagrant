'use server';

import { prisma, withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { subjectRefOf } from '@/lib/legal/subject-ref';
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
  /**
   * A fixed code. The thrown value's text stays in the server log: a Prisma
   * error names tables and the query shape (İNCELEME-75 Y-1).
   */
  error?: 'Unauthorized' | 'export_failed';
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
      notifications,
      interregAnalyses,
      interregResults,
      interregMarks,
      internalApprovals,
      budgetShares,
      projectIdeas,
      decisions,
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
        // ADR-0011: the subject's notifications in every tenant. `payload`
        // holds ids and counts only; no other person is named in it.
        tx.notification.findMany({
          where: { userId },
          select: {
            id: true,
            tenantId: true,
            workspaceId: true,
            type: true,
            payload: true,
            createdAt: true,
            readAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        // M17 (FO-195, ADR-0010 Ek A 76-78): the subject's Interreg pre-assessments in
        // every tenant. The extracted document text is included while it is still held
        // (at most 30 days per slot, then the m17-text-retention job empties it); the
        // original files were never stored. The grid (InterregRubric) is platform data.
        tx.interregAnalysis.findMany({
          where: { userId },
          select: {
            id: true,
            tenantId: true,
            rubricId: true,
            status: true,
            callFileName: true,
            callFormat: true,
            callPages: true,
            callChars: true,
            callText: true,
            callExtractedAt: true,
            callTextExpiresAt: true,
            projectFileName: true,
            projectFormat: true,
            projectPages: true,
            projectChars: true,
            projectText: true,
            projectExtractedAt: true,
            projectTextExpiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        tx.interregAnalysisResult.findMany({
          where: { analysis: { userId } },
          select: {
            id: true,
            tenantId: true,
            analysisId: true,
            rawScore: true,
            score100: true,
            passesThresholds: true,
            knockouts: true,
            reportMarkdown: true,
            redFlags: true,
            improvements: true,
            rewriteSample: true,
            model: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        tx.interregCriterionMark.findMany({
          where: { analysis: { userId } },
          select: {
            id: true,
            tenantId: true,
            analysisId: true,
            criterionId: true,
            mark: true,
            strengths: true,
            weaknesses: true,
            evidenceQuote: true,
            evidenceLocator: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        // NG-34 (ADR-0010 Ek A 80-81): what ties these rows to the subject is the act of
        // approving or agreeing. The amounts are the tenant's figures, not personal data.
        tx.internalApproval.findMany({
          where: { approvedById: userId },
          select: { id: true, tenantId: true, opportunityId: true, approvedAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        tx.partnerBudgetShare.findMany({
          where: { agreedById: userId },
          select: { id: true, tenantId: true, seatId: true, agreedAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        // NG-38: the subject wrote the idea or took the decision. The idea's text and the
        // decision's reason are the institution's record, not personal data, as NG-34's amounts.
        tx.projectIdea.findMany({
          where: { createdById: userId },
          select: { id: true, tenantId: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        tx.decisionLog.findMany({
          where: { decidedById: userId },
          select: { id: true, tenantId: true, opportunityId: true, kind: true, decidedAt: true },
          orderBy: { decidedAt: 'asc' },
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
      Notification: notifications,
      InterregAnalysis: interregAnalyses,
      InterregAnalysisResult: interregResults,
      InterregCriterionMark: interregMarks,
      InternalApproval: internalApprovals,
      PartnerBudgetShare: budgetShares,
      ProjectIdea: projectIdeas,
      DecisionLog: decisions,
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
          tr: 'Evaluation kayıtları iç ön değerlendirmedir; resmî Komisyon değerlendirmesi yerine geçmez. InterregAnalysisResult ve InterregCriterionMark kayıtları da iç ön değerlendirmedir; hakem raporu ya da resmî skor değildir.',
          en: 'Evaluation records are an internal pre-assessment; they do not replace the official Commission evaluation. InterregAnalysisResult and InterregCriterionMark records are likewise an internal pre-assessment, not a referee report or an official score.',
        },
        tables,
      },
    };
  } catch (error) {
    console.error('[export-data]', error);
    return { success: false, error: 'export_failed' };
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
    const subjectRef = subjectRefOf(userId);
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
