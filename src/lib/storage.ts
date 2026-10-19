import { v4 as uuidv4 } from 'uuid';
import { 
  S3Client, 
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
} from '@aws-sdk/client-s3';
import { errorMessage } from '@/lib/errors';
import { env } from '@/lib/env';

// R2_ENDPOINT points the client at another S3-compatible store (a MinIO
// container in the live tests); unset, the account's R2 endpoint is used.
// Checksums only when an operation requires one (B-3, TASK-MUNODY0DVDWC5): the
// SDK default puts the CRC32 of the *empty* body into a presigned PUT URL
// (`x-amz-checksum-crc32=AAAAAA==`), which a store that checks it refuses for
// any real file.
// R2_REGION: R2 ignores the region ('auto'); another S3-compatible store
// (Supabase Storage) signs with its project's region and refuses any other.
const s3 = process.env.R2_ACCOUNT_ID ? new S3Client({
  region: process.env.R2_REGION?.trim() || 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: Boolean(process.env.R2_ENDPOINT),
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
}) : null;

/** Whether uploads go to a real object store; false means the local dev stand-in. */
export const hasObjectStore = s3 !== null;

/**
 * True when this is a production server with no object store configured.
 *
 * The dev stand-in (`/api/evidence/mock-upload`, `.dev-objects`) does not exist
 * in production — the route answers 404 there — so a production deployment
 * without R2 has nowhere to put an upload. It used to be handed the dev URL
 * anyway, and the user saw a bare "HTTP 404" (TASK-MUSFO7ELD7WYF). A function,
 * not a constant, so a test can vary NODE_ENV.
 */
export function objectStoreMissingInProduction(
  source: { NODE_ENV?: string } = env,
  objectStore: boolean = hasObjectStore
): boolean {
  return !objectStore && source.NODE_ENV === 'production';
}

/** `getPresignedUploadUrl` was asked for a URL that production cannot serve. */
export class ObjectStoreUnconfiguredError extends Error {
  readonly code = 'object_store_unconfigured';
  constructor() {
    super('No object store is configured (R2_ACCOUNT_ID is unset) and the dev upload stand-in does not exist in production');
    this.name = 'ObjectStoreUnconfiguredError';
  }
}

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
  // The extension is the client's text too: unfiltered, `a./x/y` made it `/x/y`
  // and added path segments to the key (TASK-MUN80W2VFY56R).
  const fileExt = (fileName.split('.').pop() ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'pdf';
  const cleanName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const hash = uuidv4().slice(0, 8);

  const key = `${tenantId}/${organisationId}/${cleanCategory}/${year}/${hash}_${cleanName}.${fileExt}`;
  if (tenantObjectKeyOf(tenantId, key) !== key) throw new Error('refusing to build an object key outside the tenant prefix');
  return key;
}

const SAFE_TENANT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_OBJECT_KEY = /^[A-Za-z0-9_./-]{1,1024}$/;

/**
 * Y-4 of the TASK-MUN66T2HM4A4E scan (TASK-MUN80W2VFY56R): the object key of an
 * evidence upload comes back from the browser, and the row's key is later
 * handed to the storage delete. Every key a tenant may record or delete must
 * therefore pass here: it is `objectKeyOrUrl` reduced to a bare key when it is
 * one of `tenantId`'s own — under `<tenantId>/`, only `[A-Za-z0-9_./-]`, no
 * empty, `.` or `..` segment — and null otherwise. `%` is outside the set, so
 * an encoded `%2e%2e` never reaches a store that might decode it.
 *
 * An absolute URL (rows written before `r2ObjectKey` existed store only
 * `fileUrl`) is reduced to its path first, whatever its host.
 */
export function tenantObjectKeyOf(tenantId: string, objectKeyOrUrl: unknown): string | null {
  if (typeof tenantId !== 'string' || !SAFE_TENANT_ID.test(tenantId)) return null;
  if (typeof objectKeyOrUrl !== 'string') return null;

  let key = objectKeyOrUrl;
  if (/^https?:\/\//i.test(key)) {
    try {
      key = new URL(key).pathname.replace(/^\/+/, '');
    } catch {
      return null;
    }
  }

  if (!SAFE_OBJECT_KEY.test(key)) return null;
  const segments = key.split('/');
  if (segments.length < 2 || segments[0] !== tenantId) return null;
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return key;
}

