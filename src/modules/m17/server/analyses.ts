/**
 * M17 analysis storage (FO-186). Every query runs inside `withTenant` (RLS) and
 * is narrowed to the caller's own rows: an analysis is the uploader's, not the
 * tenant's — a colleague's call guide and draft are not listed or opened.
 *
 * Reads never return the extracted text: the UI needs file name, size and status;
 * the text is read only by the F2 analysis run, on the server.
 */
import type { InterregAnalysisStatus, Prisma } from '@prisma/client';

import { withTenant } from '@/lib/db';
import { lockTenantCredits, releaseAiReservation } from '@/lib/llm';
import { requireActionId } from '@/lib/required-id';

import { INTERREG_UPLOAD_LIMITS, type InterregDocKind } from '../limits';
import { EVALUATE_MODULE, runRef } from './evaluate';
import type { ExtractedDocument } from './extract';
import { acceptsUpload, STATUS_FROM_TEXTS_SQL } from './status';

/** Fixed label on every M17 payload: an internal pre-assessment, never an official score. */
export const INTERREG_ASSESSMENT_KIND = 'internal_pre_assessment' as const;

const VIEW_SELECT = {
  id: true,
  status: true,
  rubric: { select: { id: true, label: true, maxRaw: true, passRaw: true } },
  createdAt: true,
  updatedAt: true,
  callFileName: true,
  callFormat: true,
  callPages: true,
  callChars: true,
  callExtractedAt: true,
  callTextExpiresAt: true,
  projectFileName: true,
  projectFormat: true,
  projectPages: true,
  projectChars: true,
  projectExtractedAt: true,
  projectTextExpiresAt: true,
} satisfies Prisma.InterregAnalysisSelect;

type ViewRow = Prisma.InterregAnalysisGetPayload<{ select: typeof VIEW_SELECT }>;

export interface InterregDocumentView {
  fileName: string;
  format: string;
  pages: number | null;
  chars: number;
  extractedAt: string;
  /** This slot's text is purged at this instant: 30 days from ITS OWN upload (FO-195 B5). */
  expiresAt: string;
}

/** The grid an analysis is assessed against; the full grid is GET /api/interreg-review/rubrics. */
export interface InterregAnalysisRubricRef {
  id: string;
  label: string;
  maxRaw: number;
  passRaw: number | null;
}

export interface InterregAnalysisView {
  id: string;
  status: InterregAnalysisStatus;
  assessmentKind: typeof INTERREG_ASSESSMENT_KIND;
  rubric: InterregAnalysisRubricRef;
  call: InterregDocumentView | null;
  project: InterregDocumentView | null;
  createdAt: string;
  updatedAt: string;
}

