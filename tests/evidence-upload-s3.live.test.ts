import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * TASK-MUNODY0DVDWC5 (B-1/B-2/B-3 of İNCELEME-58) — against a real
 * S3-compatible store, not a mock of one.
 *
 * B-1: a presigned PUT carries the content type and the exact length in its
 *      signature, only allowed types get one, and confirm checks the stored
 *      object (exists, type, size, leading bytes) instead of the browser's
 *      claim; a failing object is removed by its one key.
 * B-2: evidence is read only through the authenticated, tenant-checked
 *      download route (a 5-minute presigned GET, as an attachment); the bucket
 *      answers an unsigned read with 403, CONFIDENTIAL files included.
 * B-3: the presigned URL carries no checksum of an empty body, so a real PUT
 *      with real bytes is accepted.
 *
 * Needs a MinIO (or other S3) endpoint in the environment variable
 * EVIDENCE_S3_TEST_ENDPOINT with EVIDENCE_S3_TEST_ACCESS_KEY / _SECRET_KEY /
 * _BUCKET (not read from .env), a private bucket, plus
 * the docker-compose Postgres and `pnpm db:rls-role`. Without the store the
 * file skips, in CI too: the CI job has no S3 service (see the result file).
 * The contents written here are harmless text; only refusals are tested.
 */

const SUITE = 'evidence-upload-s3.live';
// From the process environment only, not .env: storage.ts reads these when it
// is imported, before any .env lookup could run.
const S3 = {
  endpoint: process.env.EVIDENCE_S3_TEST_ENDPOINT,
  accessKey: process.env.EVIDENCE_S3_TEST_ACCESS_KEY,
  secretKey: process.env.EVIDENCE_S3_TEST_SECRET_KEY,
  bucket: process.env.EVIDENCE_S3_TEST_BUCKET,
};
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `evs3-${Date.now().toString(36)}`;

const state = vi.hoisted(() => {
  // storage.ts builds its client when imported; point it at the test store first.
  const e = process.env;
  if (e.EVIDENCE_S3_TEST_ENDPOINT) {
    e.R2_ACCOUNT_ID = 'minio-test';
    e.R2_ENDPOINT = e.EVIDENCE_S3_TEST_ENDPOINT;
    e.R2_ACCESS_KEY_ID = e.EVIDENCE_S3_TEST_ACCESS_KEY;
    e.R2_SECRET_ACCESS_KEY = e.EVIDENCE_S3_TEST_SECRET_KEY;
    e.R2_BUCKET = e.EVIDENCE_S3_TEST_BUCKET;
  }
  return {
    rls: undefined as PrismaClient | undefined,
    session: null as null | { user: { id: string }; tenantId: string; role: string },
  };
});

// Only the session is replaced; requireTenantAction / requireTenantApi run for real.
vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const evidence = await import('@/app/[locale]/(app)/[workspace]/evidence/actions');
const download = await import('@/app/api/evidence/[id]/download/route');
const storage = await import('@/lib/storage');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const t = { a: '', b: '', userA: '', userB: '' };
const evidenceIds: string[] = [];
const keys: string[] = [];

function actAs(who: 'a' | 'b' | 'anon') {
  state.session =
    who === 'anon' ? null : { user: { id: who === 'a' ? t.userA : t.userB }, tenantId: t[who], role: 'TENANT_OWNER' };
}

const PDF = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

async function presign(name: string, mime: string, size: number) {
  const res = await evidence.getPresignedUploadUrlAction('certificate', name, mime, size);
  if (!res.success) throw new Error(`presign refused: ${res.error}`);
  keys.push(res.objectKey);
  return res;
}

const put = (url: string, body: Buffer, contentType: string) =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) });

const confirm = (objectKey: string, over: Record<string, unknown> = {}) =>
  evidence.confirmEvidenceUploadAction({
    title: `${RUN} upload`,
    category: 'CAT-03',
    objectKey,
    fileName: 'belge.pdf',
    fileSizeBytes: 10,
    mimeType: 'application/pdf',
    ...over,
  });

/** An unsigned GET straight at the store, as anyone holding the object's address would try. */
const anonymousStoreGet = (key: string) => fetch(`${S3.endpoint!.replace(/\/+$/, '')}/${S3.bucket}/${key}`);

const callDownload = (id: string) =>
  download.GET(new Request(`http://localhost/api/evidence/${id}/download`), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  if (!S3.endpoint || !S3.accessKey || !S3.secretKey || !S3.bucket) {
    skipReason = 'EVIDENCE_S3_TEST_* not set (no S3-compatible store to test against).';
    if (!isCi()) console.warn(`[${SUITE}] skipped: ${skipReason}`);
    return;
  }
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);
  expect(storage.hasObjectStore, 'storage.ts must be talking to the test store').toBe(true);
  expect(storage.EVIDENCE_BUCKET).toBe(S3.bucket);

  for (const side of ['a', 'b'] as const) {
    const tenant = await admin.tenant.create({
      data: { name: `${RUN}-${side} Kurum`, slug: `${RUN}-${side}`, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    });
    t[side] = tenant.id;
    const user = await admin.user.create({ data: { email: `${RUN}-${side}@example.invalid`, name: side } });
    t[side === 'a' ? 'userA' : 'userB'] = user.id;
  }
  ready = true;
});