/**
 * B-1 (TASK-MUNODY0DVDWC5): what an evidence upload may be. The extension of
 * the object key and the declared type must name the same entry, and the first
 * bytes of the stored object must look like it: the store would otherwise
 * serve whatever the browser sent (HTML, SVG) under the company's domain.
 * docx and xlsx are both ZIP containers, so their sniff is the ZIP header.
 */
export const EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;

const EVIDENCE_TYPES: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  pdf: { mime: 'application/pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  png: { mime: 'image/png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: isZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: isZip },
};

function isZip(b: Buffer): boolean {
  return b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

export type EvidenceUploadRefusal = 'unsupported_type' | 'file_too_large' | 'empty_file';

/**
 * The content type an evidence file named `fileName` must carry, or why it may
 * not be uploaded at all. `mimeType` is the browser's claim; it has to agree
 * with the extension, since the extension is what ends up in the object key.
 */
export function evidenceUploadType(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): { ok: true; contentType: string } | { ok: false; error: EvidenceUploadRefusal } {
  const entry = EVIDENCE_TYPES[(fileName.split('.').pop() ?? '').toLowerCase()];
  if (!entry || entry.mime !== mimeType) return { ok: false, error: 'unsupported_type' };
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, error: 'empty_file' };
  if (sizeBytes > EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };
  return { ok: true, contentType: entry.mime };
}

/**
 * Whether a stored evidence object is what its key says: a known extension,
 * within the size limit, the stored content type (when the store keeps one)
 * equal to that extension's, and leading bytes of that format.
 */
export function storedEvidenceMatches(
  objectKey: string,
  stored: { size: number; contentType: string | null; head: Buffer }
): { ok: true; contentType: string } | { ok: false; error: EvidenceUploadRefusal } {
  const entry = EVIDENCE_TYPES[(objectKey.split('.').pop() ?? '').toLowerCase()];
  if (!entry) return { ok: false, error: 'unsupported_type' };
  if (stored.size <= 0) return { ok: false, error: 'empty_file' };
  if (stored.size > EVIDENCE_MAX_BYTES) return { ok: false, error: 'file_too_large' };
  if (stored.contentType !== null && stored.contentType !== entry.mime) return { ok: false, error: 'unsupported_type' };
  if (!entry.magic(stored.head)) return { ok: false, error: 'unsupported_type' };
  return { ok: true, contentType: entry.mime };
}

/**
 * D-1 (TASK-MUNTTZ94LJWBC, İNCELEME-66): a signed PUT stays valid for its 15
 * minutes after the upload is confirmed, so it used to be a way to replace a
 * checked file with anything of the same type and length. The browser now
 * uploads to a staging key, `<tenantId>/incoming/<rest>`, and confirm checks
 * the object and copies it to `<tenantId>/<rest>`. The final key is never
 * in a signed PUT; a PUT after confirm only recreates the staging object.
 */
const INCOMING_SEGMENT = 'incoming';

function incomingKeyOf(tenantId: string, finalKey: string): string {
  return `${tenantId}/${INCOMING_SEGMENT}/${finalKey.slice(tenantId.length + 1)}`;
}

/**
 * The exact shape `getPresignedUploadUrl` hands out:
 * `<tenant>/incoming/<organisation>/<category>/<year>/<hash>_<name>.<ext>`.
 * Anything else is refused (D-1, TASK-MUO122UPRPJQH, İNCELEME-77): a nested
 * `<t>/incoming/incoming/x.pdf` used to pass and map to `<t>/incoming/x.pdf`,
 * another staging key, which the dev upload route then let anyone overwrite.
 */
const INCOMING_KEY_SHAPE = /^incoming\/([A-Za-z0-9_-]{1,128})\/[a-z0-9_-]+\/\d{4}\/[a-z0-9]{8}_[a-z0-9_-]+\.[a-z0-9]{1,10}$/;

/**
 * The final key a staging key of `tenantId` is confirmed under, or null when
 * `objectKey` is not one of that tenant's staging keys (a final key included).
 */
export function finalKeyOfIncoming(tenantId: string, objectKey: unknown): string | null {
  const key = tenantObjectKeyOf(tenantId, objectKey);
  if (!key || key !== objectKey) return null;
  const rest = key.slice(tenantId.length + 1);
  const shape = INCOMING_KEY_SHAPE.exec(rest);
  if (!shape || shape[1] === INCOMING_SEGMENT) return null;
  return `${tenantId}/${rest.slice(INCOMING_SEGMENT.length + 1)}`;
}

