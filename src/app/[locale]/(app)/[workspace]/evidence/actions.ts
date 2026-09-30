'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  getPresignedUploadUrl,
  deleteTenantObject,
  uploadFileToR2,
  publicObjectUrl,
  tenantObjectKeyOf,
  EVIDENCE_BUCKET,
} from '@/lib/storage';
import { extractEvidenceMetadata } from '@/lib/evidence-ai';
import { calculateEvidenceHealthScore, HealthScoreResult, MinimalEvidenceItem } from '@/lib/evidence-health';
import { errorMessage } from '@/lib/errors';
import { isPresentId } from '@/lib/required-id';
import type { EvidenceItemData } from './evidence-client';

/**
 * Retrieves all Evidence items for active tenant
 */
export async function getEvidenceItemsAction(categoryFilter?: string) {
  const { tenantId } = await requireTenantAction({ readOnly: true });

  try {
    const whereClause: Record<string, unknown> = { tenantId };
    if (categoryFilter && categoryFilter !== 'ALL') {
      whereClause.category = categoryFilter;
    }

    const items = await withTenant(tenantId, (tx) =>
      tx.evidence.findMany({
        where: whereClause,
        include: {
          claimLinks: {
            include: {
              claim: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
    );

    return (items as unknown as EvidenceItemData[]) || [];
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
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });

  return getPresignedUploadUrl(
    tenantId,
    'org-default',
    category || 'certificate',
    fileName,
    mimeType
  );
}

/**
 * Confirms an evidence file upload and saves the DB record.
 *
 * Only what the user actually typed is stored. There is no OCR behind the upload, so
 * `extractEvidenceMetadata()` reports nothing (see src/lib/evidence-ai.ts) and the
 * issuing authority, document number and validity date stay empty until a human fills
 * them in. This used to be the opposite: an invented certificate was written to every
 * row and mirrored into `Claim` records, which CLAUDE.md §7 forbids.
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
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  // The key comes back from the browser. Only one under this tenant's own prefix
  // may be recorded: the row's key is what deleteEvidence later removes from the
  // store, so accepting another tenant's key let a member delete that tenant's
  // file (Y-4, TASK-MUN80W2VFY56R).
  const objectKey = tenantObjectKeyOf(tenantId, data?.objectKey);
  if (!objectKey || objectKey !== data.objectKey) {
    return { success: false as const, error: 'invalid_object_key' as const };
  }

  // Built by the storage module, not here: this line used to concatenate the
  // storage host itself, which put the same literal in two places and meant the
  // URL survived every change made in src/lib/storage.ts. `null` when no public
  // origin is configured — the row then carries no link rather than a dead one.
  const publicUrl = publicObjectUrl(objectKey);

  // No reader runs over the file yet, so this reports nothing rather than guessing.
  const extracted = await extractEvidenceMetadata();

  // The user's date, or none. A document with no stated expiry does not get one.
  const finalValidUntil = data.validUntil ? new Date(data.validUntil) : null;

  try {
    const evidence = await withTenant(tenantId, async (tx) => {
      const created = await tx.evidence.create({
      data: {
        tenantId,
        title: data.title || data.fileName.replace(/\.[^/.]+$/, ''),
        category: data.category || 'CAT-03',
        kind: data.kind || 'certificate',
        body: extracted.ocrSummary ?? '',
        description: `Uploaded document: ${data.fileName}`,
        language: data.language || 'tr',
        // Only the value the user entered. `extracted` has nothing to add.
        issuingAuthority: data.issuingAuthority || null,
        documentNumber: null,
        validUntil: finalValidUntil,
        confidentiality: data.confidentiality || 'INTERNAL',
        // An upload is not a verification. The row says so in the column built for it,
        // and the list badges it as unverified until someone actually checks it.
        status: 'UNVERIFIED',
        r2ObjectKey: objectKey,
        fileBucket: EVIDENCE_BUCKET,
        fileName: data.fileName,
        fileSizeBytes: data.fileSizeBytes,
        mimeType: data.mimeType,
        fileUrl: publicUrl,
        ocrText: extracted.ocrSummary,
        extractedFields: {
          // `extracted: false` is the record that nothing was read off the document,
          // so a later reader cannot mistake these blanks for a failed extraction.
          extracted: extracted.extracted,
          maskedPiiFound: extracted.maskedPiiFound,
        },
        tags: extracted.tags,
        createdBy: userId,
      },
      });

      // No claim is created here. Uploading a file is not evidence for any statement,
      // and the rows this used to write ("independently audited", "fully compliant
      // with international standards", at confidence 0.95) were backed by nothing.
      // A claim is written when a person makes it and links it to this document.

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
        body: extracted.ocrSummary ?? '',
        status: 'UNVERIFIED',
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
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

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
    // Key built by the storage module from sanitised parts; the file name used to
    // go into it verbatim, `../` included (TASK-MUN80W2VFY56R).
    const stored = await uploadFileToR2(file, tenantId, category);
    fileUrl = stored?.publicUrl ?? null;
    objectKey = stored?.objectKey ?? null;
    fileName = file.name;
    fileSizeBytes = file.size;
    mimeType = file.type;
  }

  const validUntil = validUntilRaw ? new Date(validUntilRaw) : null;
  // Same as the presigned path: nothing is read off the file, so nothing is invented.
  const extracted = await extractEvidenceMetadata();

  try {
    const rawEvidence = await withTenant(tenantId, (tx) =>
      tx.evidence.create({
      data: {
        tenantId,
        title: title || fileName || 'Kanıt Belgesi',
        kind,
        category,
        body: body || extracted.ocrSummary || '',
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
    const evidence = rawEvidence as unknown as EvidenceItemData;

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
      body: body || extracted.ocrSummary || '',
      validUntil,
      fileUrl,
      createdAt: new Date(),
    };
  }
}

/**
 * Deletes an Evidence Item and removes associated file from R2
 */
export async function deleteEvidence(evidenceId: string) {
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });
  // A server action's arguments come from the client, whatever the signature
  // says. Prisma drops an `undefined` key from `where`, so without this a call
  // with no id would find "any evidence" and then delete every row of the
  // tenant (TASK-MUMSUA77J1C6Q).
  if (!isPresentId(evidenceId)) return { success: false };

  let deleted = 0;
  try {
    // An evidence id is guessable, so the row is looked up *and* deleted by
    // (id, tenantId). `deleteMany` is deliberate: `delete({ where: { id } })`
    // would remove another tenant's document.
    deleted = await withTenant<number>(tenantId, async (tx) => {
      const ev = await tx.evidence.findFirst({ where: { id: evidenceId, tenantId } });
      if (!ev) return 0;

      // Only a key under this tenant's prefix is removed from the store; a row
      // that names anything else loses its row, not someone else's file.
      if (ev.r2ObjectKey || ev.fileUrl) {
        await deleteTenantObject(tenantId, ev.r2ObjectKey || ev.fileUrl!);
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
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(evidenceId)) return { success: false };

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
  const { tenantId } = await requireTenantAction({ readOnly: true });

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