beforeEach(({ skip }) => {
  if (!ready) skip(skipReason);
  actAs('a');
});

afterAll(async () => {
  // Every object this run could have written, each by its own key.
  for (const key of keys) await storage.deleteObjectBytes(key).catch(() => {});
  if (admin) {
    await admin.evidence.deleteMany({ where: { id: { in: presentIds(evidenceIds) } } }).catch(() => {});
    for (const tenantId of presentIds([t.a, t.b])) {
      await admin.evidence.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } }).catch(() => {});
      await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
    await admin.user.deleteMany({ where: { id: { in: presentIds([t.userA, t.userB]) } } }).catch(() => {});
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
});

describe('B-1: only an allowed type of a bounded size gets a signed upload', () => {
  test('types outside the list, a type that disagrees with the extension, and bad sizes get no URL', async () => {
    for (const [name, mime] of [
      ['sayfa.html', 'text/html'],
      ['logo.svg', 'image/svg+xml'],
      ['kur.exe', 'application/octet-stream'],
      ['belge.pdf', 'text/html'],
      ['belge.html', 'application/pdf'],
      ['belge', 'application/pdf'],
    ]) {
      const res = await evidence.getPresignedUploadUrlAction('certificate', name, mime, 10);
      expect(res, `${name} ${mime}`).toEqual({ success: false, error: 'unsupported_type' });
    }
    expect(await evidence.getPresignedUploadUrlAction('certificate', 'a.pdf', 'application/pdf', storage.EVIDENCE_MAX_BYTES + 1))
      .toEqual({ success: false, error: 'file_too_large' });
    for (const size of [0, -1, 1.5, Number.NaN]) {
      expect(await evidence.getPresignedUploadUrlAction('certificate', 'a.pdf', 'application/pdf', size), String(size))
        .toEqual({ success: false, error: 'empty_file' });
    }
  });

  test('the URL signs type and length and carries no empty-body checksum (B-3)', async () => {
    const body = PDF('imza');
    const { uploadUrl } = await presign('imza.pdf', 'application/pdf', body.length);
    const q = new URL(uploadUrl).searchParams;
    expect(q.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(q.get('X-Amz-Expires')).toBe('900');
    expect([...q.keys()].some((k) => k.toLowerCase().startsWith('x-amz-checksum') || k.toLowerCase() === 'x-amz-sdk-checksum-algorithm')).toBe(false);
  });

  test('the store refuses a PUT whose type differs from the signed one', async () => {
    const body = PDF('tur');
    const { uploadUrl, objectKey } = await presign('tur.pdf', 'application/pdf', body.length);
    for (const type of ['text/html', 'image/svg+xml', 'application/octet-stream']) {
      const res = await put(uploadUrl, body, type);
      expect(res.status, type).toBe(403);
    }
    expect(await storage.statObject(objectKey)).toBeNull();
  });

  test('the store refuses a PUT larger or smaller than the signed length', async () => {
    const body = PDF('boyut');
    const { uploadUrl, objectKey } = await presign('boyut.pdf', 'application/pdf', body.length);
    const larger = await put(uploadUrl, Buffer.concat([body, Buffer.alloc(4096, 0x20)]), 'application/pdf');
    expect(larger.status).toBe(403);
    const smaller = await put(uploadUrl, body.subarray(0, body.length - 1), 'application/pdf');
    expect(smaller.status).toBe(403);
    expect(await storage.statObject(objectKey)).toBeNull();
  });

  test('confirm refuses a key that was never uploaded, and writes no row', async () => {
    const { objectKey } = await presign('yok.pdf', 'application/pdf', 10);
    expect(await confirm(objectKey)).toEqual({ success: false, error: 'object_missing' });
    expect(await admin!.evidence.count({ where: { tenantId: t.a, r2ObjectKey: objectKey } })).toBe(0);
  });

  test('confirm refuses a stored object whose bytes are not the key’s type, and removes that one object', async () => {
    const neighbour = PDF('komsu');
    const n = await presign('komsu.pdf', 'application/pdf', neighbour.length);
    expect((await put(n.uploadUrl, neighbour, 'application/pdf')).status).toBe(200);

    // Harmless text uploaded under a .pdf key with the signed type and length.
    const text = Buffer.from('plain text, not a PDF document');
    const { uploadUrl, objectKey } = await presign('sahte.pdf', 'application/pdf', text.length);
    expect((await put(uploadUrl, text, 'application/pdf')).status).toBe(200);

    const res = await confirm(objectKey, { fileSizeBytes: text.length });
    expect(res).toEqual({ success: false, error: 'unsupported_type' });
    expect(await storage.statObject(objectKey), 'the refused object is gone').toBeNull();
    expect(await storage.statObject(n.objectKey), 'another object of the same tenant stays').not.toBeNull();
    expect(await admin!.evidence.count({ where: { tenantId: t.a, r2ObjectKey: objectKey } })).toBe(0);
  });

  test('confirm refuses a stored object whose content type is not the key’s, even with PDF bytes', async () => {
    // Written past the presign, as a store holding an older upload might.
    const key = storage.generateR2ObjectKey(t.a, 'org-default', 'certificate', 'eski.pdf');
    keys.push(key);
    expect(await storage.putObjectBytes(key, PDF('eski'), 'text/html')).toBe(true);
    expect(await confirm(key)).toEqual({ success: false, error: 'unsupported_type' });
    expect(await storage.statObject(key)).toBeNull();
  });

  test('confirm refuses a stored object over the limit, whatever size the browser claims', async () => {
    const key = storage.generateR2ObjectKey(t.a, 'org-default', 'certificate', 'buyuk.pdf');
    keys.push(key);
    const big = Buffer.concat([PDF('buyuk'), Buffer.alloc(storage.EVIDENCE_MAX_BYTES, 0x20)]);
    expect(await storage.putObjectBytes(key, big, 'application/pdf')).toBe(true);
    expect(await confirm(key, { fileSizeBytes: 10 })).toEqual({ success: false, error: 'file_too_large' });
    expect(await storage.statObject(key)).toBeNull();
   }, 60_000);

  test('positive control: a real PDF goes through, and the row records the store’s size and type', async () => {
    const body = PDF('gercek');
    const { uploadUrl, objectKey, contentType } = await presign('Kalite Belgesi.pdf', 'application/pdf', body.length);
    expect((await put(uploadUrl, body, contentType)).status).toBe(200);

    const res = await confirm(objectKey, { fileSizeBytes: 999, mimeType: 'text/html' });
    expect(res.success).toBe(true);
    const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t.a, r2ObjectKey: objectKey } });
    evidenceIds.push(row.id);
    expect(row.fileSizeBytes).toBe(body.length);
    expect(row.mimeType).toBe('application/pdf');
    expect(row.fileUrl).toBeNull();
  });
});

