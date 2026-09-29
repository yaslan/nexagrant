import { v4 as uuidv4 } from 'uuid';
import { 
  S3Client, 
  DeleteObjectsCommand, 
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { errorMessage } from '@/lib/errors';
import { env } from '@/lib/env';

const s3 = process.env.R2_ACCOUNT_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
}) : null;

/**
 * The R2 bucket every object in this module is read from and written to, and
 * the value `Evidence.fileBucket` records. Exported because it is the single
 * source: a caller that hard-codes the name drifts away from `R2_BUCKET` the
 * moment the deployment sets it (TASK-MTV5ESBVAHUEV).
 *
 * The default is the historical bucket, deliberately unchanged — every stored
 * object lives under it, and renaming a bucket orphans its contents.
 */
export const EVIDENCE_BUCKET = env.R2_BUCKET || 'fonbridge-evidence';

/** Public origin serving R2 objects, trailing slash stripped; null when unset. */
const PUBLIC_HOST = env.R2_PUBLIC_HOST ? env.R2_PUBLIC_HOST.replace(/\/+$/, '') : null;

/**
 * The public URL of a stored object — the only place one is built.
 *
 * Returns `null` when `R2_PUBLIC_HOST` is unset, because with no configured
 * origin there is no URL that would work. A link is not invented to fill the
 * gap: the evidence row is then written with `fileUrl = null` and the UI simply
 * offers no download button, instead of handing the user an address that
 * resolves nowhere. The file is still identified by its object key.
 */
export function publicObjectUrl(objectKey: string): string | null {
  return PUBLIC_HOST ? `${PUBLIC_HOST}/${objectKey}` : null;
}

/**
 * Generates an R2 Object Key following the specification bucket path structure:
 * /{tenantId}/{organisationId}/{category}/{year}/{hash_filename}
 */
export function generateR2ObjectKey(
  tenantId: string,
  organisationId: string,
  category: string,
  fileName: string
): string {
  const cleanCategory = category.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const year = new Date().getFullYear();
  const fileExt = fileName.split('.').pop() || 'pdf';
  const cleanName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const hash = uuidv4().slice(0, 8);
  
  return `${tenantId}/${organisationId}/${cleanCategory}/${year}/${hash}_${cleanName}.${fileExt}`;
}

/**
 * Generates a Presigned PUT URL for direct browser-to-R2 file upload.
 * Valid for 15 minutes.
 */
export async function getPresignedUploadUrl(
  tenantId: string,
  organisationId: string,
  category: string,
  fileName: string,
  mimeType: string
): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string | null }> {
  const objectKey = generateR2ObjectKey(tenantId, organisationId, category, fileName);
  const publicUrl = publicObjectUrl(objectKey);

  if (!s3) {
    // Dev Mode Fallback: Simulated presigned URL
    console.log(`[R2 Storage (Dev Fallback)] Generated mock Presigned PUT URL for key: ${objectKey}`);
    return {
      uploadUrl: `/api/evidence/mock-upload?key=${encodeURIComponent(objectKey)}`,
      objectKey,
      publicUrl,
    };
  }

  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const command = new PutObjectCommand({
      Bucket: EVIDENCE_BUCKET,
      Key: objectKey,
      ContentType: mimeType,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    return { uploadUrl, objectKey, publicUrl };
  } catch {
    return {
      uploadUrl: `/api/evidence/mock-upload?key=${encodeURIComponent(objectKey)}`,
      objectKey,
      publicUrl,
    };
  }
}

/**
 * Generates a Presigned GET URL for secure downloading of evidence documents.
 * Valid for 1 hour.
 */
export async function getPresignedDownloadUrl(objectKey: string): Promise<string | null> {
  if (!s3) {
    return publicObjectUrl(objectKey);
  }

  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const command = new GetObjectCommand({
      Bucket: EVIDENCE_BUCKET,
      Key: objectKey,
    });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch {
    return publicObjectUrl(objectKey);
  }
}

/**
 * Uploads a File directly (Server-side helper).
 */
export async function uploadFileToR2(file: File, tenantId: string): Promise<string | null> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const ext = file.name.split('.').pop() || 'pdf';
  const key = `${tenantId}/org-default/general/${new Date().getFullYear()}/${uuidv4().slice(0, 8)}.${ext}`;
  return publicObjectUrl(key);
}

/**
 * Deletes a file from Cloudflare R2 by object key.
 */