export type IncomingCopyResult =
  | { ok: true; size: number; contentType: string }
  | { ok: false; error: EvidenceUploadRefusal | 'object_missing' | 'storage_unavailable' };

/** Whether a refusal is about the file itself, so trying again cannot help. */
export function isFinalUploadRefusal(error: string): error is EvidenceUploadRefusal {
  return error === 'unsupported_type' || error === 'file_too_large' || error === 'empty_file';
}

function storeFailure(err: unknown): 'object_missing' | 'storage_unavailable' {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  const status = e?.$metadata?.httpStatusCode;
  return status === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey' ? 'object_missing' : 'storage_unavailable';
}

/**
 * B-1 (TASK-MUO122UPRPJQH, İNCELEME-77): copies the checked staging object to
 * its final key and leaves the staging object where it is. The caller records
 * the row and only then removes the staging object, so every failure on the
 * way — a slow or dead store included — leaves the user's upload in place and
 * a later confirm of the same key can finish the job. This used to delete the
 * staging object right after the copy, inside the row's transaction; a store
 * slower than the transaction's 5 s then lost the file altogether.
 *
 * The staging object is checked *before* the copy and the copy is pinned to
 * the checked version (`CopySourceIfMatch`), so the final key only ever holds
 * bytes that passed `storedEvidenceMatches` — a PUT to the staging key while
 * this runs makes the copy fail rather than slip in unchecked. The final
 * object is then read back to prove it is there.
 *
 * Nothing is deleted here. A refusal of the file itself is returned as such
 * (`isFinalUploadRefusal`); `object_missing` / `storage_unavailable` are worth
 * trying again. The caller has derived `finalKey` with `finalKeyOfIncoming`.
 *
 * The store calls — HEAD, GET, copy and the read-back alike — give up after
 * `deadlineMs` in all (`storage_unavailable`), `EVIDENCE_COPY_DEADLINE_MS` at
 * most: confirm runs this under a lock that must not be released while a copy
 * it started is still on its way (Y-1, TASK-MUO64MVW8TLMX), so the copy has to
 * end before the lock's transaction does, and confirm passes what is left of
 * it (Y-3, TASK-MUO9IFMMVRUDJ).
 */
export const EVIDENCE_COPY_DEADLINE_MS = 15_000;

export async function copyIncomingObject(
  incomingKey: string,
  finalKey: string,
  deadlineMs: number = EVIDENCE_COPY_DEADLINE_MS
): Promise<IncomingCopyResult> {
  if (s3) {
    const opts = { abortSignal: AbortSignal.timeout(Math.min(deadlineMs, EVIDENCE_COPY_DEADLINE_MS)) };
    let etag: string;
    let checked: { size: number; contentType: string };
    try {
      const meta = await s3.send(new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: incomingKey }), opts);
      if (!meta.ETag) return { ok: false, error: 'storage_unavailable' };
      etag = meta.ETag;
      const first = await s3.send(new GetObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: incomingKey, Range: 'bytes=0-15', IfMatch: etag }), opts);
      const head = first.Body ? Buffer.from(await first.Body.transformToByteArray()) : Buffer.alloc(0);
      const verdict = storedEvidenceMatches(finalKey, { size: meta.ContentLength ?? 0, contentType: meta.ContentType ?? null, head });
      if (!verdict.ok) return verdict;
      checked = { size: meta.ContentLength ?? 0, contentType: verdict.contentType };
    } catch (err) {
      return { ok: false, error: storeFailure(err) };
    }
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: EVIDENCE_BUCKET,
        CopySource: `${EVIDENCE_BUCKET}/${incomingKey}`,
        CopySourceIfMatch: etag,
        Key: finalKey,
        MetadataDirective: 'COPY',
      }), opts);
      const copy = await s3.send(new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: finalKey }), opts);
      if (copy.ContentLength !== checked.size || (copy.ContentType ?? checked.contentType) !== checked.contentType) {
        return { ok: false, error: 'storage_unavailable' };
      }
    } catch (err) {
      // 412: the staging object changed after the check. Trying again checks the new one.
      const failure = storeFailure(err);
      return { ok: false, error: failure === 'object_missing' ? 'object_missing' : 'storage_unavailable' };
    }
    return { ok: true, ...checked };
  }

  const from = devObjectPath(incomingKey);
  const to = devObjectPath(finalKey);
  if (!from || !to) return { ok: false, error: 'object_missing' };
  const staged = await statObject(incomingKey);
  if (!staged) return { ok: false, error: 'object_missing' };
  const verdict = storedEvidenceMatches(finalKey, staged);
  if (!verdict.ok) return verdict;
  const { copyFile, mkdir, rename, rm } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  // Written aside and renamed, so the final path never holds half a file.
  const partial = `${to}.${uuidv4().slice(0, 8)}.partial`;
  try {
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, partial);
    await rename(partial, to);
  } catch {
    await rm(partial, { force: true }).catch(() => {});
    return { ok: false, error: 'storage_unavailable' };
  }
  const copy = await statObject(finalKey);
  if (!copy || copy.size !== staged.size || !storedEvidenceMatches(finalKey, copy).ok) {
    return { ok: false, error: 'storage_unavailable' };
  }
  return { ok: true, size: copy.size, contentType: verdict.contentType };
}

