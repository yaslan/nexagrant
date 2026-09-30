'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  getPresignedUploadUrl,
  deleteTenantObject,
  deleteObjectBytes,
  evidenceUploadType,
  finalKeyOfIncoming,
  copyIncomingObject,
  isFinalUploadRefusal,
  uploadFileToR2,
  tenantObjectKeyOf,
  EVIDENCE_BUCKET,
} from '@/lib/storage';
import { extractEvidenceMetadata } from '@/lib/evidence-ai';
import { calculateEvidenceHealthScore, HealthScoreResult, MinimalEvidenceItem } from '@/lib/evidence-health';
import { errorCode, errorMessage } from '@/lib/errors';
import { EVIDENCE_READ_ACTION, evidenceReadWhere } from '@/lib/evidence-access';
import { isPresentId } from '@/lib/required-id';
import type { EvidenceItemData } from './evidence-client';

/**
 * Retrieves all Evidence items for active tenant
 */
export async function getEvidenceItemsAction(categoryFilter?: string) {
  // Y-1 (TASK-MUNTTZ94LJWBC): the external partner has no `view_proposal` and
  // is refused; below `edit_proposal` only the open levels are listed.
  const { tenantId, role } = await requireTenantAction({ readOnly: true, can: EVIDENCE_READ_ACTION });
  const readable = evidenceReadWhere(role);
  if (!readable) return [];

  try {
    const whereClause: Record<string, unknown> = { tenantId, ...readable };
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
 * Generates Presigned PUT Upload URL for Cloudflare R2 direct browser upload.
 *
 * Only an allowed type within the size limit gets a URL, and that type and the
 * exact size are signed into it (B-1, TASK-MUNODY0DVDWC5): all three arguments
 * come from the browser, and the form's `accept` is not a server check.
 */
export async function getPresignedUploadUrlAction(
  category: string,
  fileName: string,
  mimeType: string,
  fileSizeBytes: number
) {
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });

  if (typeof fileName !== 'string' || typeof mimeType !== 'string') {
    return { success: false as const, error: 'unsupported_type' as const };
  }
  const allowed = evidenceUploadType(fileName, mimeType, fileSizeBytes);
  if (!allowed.ok) return { success: false as const, error: allowed.error };

  try {
    const { uploadUrl, objectKey } = await getPresignedUploadUrl(
      tenantId,
      'org-default',
      category || 'certificate',
      fileName,
      allowed.contentType,
      fileSizeBytes
    );
    return { success: true as const, uploadUrl, objectKey, contentType: allowed.contentType };
  } catch (error) {
    console.warn(`[getPresignedUploadUrlAction] presign error: ${errorMessage(error)}`);
    return { success: false as const, error: 'storage_unavailable' as const };
  }
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
  // file (Y-4, TASK-MUN80W2VFY56R). And only a staging key (D-1,
  // TASK-MUNTTZ94LJWBC): the row records the final key it is copied to, which
  // no signed PUT names, so the checked file cannot be replaced afterwards.
  const objectKey = tenantObjectKeyOf(tenantId, data?.objectKey);
  const finalKey = finalKeyOfIncoming(tenantId, data?.objectKey);
  if (!objectKey || objectKey !== data.objectKey || !finalKey) {
    return { success: false as const, error: 'invalid_object_key' as const };
  }

  // No reader runs over the file yet, so this reports nothing rather than guessing.
  const extracted = await extractEvidenceMetadata();

  // The user's date, or none. A document with no stated expiry does not get one.
  const finalValidUntil = data.validUntil ? new Date(data.validUntil) : null;

  // B-1 (TASK-MUO122UPRPJQH, İNCELEME-77): no store call runs inside a
  // transaction any more, and the staging object — the user's only copy until
  // the row exists — is removed last. The order is: already recorded? → check
  // and copy to the final key → save the row → remove the staging object. A
  // failure at any step before the last leaves the staging object and no row,
  // returns an error, and the same confirm can be sent again. This used to copy,
  // delete the staging object and check the copy inside the row's transaction;
  // a store slower than its 5 s ended the transaction, the copy was deleted as
  // well, and a "DB offline" branch reported success with a made-up id.

  // D-3 (TASK-MUNTTZ94LJWBC): a key already on a row is not copied again, so a
  // PUT to the staging key after confirm cannot reach the recorded file.
  let recorded: { id: string } | null;
  try {
    recorded = await withTenant(tenantId, (tx) =>
      tx.evidence.findFirst({ where: { tenantId, r2ObjectKey: finalKey }, select: { id: true } })
    );
  } catch (error) {
    console.warn(`[confirmEvidenceUploadAction] DB error: ${errorMessage(error)}`);
    return { success: false as const, error: 'save_failed' as const };
  }
  if (recorded) {
    await deleteObjectBytes(objectKey);
    return { success: false as const, error: 'already_confirmed' as const };
  }

  // What was stored, not what the browser says it stored (B-1/B-3,
  // TASK-MUNODY0DVDWC5): it must exist, be an allowed type of its key's
  // extension, within the limit, and begin with that format's bytes.
  const copied = await copyIncomingObject(objectKey, finalKey);
  if (!copied.ok) {
    // A file that is not acceptable stays unacceptable: it is removed. A store
    // that failed keeps the upload for the next try.
    if (isFinalUploadRefusal(copied.error)) await deleteObjectBytes(objectKey);
    return { success: false as const, error: copied.error };
  }

  let evidence;
  try {
    // (tenantId, r2ObjectKey) is unique: of two confirms running at once, the
    // second insert waits for the first and then fails with P2002.
    evidence = await withTenant(tenantId, (tx) =>
      tx.evidence.create({
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
          r2ObjectKey: finalKey,
          fileBucket: EVIDENCE_BUCKET,
          fileName: data.fileName,
          // What the store holds, never the browser's figures.
          fileSizeBytes: copied.size,
          mimeType: copied.contentType,
          // No public link (B-2): evidence is read through the authenticated
          // download route, never from a URL anyone holding it can open.
          fileUrl: null,
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
      })
    );
  } catch (error) {
    if (errorCode(error) === 'P2002') {
      // Confirmed by a confirm running alongside. The final object is that
      // row's file and stays; the staging object is done with.
      await deleteObjectBytes(objectKey);
      return { success: false as const, error: 'already_confirmed' as const };
    }
    // No success without a row. The staging object stays, so trying again
    // works; the copy under the final key is left too (D-3 of İNCELEME-77): a
    // concurrent confirm may have recorded it meanwhile, and the next try
    // writes the same checked bytes over it.
    console.warn(`[confirmEvidenceUploadAction] DB error: ${errorMessage(error)}`);
    return { success: false as const, error: 'save_failed' as const };
  }

  // No claim is created here. Uploading a file is not evidence for any statement,
  // and the rows this used to write ("independently audited", "fully compliant
  // with international standards", at confidence 0.95) were backed by nothing.
  // A claim is written when a person makes it and links it to this document.

  // The row holds the final key, so the staging object can go. If this delete
  // fails, a later confirm of the key reports already_confirmed and retries it.
  if (!(await deleteObjectBytes(objectKey))) {
    console.warn(`[confirmEvidenceUploadAction] staging object left behind: ${objectKey}`);
  }

  revalidatePath('/[locale]/(app)/[workspace]/evidence', 'page');
  return { success: true, evidence };
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

  let objectKey = null;
  let fileName = null;
  let fileSizeBytes = null;
  let mimeType = null;

  if (file && file.size > 0) {
    // Key built by the storage module from sanitised parts; the file name used to
    // go into it verbatim, `../` included (TASK-MUN80W2VFY56R).
    // Same type and size rules as the presigned path (B-1); a refused file is
    // not stored and the row gets no key.
    const stored = await uploadFileToR2(file, tenantId, category);
    objectKey = stored?.objectKey ?? null;
    fileName = file.name;
    fileSizeBytes = file.size;
    mimeType = stored?.contentType ?? null;
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
        // No public link (B-2, TASK-MUNODY0DVDWC5).
        fileUrl: null,
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
      fileUrl: null,
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
  const { tenantId, role } = await requireTenantAction({ readOnly: true });
  // The score names documents, so it is built from the rows the role may read.
  const readable = evidenceReadWhere(role);
  if (!readable) return calculateEvidenceHealthScore([]);

  try {
    const items = await withTenant<MinimalEvidenceItem[]>(tenantId, (tx) =>
      tx.evidence.findMany({
        where: { tenantId, ...readable },
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