describe('B-2: evidence is read only by a signed-in member of its tenant', () => {
  async function storedEvidence(tenant: 'a' | 'b', confidentiality: string) {
    actAs(tenant);
    const body = PDF(`${tenant}-${confidentiality}`);
    const { uploadUrl, objectKey } = await presign(`${tenant}-gizli.pdf`, 'application/pdf', body.length);
    expect((await put(uploadUrl, body, 'application/pdf')).status).toBe(200);
    const res = await confirm(objectKey, { confidentiality });
    expect(res.success).toBe(true);
    const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t[tenant], r2ObjectKey: objectKey } });
    evidenceIds.push(row.id);
    return { id: row.id, objectKey, body };
  }

  test('a CONFIDENTIAL file cannot be read without a session, neither from the store nor through the app', async () => {
    const secret = await storedEvidence('a', 'CONFIDENTIAL');

    const direct = await anonymousStoreGet(secret.objectKey);
    expect(direct.status).toBe(403);
    expect(Buffer.from(await direct.arrayBuffer()).includes(secret.body)).toBe(false);

    actAs('anon');
    const res = await callDownload(secret.id);
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });

  test('another tenant’s evidence is a 404 and no signed URL is handed out', async () => {
    const bFile = await storedEvidence('b', 'CONFIDENTIAL');
    actAs('a');
    const res = await callDownload(bFile.id);
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
    // A made-up id reads the same, so ids cannot be probed.
    expect((await callDownload(`${bFile.id}x`)).status).toBe(404);
  });

  test('a row of A that names B’s object does not open it', async () => {
    const bFile = await storedEvidence('b', 'INTERNAL');
    const planted = await admin!.evidence.create({
      data: { tenantId: t.a, kind: 'certificate', title: `${RUN} planted`, body: '', r2ObjectKey: bFile.objectKey },
    });
    evidenceIds.push(planted.id);
    actAs('a');
    const res = await callDownload(planted.id);
    expect(res.status).toBe(404);
  });

  test('positive control: the owner gets a 5-minute signed download of the same bytes, as an attachment', async () => {
    const own = await storedEvidence('a', 'CONFIDENTIAL');
    actAs('a');
    const res = await callDownload(own.id);
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const location = res.headers.get('location')!;
    const q = new URL(location).searchParams;
    expect(q.get('X-Amz-Expires')).toBe('300');
    expect(q.get('response-content-disposition')).toMatch(/^attachment;/);

    const file = await fetch(location);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(Buffer.from(await file.arrayBuffer()).equals(own.body)).toBe(true);
  });
});