/**
 * A presigned PUT URL for a direct browser-to-R2 upload, valid for 15 minutes.
 * The content type and the exact length are part of the signature (B-1): a PUT
 * with any other type or size is refused by the store itself, not only by the
 * form. The caller has checked both with `evidenceUploadType`.
 *
 * Without an object store the URL is the same-origin dev stand-in
 * (`/api/evidence/mock-upload`), which applies the same checks — outside
 * production only. In production that route does not exist, so this throws
 * ObjectStoreUnconfiguredError rather than hand out a URL that answers 404
 * (TASK-MUSFO7ELD7WYF); the action refuses before it gets here.
 *
 * `objectKey` is a staging key (`finalKeyOfIncoming`); confirm copies it to
 * the final key (`copyIncomingObject`) and removes it once the row is saved.
 */
export async function getPresignedUploadUrl(
  tenantId: string,
  organisationId: string,
  category: string,
  fileName: string,
  contentType: string,
  sizeBytes: number
): Promise<{ uploadUrl: string; objectKey: string }> {
  const objectKey = incomingKeyOf(tenantId, generateR2ObjectKey(tenantId, organisationId, category, fileName));

  if (!s3) {
    if (objectStoreMissingInProduction()) throw new ObjectStoreUnconfiguredError();
    return { uploadUrl: `/api/evidence/mock-upload?key=${encodeURIComponent(objectKey)}`, objectKey };
  }

  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const command = new PutObjectCommand({
    Bucket: EVIDENCE_BUCKET,
    Key: objectKey,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: 900,
    signableHeaders: new Set(['content-type', 'content-length']),
  });
  return { uploadUrl, objectKey };
}

/**
 * What the store holds under `objectKey`: size, content type (null for the dev
 * store, which keeps none) and the first 16 bytes. Null when there is no such
 * object.
 */
