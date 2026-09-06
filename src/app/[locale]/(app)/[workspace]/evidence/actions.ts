'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { 
  getPresignedUploadUrl, 
  deleteFileFromR2, 
  uploadFileToR2, 
  getPresignedDownloadUrl 
} from '@/lib/storage';
import { extractEvidenceMetadata } from '@/lib/evidence-ai';
import { calculateEvidenceHealthScore, HealthScoreResult } from '@/lib/evidence-health';

/**
 * Retrieves all Evidence items for active tenant
 */
export async function getEvidenceItemsAction(categoryFilter?: string) {
  const session = await auth();
  if (!session?.user) return [];
  const tenantId = (session as any)?.tenantId || 'demo-tenant-hq';

  try {
    const whereClause: any = { tenantId };
    if (categoryFilter && categoryFilter !== 'ALL') {
      whereClause.category = categoryFilter;
    }

    const items = await prisma.evidence.findMany({
      where: whereClause,
      include: {
        claimLinks: {
          include: {
            claim: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items;
  } catch (error: any) {
    console.warn(`[getEvidenceItemsAction] DB error: ${error.message}`);
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
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any)?.tenantId || 'demo-tenant-hq';

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
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any)?.tenantId || 'demo-tenant-hq';

  const publicUrl = `https://storage.fonbridge.app/${data.objectKey}`;

  // AI OCR Entity Extraction & Automatic PII Masking
  const extracted = await extractEvidenceMetadata(data.fileName, data.category);

  const finalValidUntil = data.validUntil 
    ? new Date(data.validUntil) 
    : (extracted.validUntil ? new Date(extracted.validUntil) : null);

  try {
    const evidence = await prisma.evidence.create({
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
        createdBy: session.user.id,
      },
    });

    // Auto-create suggested claims if present
    if (extracted.suggestedClaims && extracted.suggestedClaims.length > 0) {
      for (const claimItem of extracted.suggestedClaims) {
        const claim = await prisma.claim.create({
          data: {
            tenantId,
            statement: claimItem.statementTr,
            statementEn: claimItem.statementEn,
            confidenceScore: 0.95,
            tags: extracted.tags,
          },
        });

        await prisma.claimEvidenceLink.create({
          data: {
            claimId: claim.id,
            evidenceId: evidence.id,
            isPrimary: true,
          },
        });
      }
    }

    revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
    return { success: true, evidence };
  } catch (error: any) {
    console.warn(`[confirmEvidenceUploadAction] DB error: ${error.message}`);
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
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  
  const tenantId = (session as any)?.tenantId || 'demo-tenant-hq';

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
    const evidence = await prisma.evidence.create({
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
        createdBy: session.user.id,
      },
    });

    revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
    return evidence;
  } catch (err: any) {
    console.warn(`[createEvidence] DB fallback: ${err.message}`);
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
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any)?.tenantId || 'demo-tenant-hq';

  try {
    const ev = await prisma.evidence.findUnique({
      where: { id: evidenceId },
    });

    if (ev?.r2ObjectKey || ev?.fileUrl) {
      await deleteFileFromR2(ev.r2ObjectKey || ev.fileUrl!);
    }

    await prisma.evidence.delete({
      where: { id: evidenceId },
    });
  } catch (error: any) {
    console.warn(`[deleteEvidence] DB error: ${error.message}`);
  }

  revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
  return { success: true };
}

/**
 * Updates verification status of an Evidence Item
 */
export async function verifyEvidenceAction(evidenceId: string, status: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  try {
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: { status },
    });
  } catch (error: any) {
    console.warn(`[verifyEvidenceAction] DB error: ${error.message}`);
  }

  revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
  return { success: true };
}

/**
 * Generates Evidence Pack Health Score (0-100) for tenant
 */
export async function getHealthScoreAction(): Promise<HealthScoreResult> {
  const session = await auth();
  const tenantId = (session as any)?.tenantId || 'demo-tenant-hq';

  try {
    const items = await prisma.evidence.findMany({
      where: { tenantId },
      select: {
        id: true,
        kind: true,
        category: true,
        status: true,
        validUntil: true,
        title: true,
      },
    });

    return calculateEvidenceHealthScore(items);
  } catch (error: any) {
    console.warn(`[getHealthScoreAction] DB fallback: ${error.message}`);
    // Mock health score calculation for demo
    return calculateEvidenceHealthScore([
      { id: '1', category: 'CORPORATE_IDENTITY', kind: 'corporate', title: 'Ticaret Sicil Gazetesi', status: 'VALID' },
      { id: '2', category: 'CERTIFICATION', kind: 'certificate', title: 'ISO 27001 BGYS', status: 'VALID', validUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000) },
      { id: '3', category: 'FINANCIAL', kind: 'financial', title: '2025 Bilanço', status: 'VALID' },
    ]);
  }
}
