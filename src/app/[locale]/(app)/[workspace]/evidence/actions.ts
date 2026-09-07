'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import { 
  getPresignedUploadUrl, 
  deleteFileFromR2, 
  uploadFileToR2, 
  getPresignedDownloadUrl 
} from '@/lib/storage';
import { extractEvidenceMetadata } from '@/lib/evidence-ai';
import { calculateEvidenceHealthScore, HealthScoreResult, MinimalEvidenceItem } from '@/lib/evidence-health';
import { errorMessage } from '@/lib/errors';

/**
 * Retrieves all Evidence items for active tenant
 */
export async function getEvidenceItemsAction(categoryFilter?: string) {
  const { tenantId } = await requireTenantAction();

  try {
    const whereClause: any = { tenantId };
    if (categoryFilter && categoryFilter !== 'ALL') {
      whereClause.category = categoryFilter;
    }

    const items = await withTenant<any[]>(tenantId, (tx) =>
      tx.evidence.findMany({
        where: whereClause,
        include: {
          claimLinks: {
            include: {
              claim: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    );

    return items;
  } catch (error) {
    console.warn(`[getEvidenceItemsAction] DB error: ${errorMessage(error)}`);
    return [];
  }
}

/**
 * Generates Presigned PUT Upload URL for Cloudflare R2 direct browser upload
 */
export async function getPresignedUploadUrlAction(
  category: string,
  fileName: string,
  mimeType: string
) {
  const { tenantId } = await requireTenantAction();

  return getPresignedUploadUrl(
    tenantId,
    'org-default',
    category || 'certificate',
    fileName,
    mimeType
  );
}

/**
 * Confirms evidence file upload, triggers AI OCR metadata extraction, auto PII masking, and saves DB record.
 */
export async function confirmEvidenceUploadAction(data: {
  title: string;
  category: string;
  kind?: string;
  objectKey: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  validUntil?: string;
  issuingAuthority?: string;
  confidentiality?: string;
  language?: string;
}) {
  const { tenantId, userId } = await requireTenantAction();

  const publicUrl = `https://storage.fonbridge.app/${data.objectKey}`;

  // AI OCR Entity Extraction & Automatic PII Masking
  const extracted = await extractEvidenceMetadata(data.fileName, data.category);

  const finalValidUntil = data.validUntil 
    ? new Date(data.validUntil) 
    : (extracted.validUntil ? new Date(extracted.validUntil) : null);

  try {
    const evidence = await withTenant<any>(tenantId, async (tx) => {
      const created = await tx.evidence.create({
      data: {
        tenantId,
        title: data.title || data.fileName.replace(/\.[^/.]+$/, ''),
        category: data.category || 'CAT-03',
        kind: data.kind || 'certificate',
        body: extracted.ocrSummary,
        description: `Uploaded document: ${data.fileName}`,
        language: data.language || 'tr',
        issuingAuthority: data.issuingAuthority || extracted.issuingAuthority,
        documentNumber: extracted.documentNumber,
        validUntil: finalValidUntil,
        confidentiality: data.confidentiality || 'INTERNAL',
        status: 'VALID',
        r2ObjectKey: data.objectKey,
        fileBucket: 'fonbridge-evidence',
        fileName: data.fileName,
        fileSizeBytes: data.fileSizeBytes,
        mimeType: data.mimeType,
        fileUrl: publicUrl,
        ocrText: extracted.ocrSummary,
        extractedFields: {
          issuingAuthority: extracted.issuingAuthority,
          documentNumber: extracted.documentNumber,
          maskedPiiFound: extracted.maskedPiiFound,
        },
        tags: extracted.tags,
        createdBy: userId,
      },
      });

      // Auto-create suggested claims if present
      if (extracted.suggestedClaims && extracted.suggestedClaims.length > 0) {
        for (const claimItem of extracted.suggestedClaims) {
          const claim = await tx.claim.create({
            data: {
              tenantId,
              statement: claimItem.statementTr,
              statementEn: claimItem.statementEn,
              confidenceScore: 0.95,
              tags: extracted.tags,
            },
          });

          await tx.claimEvidenceLink.create({
            data: {
              claimId: claim.id,
              evidenceId: created.id,
              isPrimary: true,
            },
          });
        }
      }

      return created;
    });

    revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
    return { success: true, evidence };
  } catch (error) {
    console.warn(`[confirmEvidenceUploadAction] DB error: ${errorMessage(error)}`);
    // Mock return if DB offline
    return {
      success: true,
      evidence: {
        id: `ev-${Date.now()}`,
        tenantId,
        title: data.title,
        category: data.category,
        kind: 'certificate',
        body: extracted.ocrSummary,
        status: 'VALID',
        validUntil: finalValidUntil,
        fileUrl: publicUrl,
        createdAt: new Date(),
      },
    };
  }
}

/**
 * Traditional FormData upload fallback
 */
export async function createEvidence(formData: FormData) {
  const { tenantId, userId } = await requireTenantAction();

  const title = formData.get('title') as string;
  const kind = (formData.get('kind') as string) || 'certificate';
  const category = (formData.get('category') as string) || 'CAT-03';
  const body = (formData.get('body') as string) || '';
  const validUntilRaw = formData.get('validUntil') as string;
  const file = formData.get('file') as File | null;

  let fileUrl = null;
  let objectKey = null;
  let fileName = null;
  let fileSizeBytes = null;
  let mimeType = null;

  if (file && file.size > 0) {
    fileUrl = await uploadFileToR2(file, tenantId);
    fileName = file.name;
    fileSizeBytes = file.size;
    mimeType = file.type;
    objectKey = `${tenantId}/org-default/${category}/${new Date().getFullYear()}/${file.name}`;
  }

  const validUntil = validUntilRaw ? new Date(validUntilRaw) : null;
  const extracted = await extractEvidenceMetadata(title || fileName || 'Belge', category);

  try {
    const evidence = await withTenant<any>(tenantId, (tx) =>
      tx.evidence.create({
      data: {
        tenantId,
        title: title || fileName || 'Kanıt Belgesi',
        kind,
        category,
        body: body || extracted.ocrSummary,
        validUntil,
        r2ObjectKey: objectKey,
        fileName,
        fileSizeBytes,
        mimeType,
        fileUrl,
        ocrText: extracted.ocrSummary,
        tags: extracted.tags,
        createdBy: userId,
      },
      })
    );

    revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
    return evidence;
  } catch (err) {
    console.warn(`[createEvidence] DB fallback: ${errorMessage(err)}`);
    return {
      id: `ev-mock-${Date.now()}`,
      tenantId,
      title: title || 'Kanıt Belgesi',
      kind,
      category,
      body: body || extracted.ocrSummary,
      validUntil,
      fileUrl,
      createdAt: new Date(),
    } as any;
  }
}

/**
 * Deletes an Evidence Item and removes associated file from R2
 */
export async function deleteEvidence(evidenceId: string) {
  const { tenantId } = await requireTenantAction();

  let deleted = 0;
  try {
    // An evidence id is guessable, so the row is looked up *and* deleted by
    // (id, tenantId). `deleteMany` is deliberate: `delete({ where: { id } })`
    // would remove another tenant's document.
    deleted = await withTenant<number>(tenantId, async (tx) => {
      const ev = await tx.evidence.findFirst({ where: { id: evidenceId, tenantId } });
      if (!ev) return 0;

      if (ev.r2ObjectKey || ev.fileUrl) {
        await deleteFileFromR2(ev.r2ObjectKey || ev.fileUrl!);
      }

      const result = await tx.evidence.deleteMany({ where: { id: evidenceId, tenantId } });
      return result.count;
    });
  } catch (error) {
    console.warn(`[deleteEvidence] DB error: ${errorMessage(error)}`);
    return { success: false };
  }

  revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
  return { success: deleted > 0 };
}

/**
 * Updates verification status of an Evidence Item
 */
export async function verifyEvidenceAction(evidenceId: string, status: string) {
  const { tenantId } = await requireTenantAction();

  let updated = 0;
  try {
    // `updateMany` so the tenant id is part of the WHERE clause; `update` only
    // accepts a unique selector and would flip another tenant's row.
    updated = await withTenant<number>(tenantId, async (tx) => {
      const result = await tx.evidence.updateMany({
        where: { id: evidenceId, tenantId },
        data: { status },
      });
      return result.count;
    });
  } catch (error) {
    console.warn(`[verifyEvidenceAction] DB error: ${errorMessage(error)}`);
    return { success: false };
  }

  revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
  return { success: updated > 0 };
}

/**
 * Generates Evidence Pack Health Score (0-100) for tenant
 */
export async function getHealthScoreAction(): Promise<HealthScoreResult> {
  const { tenantId } = await requireTenantAction();

  try {
    const items = await withTenant<MinimalEvidenceItem[]>(tenantId, (tx) =>
      tx.evidence.findMany({
        where: { tenantId },
        select: {
          id: true,
          kind: true,
          category: true,
          status: true,
          validUntil: true,
          title: true,
        },
      })
    );

    return calculateEvidenceHealthScore(items);
  } catch (error) {
    // CLAUDE.md §7: a score shown to the user is derived from real Evidence rows
    // or not shown at all. The previous fallback invented three documents, so a
    // tenant with an empty pack saw a healthy score during a DB outage.
    console.warn(`[getHealthScoreAction] DB error: ${errorMessage(error)}`);
    return calculateEvidenceHealthScore([]);
  }
}