export async function statObject(
  objectKey: string
): Promise<{ size: number; contentType: string | null; head: Buffer } | null> {
  if (s3) {
    try {
      const meta = await s3.send(new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey }));
      const first = await s3.send(new GetObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: objectKey, Range: 'bytes=0-15' }));
      const head = first.Body ? Buffer.from(await first.Body.transformToByteArray()) : Buffer.alloc(0);
      return { size: meta.ContentLength ?? 0, contentType: meta.ContentType ?? null, head };
    } catch {
      return null;
    }
  }
  const path = devObjectPath(objectKey);
  if (!path) return null;
  const { open } = await import('node:fs/promises');
  try {
    const fh = await open(path, 'r');
    try {
      const { size } = await fh.stat();
      const head = Buffer.alloc(16);
      const { bytesRead } = await fh.read(head, 0, 16, 0);
      return { size, contentType: null, head: head.subarray(0, bytesRead) };
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

/**
 * B-2 (TASK-MUNODY0DVDWC5): a short-lived presigned GET for one object, always
 * as a download. Evidence is never read from a public host any more; the only
 * caller is the authenticated, tenant-checked download route. Null without an
 * object store (the route then serves the dev store's bytes itself).
 */
export async function getPresignedDownloadUrl(objectKey: string, fileName: string): Promise<string | null> {
  if (!s3) return null;
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'evidence';
  const command = new GetObjectCommand({
    Bucket: EVIDENCE_BUCKET,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

/**
 * Uploads a File directly (Server-side helper). The key is built here, never
 * taken from the client, and the bytes are really stored (R2, or `.dev-objects`
 * outside production). Null when nothing was stored: the caller must not
 * record a key for a file that does not exist. This used to wait 300 ms and
 * return a URL to nothing.
 *
 * Evidence rules apply here as on the presigned path (B-1): an allowed type,
 * within the size limit, whose bytes look like that type. Null otherwise.
 */
export async function uploadFileToR2(
  file: File,
  tenantId: string,
  category = 'general'
): Promise<{ objectKey: string; contentType: string } | null> {
  const allowed = evidenceUploadType(file.name, file.type, file.size);
  if (!allowed.ok) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const objectKey = generateR2ObjectKey(tenantId, 'org-default', category, file.name);
  if (!storedEvidenceMatches(objectKey, { size: bytes.length, contentType: allowed.contentType, head: bytes.subarray(0, 16) }).ok) {
    return null;
  }
  const stored = await putObjectBytes(objectKey, bytes, allowed.contentType);
  return stored ? { objectKey, contentType: allowed.contentType } : null;
}

/**
 * Deletes a stored object on behalf of `tenantId` — only when the key is one of
 * that tenant's own (`tenantObjectKeyOf`). A refused key deletes nothing and
 * returns false; the caller may still drop its own row.
 */
export async function deleteTenantObject(tenantId: string, objectKeyOrUrl: string): Promise<boolean> {
  const key = tenantObjectKeyOf(tenantId, objectKeyOrUrl);
  if (!key) {
    console.warn(`[R2 Storage] Refused to delete an object outside tenant ${tenantId}'s prefix`);
    return false;
  }
  return deleteFileFromR2(key);
}

/**
 * Deletes a file from Cloudflare R2 by object key.
 */
export async function deleteFileFromR2(objectKeyOrUrl: string): Promise<boolean> {
  if (!s3) {
    // Outside production the local store stands in for R2 (putObjectBytes), so
    // a delete removes the file there too; a key it refuses deletes nothing.
    const path = devObjectPath(objectKeyOrUrl);
    if (path) {
      const { rm } = await import('node:fs/promises');
      await rm(path, { force: true });
    }
    console.log(`[R2 Storage (Dev Fallback)] Deleted object: ${objectKeyOrUrl}`);
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
  return rm(path, { force: true }).then(() => true, () => false);
}

/**
 * Public assets (blog images, TASK-MUU20NSV2TETW). The evidence bucket stays
 * private (B-2, TASK-MUNODY0DVDWC5); what the public site shows lives in a
 * bucket of its own that the store serves to anyone, `R2_PUBLIC_BUCKET`, read
 * back under `R2_PUBLIC_HOST`. The host may carry a path: a MinIO bucket is
 * `http://host:9000/<bucket>`, a Supabase Storage public bucket
 * `https://<ref>.supabase.co/storage/v1/object/public/<bucket>`.
 *
 * Null unless the client, the bucket and the host are all set: an object
 * written with no way to read it back is not an upload.
 */
export function publicAssetStore(
  source: { R2_PUBLIC_BUCKET?: string; R2_PUBLIC_HOST?: string } = env,
  objectStore: boolean = hasObjectStore
): { bucket: string; baseUrl: string } | null {
  const bucket = source.R2_PUBLIC_BUCKET?.trim();
  const host = source.R2_PUBLIC_HOST?.trim();
  if (!objectStore || !bucket || !host) return null;
  if (bucket === EVIDENCE_BUCKET) return null;
  try {
    const url = new URL(host);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { bucket, baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
  } catch {
    return null;
  }
}

/**
 * Writes `bytes` to the public bucket under `objectKey` and returns the URL
 * anyone can read it from; null when the store refused the write. The caller
 * has checked `publicAssetStore()` and the bytes themselves. Keys are never
 * reused (they carry a fresh id), so the object may be cached for a year.
 */
export async function putPublicAsset(objectKey: string, bytes: Buffer, contentType: string): Promise<string | null> {
  const store = publicAssetStore();
  if (!s3 || !store) throw new ObjectStoreUnconfiguredError();
  try {
    await s3.send(new PutObjectCommand({
      Bucket: store.bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${store.baseUrl}/${objectKey}`;
  } catch (err) {
    console.error(`[R2 Storage] Public put error for ${objectKey}: ${errorMessage(err)}`);
    return null;
  }
}