function documentView(
  fileName: string | null,
  format: string | null,
  pages: number | null,
  chars: number | null,
  extractedAt: Date | null,
  expiresAt: Date | null,
): InterregDocumentView | null {
  if (!fileName || !format || chars === null || !extractedAt || !expiresAt) return null;
  return {
    fileName,
    format,
    pages,
    chars,
    extractedAt: extractedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export function toView(row: ViewRow): InterregAnalysisView {
  return {
    id: row.id,
    status: row.status,
    assessmentKind: INTERREG_ASSESSMENT_KIND,
    rubric: {
      id: row.rubric.id,
      label: row.rubric.label,
      maxRaw: Number(row.rubric.maxRaw),
      passRaw: row.rubric.passRaw === null ? null : Number(row.rubric.passRaw),
    },
    call: documentView(
      row.callFileName,
      row.callFormat,
      row.callPages,
      row.callChars,
      row.callExtractedAt,
      row.callTextExpiresAt,
    ),
    project: documentView(
      row.projectFileName,
      row.projectFormat,
      row.projectPages,
      row.projectChars,
      row.projectExtractedAt,
      row.projectTextExpiresAt,
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface Owner {
  tenantId: string;
  userId: string;
}

export type CreateAnalysisResult =
  | { ok: true; analysis: InterregAnalysisView }
  | { ok: false; error: 'bad_rubric' | 'rubric_unavailable' | 'too_many_analyses' };

/**
 * A new, empty analysis against `rubricId`, or against the default rubric when
 * none is named. An unknown id is `bad_rubric`; no rubric at all (the seed has
 * not run) is `rubric_unavailable` — never an analysis without a grid.
 */
export async function createAnalysis(owner: Owner, rubricId?: string): Promise<CreateAnalysisResult> {
  return withTenant(owner.tenantId, async (tx) => {
    const rubric = rubricId
      ? await tx.interregRubric.findUnique({ where: { id: rubricId }, select: { id: true } })
      : await tx.interregRubric.findFirst({
          where: { isDefault: true },
          orderBy: { id: 'asc' },
          select: { id: true },
        });
    if (!rubric) return { ok: false, error: rubricId ? 'bad_rubric' : 'rubric_unavailable' } as const;
    // Counted in the same transaction as the insert. Two creates racing can both pass
    // (read committed), so the cap can be overshot by the number of parallel requests;
    // it bounds storage, it is not an exact quota.
    const held = await tx.interregAnalysis.count({ where: { tenantId: owner.tenantId, userId: owner.userId } });
    if (held >= INTERREG_UPLOAD_LIMITS.maxAnalysesPerUser) return { ok: false, error: 'too_many_analyses' } as const;
    const row = await tx.interregAnalysis.create({
      data: { tenantId: owner.tenantId, userId: owner.userId, rubricId: rubric.id },
      select: VIEW_SELECT,
    });
    return { ok: true, analysis: toView(row) } as const;
  });
}

/** The caller's analyses, newest first. */
export async function listAnalyses(owner: Owner, take = 50): Promise<InterregAnalysisView[]> {
  const rows = await withTenant(owner.tenantId, (tx) =>
    tx.interregAnalysis.findMany({
      where: { tenantId: owner.tenantId, userId: owner.userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: VIEW_SELECT,
    }),
  );
  return rows.map(toView);
}

export async function getAnalysis(owner: Owner, id: string): Promise<InterregAnalysisView | null> {
  const row = await withTenant(owner.tenantId, (tx) =>
    tx.interregAnalysis.findFirst({ where: { id, tenantId: owner.tenantId, userId: owner.userId }, select: VIEW_SELECT }),
  );
  return row ? toView(row) : null;
}

/**
 * Deletes the analysis, its texts and any F2 output now (user's right to delete, FO-185 decision 3).
 *
 * A run still holding the claim (ANALYZING) has reserved its price (FO-274). Deleting the row
 * would leave that reservation with no run to release it, so it is given back here, under the
 * tenant lock, before the row goes (FO-291 B1).
 */
export async function deleteAnalysis(owner: Owner, analysisId: string): Promise<boolean> {
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');
  const { count } = await withTenant(tenantId, async (tx) => {
    await lockTenantCredits(tx, tenantId);
    const row = await tx.interregAnalysis.findFirst({
      where: { id, tenantId, userId },
      select: { status: true, updatedAt: true },
    });
    if (row?.status === 'ANALYZING') {
      await releaseAiReservation(tx, { tenantId, module: EVALUATE_MODULE, refId: runRef(id, row.updatedAt) });
    }
    return tx.interregAnalysis.deleteMany({ where: { id, tenantId, userId } });
  });
  return count > 0;
}

export type SaveDocumentResult =
  | { ok: true; analysis: InterregAnalysisView }
  | { ok: false; error: 'not_found' | 'analysis_busy' };

/**
 * Stores one extracted document in its slot and recomputes the status.
 *
 * The slot write refuses an ANALYZING row in its own WHERE, and the status is
 * recomputed by a second UPDATE that reads the row as it is after both slots'
 * writes (it waits for the row lock), so two uploads racing for the two slots
 * still end READY. A new document invalidates an earlier F2 result.
 */
export async function saveDocument(
  owner: Owner,
  analysisId: string,
  kind: InterregDocKind,
  fileName: string,
  doc: ExtractedDocument,
  now: Date = new Date(),
): Promise<SaveDocumentResult> {
  // Per slot (FO-195 B5): only the slot being written gets a new 30 days; the other keeps its own.
  const expiresAt = new Date(now.getTime() + INTERREG_UPLOAD_LIMITS.textRetentionDays * 24 * 60 * 60 * 1000);
  const fields =
    kind === 'call'
      ? {
          callFileName: fileName,
          callFormat: doc.format,
          callPages: doc.pages,
          callChars: doc.chars,
          callText: doc.text,
          callExtractedAt: now,
          callTextExpiresAt: expiresAt,
        }
      : {
          projectFileName: fileName,
          projectFormat: doc.format,
          projectPages: doc.pages,
          projectChars: doc.chars,
          projectText: doc.text,
          projectExtractedAt: now,
          projectTextExpiresAt: expiresAt,
        };
  const tenantId = requireActionId(owner.tenantId, 'tenantId');
  const userId = requireActionId(owner.userId, 'userId');
  const id = requireActionId(analysisId, 'analysisId');

  return withTenant(tenantId, async (tx) => {
    const where = { id, tenantId, userId };
    const { count } = await tx.interregAnalysis.updateMany({
      where: { id, tenantId, userId, status: { not: 'ANALYZING' } },
      data: fields,
    });
    if (count === 0) {
      const existing = await tx.interregAnalysis.findFirst({ where, select: { status: true } });
      if (!existing) return { ok: false, error: 'not_found' } as const;
      if (!acceptsUpload(existing.status)) return { ok: false, error: 'analysis_busy' } as const;
      return { ok: false, error: 'not_found' } as const;
    }

    // The one copy of the status rule (crw2 Ö1; ./status.ts), read on the row as it is
    // after both slots' writes.
    await tx.$executeRaw`
      UPDATE "InterregAnalysis"
         SET "status" = ${STATUS_FROM_TEXTS_SQL},
             "updatedAt" = ${now}
       WHERE "id" = ${id} AND "tenantId" = ${tenantId}`;
    await tx.interregCriterionMark.deleteMany({ where: { analysisId: id, tenantId } });
    await tx.interregAnalysisResult.deleteMany({ where: { analysisId: id, tenantId } });

    const row = await tx.interregAnalysis.findFirstOrThrow({ where, select: VIEW_SELECT });
    return { ok: true, analysis: toView(row) } as const;
  });
}
