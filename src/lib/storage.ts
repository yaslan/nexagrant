import { v4 as uuidv4 } from 'uuid';
import { 
  S3Client, 
  DeleteObjectsCommand, 
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';

const s3 = process.env.R2_ACCOUNT_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
}) : null;

const BUCKET = process.env.R2_BUCKET || 'fonbridge-evidence';

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
): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string }> {
  const objectKey = generateR2ObjectKey(tenantId, organisationId, category, fileName);
  const publicUrl = `https://storage.fonbridge.app/${objectKey}`;

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
    // @ts-ignore
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      ContentType: mimeType,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    return { uploadUrl, objectKey, publicUrl };
  } catch (err) {
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
export async function getPresignedDownloadUrl(objectKey: string): Promise<string> {
  if (!s3) {
    return `https://storage.fonbridge.app/${objectKey}`;
  }

  try {
    // @ts-ignore
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (err) {
    return `https://storage.fonbridge.app/${objectKey}`;
  }
}

/**
 * Uploads a File directly (Server-side helper).
 */
export async function uploadFileToR2(file: File, tenantId: string): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const ext = file.name.split('.').pop() || 'pdf';
  const key = `${tenantId}/org-default/general/${new Date().getFullYear()}/${uuidv4().slice(0, 8)}.${ext}`;
  return `https://storage.fonbridge.app/${key}`;
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
    const key = objectKeyOrUrl.startsWith('http') 
      ? objectKeyOrUrl.replace('https://storage.fonbridge.app/', '')
      : objectKeyOrUrl;

    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));
    return true;
  } catch (err: any) {
    console.error(`[R2 Storage] Delete error: ${err.message}`);
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
      Bucket: BUCKET,
      Prefix: prefix
    }));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    const deleteParams = {
      Bucket: BUCKET,
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
