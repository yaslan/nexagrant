/**
 * The dev stand-in for a presigned R2 PUT (TASK-MUNODY0DVDWC5).
 *
 * Without R2 credentials `getPresignedUploadUrl` hands the browser this URL
 * instead. It used to point at nothing, and the form skipped the PUT, so a row
 * was confirmed for a file that was never stored. Now the bytes land in the dev
 * store (`.dev-objects`), and confirm checks them exactly as it checks R2.
 *
 * It enforces what the signature enforces on R2: a staging key under the
 * caller's own tenant, the content type of the key's extension, and the size
 * limit. It does
 * not exist in production or when an object store is configured.
 */
import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { requireTenantApi } from '@/lib/tenant';
import { asRole, can } from '@/lib/rbac';
import {
  EVIDENCE_MAX_BYTES,
  evidenceUploadType,
  finalKeyOfIncoming,
  hasObjectStore,
  putObjectBytes,
  tenantObjectKeyOf,
} from '@/lib/storage';

export async function PUT(req: Request) {
  if (hasObjectStore || env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const auth = await requireTenantApi({ write: true });
  if (!auth.ok) return auth.response;
  if (!can(asRole(auth.scope.role), 'edit_proposal')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  const requested = new URL(req.url).searchParams.get('key');
  const key = tenantObjectKeyOf(auth.scope.tenantId, requested);
  // Only a staging key, as on R2 (D-1, TASK-MUNTTZ94LJWBC): a confirmed file
  // lives under its final key, which no upload may name.
  if (!key || key !== requested || !finalKeyOfIncoming(auth.scope.tenantId, key)) {
    return NextResponse.json({ error: 'invalid_object_key' }, { status: 403 });
  }

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > EVIDENCE_MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  const allowed = evidenceUploadType(key, req.headers.get('content-type') ?? '', bytes.length);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.error === 'file_too_large' ? 413 : 415 });
  }

  if (!(await putObjectBytes(key, bytes, allowed.contentType))) {
    return internalError({ error: 'storage_unavailable' }, { status: 503 });
  }
  return new NextResponse(null, { status: 200 });
}