export async function deleteFileFromR2(objectKeyOrUrl: string): Promise<boolean> {
  if (!s3) {
    console.log(`[R2 Storage (Dev Fallback)] Mock deleted object: ${objectKeyOrUrl}`);
    return true;
  }

  try {
    // Any absolute URL yields its path, whatever origin it carries: rows written
    // before R2_PUBLIC_HOST existed still name the retired storage domain, and a
    // replace() pinned to one host would leave those keys unstripped and delete
    // nothing.
    const key = objectKeyOrUrl.startsWith('http')
      ? new URL(objectKeyOrUrl).pathname.replace(/^\/+/, '')
      : objectKeyOrUrl;

    await s3.send(new DeleteObjectCommand({
      Bucket: EVIDENCE_BUCKET,
      Key: key,
    }));
    return true;
  } catch (err) {
    console.error(`[R2 Storage] Delete error: ${errorMessage(err)}`);
    return false;
  }
}

/**
 * Deletes all files associated with a specific user (GDPR hard delete)
 */
export async function deleteUserFilesFromR2(userId: string): Promise<void> {
  if (!s3) {
    console.warn('[R2 Cleanup] Storage not configured, skipping cleanup.');
    return;
  }

  try {
    const prefix = `users/${userId}/`;
    const listedObjects = await s3.send(new ListObjectsV2Command({
      Bucket: EVIDENCE_BUCKET,
      Prefix: prefix
    }));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    const deleteParams = {
      Bucket: EVIDENCE_BUCKET,
      Delete: {
        Objects: listedObjects.Contents.map((obj) => ({ Key: obj.Key }))
      }
    };

    await s3.send(new DeleteObjectsCommand(deleteParams));
    console.log(`[R2 Cleanup] Deleted ${listedObjects.Contents.length} objects for user ${userId}.`);
  } catch (error) {
    console.error(`[R2 Cleanup] Failed to delete files for user ${userId}:`, error);
  }
}

/**
 * Uploads raw bytes under an explicit object key. Unlike `uploadFileToR2`, this
 * really writes to R2 and reports whether it did — callers that must not claim
 * a stored file (beta feedback screenshots) need the truthful answer, and in a
 * dev environment with no R2 credentials the honest answer is `false`.
 */
export async function putObjectToR2(
  objectKey: string,
  data: Buffer,
  contentType: string
): Promise<{ stored: boolean; reason?: string }> {
  if (!s3) return { stored: false, reason: 'r2_not_configured' };

  try {
    await s3.send(new PutObjectCommand({
      Bucket: EVIDENCE_BUCKET,
      Key: objectKey,
      Body: data,
      ContentType: contentType,
    }));
    return { stored: true };
  } catch (err) {
    console.error(`[R2 Storage] Put error for ${objectKey}: ${errorMessage(err)}`);
    return { stored: false, reason: 'r2_put_failed' };
  }
}

/**
 * Local stand-in for R2 while developing (FB KAMU B4, TASK-MULRRNIHVZM1Z).
 * Only outside production: a production server without R2 refuses the write
 * instead of keeping a customer's file on an instance disk that is not backed
 * up and not shared between instances.
 */
const DEV_OBJECT_DIR = '.dev-objects';

/** Keys are built by our own code; this still refuses anything that could leave the directory. */
function devObjectPath(objectKey: string): string | null {
  if (env.NODE_ENV === 'production') return null;
  if (!/^[A-Za-z0-9_/.-]+$/.test(objectKey) || objectKey.split('/').some((p) => p === '' || p === '.' || p === '..')) {
    return null;
  }
  return `${process.cwd()}/${DEV_OBJECT_DIR}/${objectKey}`;
}

/**
 * Stores `bytes` under `objectKey`. Returns false when there is nowhere to put
 * them (no R2 in production) or the write failed — the caller must then not
 * record the key.
 */
export async function putObjectBytes(objectKey: string, bytes: Buffer, contentType: string): Promise<boolean> {
  if (s3) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey, Body: bytes, ContentType: contentType }));
      return true;
    } catch (err) {
      console.error(`[R2 Storage] Put error: ${errorMessage(err)}`);
      return false;
    }
  }
  const path = devObjectPath(objectKey);
  if (!path) return false;
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return true;
}

/** The stored bytes of `objectKey`, or null when absent or unreadable. */
export async function getObjectBytes(objectKey: string): Promise<Buffer | null> {
  if (s3) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey }));
      return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
    } catch {
      return null;
    }
  }
  const path = devObjectPath(objectKey);
  if (!path) return null;
  const { readFile } = await import('node:fs/promises');
  return readFile(path).catch(() => null);
}

/** Removes `objectKey`; true when it is gone (or never existed). */
export async function deleteObjectBytes(objectKey: string): Promise<boolean> {
  if (s3) return deleteFileFromR2(objectKey);
  const path = devObjectPath(objectKey);
  if (!path) return false;
  const { rm } = await import('node:fs/promises');
  await rm(path, { force: true });
  return true;
}
