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

const SUITE = 'zz-devfb66-attack.live';
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
const RUN = `dv66-${Date.now().toString(36)}`;

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
    role: 'TENANT_OWNER',
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
const t: Record<string, string> = { a: '', b: '', userA: '', userB: '' };
const evidenceIds: string[] = [];
const keys: string[] = [];

function actAs(who: 'a' | 'b' | 'anon') {
  state.session =
    who === 'anon' ? null : { user: { id: who === 'a' ? t.userA : t.userB }, tenantId: t[who], role: state.role };
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


const mock = await import('@/app/api/evidence/mock-upload/route');
async function stored(tenant: 'a' | 'b', body: Buffer, name = 'x.pdf', mime = 'application/pdf') {
  actAs(tenant);
  const p = await presign(name, mime, body.length);
  expect((await put(p.uploadUrl, body, mime)).status).toBe(200);
  const res = await confirm(p.objectKey);
  expect(res.success, JSON.stringify(res)).toBe(true);
  const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t[tenant], r2ObjectKey: p.objectKey } });
  evidenceIds.push(row.id);
  return { ...p, id: row.id };
}
const storeGet = async (key: string) => {
  // signed as the owner of the bucket, to see what really sits there
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const c = new S3Client({ region: 'auto', endpoint: S3.endpoint, forcePathStyle: true, credentials: { accessKeyId: S3.accessKey!, secretAccessKey: S3.secretKey! } });
  const o = await c.send(new GetObjectCommand({ Bucket: S3.bucket, Key: key }));
  return { type: o.ContentType, disp: o.ContentDisposition, enc: o.ContentEncoding, meta: o.Metadata, bytes: Buffer.from(await o.Body!.transformToByteArray()) };
};

describe('ATTACK', () => {
  test('A8 x-amz-acl public-read accepted -> is the object public afterwards? and a %PDF- polyglot', async () => {
    actAs('a');
    const body = PDF('acl');
    const p = await presign('acl.pdf', 'application/pdf', body.length);
    const r = await fetch(p.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' }, body: new Uint8Array(body) });
    console.log('A8 PUT with x-amz-acl ->', r.status, '; anonymous GET after ->', (await anonymousStoreGet(p.objectKey)).status);
    const poly = Buffer.from('%PDF-1.4\n<html><body><script>alert(document.domain)</script></body></html>');
    const s2 = await presign('poly.pdf', 'application/pdf', poly.length);
    expect((await put(s2.uploadUrl, poly, 'application/pdf')).status).toBe(200);
    const c = await confirm(s2.objectKey);
    console.log('A8 polyglot %PDF-+HTML confirm ->', c.success);
    if (c.success) { const row = await admin!.evidence.findFirstOrThrow({ where: { r2ObjectKey: s2.objectKey } }); evidenceIds.push(row.id); }
  });

  test('A1 after confirm, the same presigned URL overwrites the confirmed object with non-PDF bytes of the same length', async () => {
    const good = PDF('iyi-belge-0123456789');
    const s = await stored('a', good);
    const evil = Buffer.from('<html><script>alert(1)</script>'.padEnd(good.length, ' '));
    expect(evil.length).toBe(good.length);
    const r1 = await put(s.uploadUrl, evil, 'text/html');
    console.log('A1 re-PUT text/html ->', r1.status);
    const r2 = await put(s.uploadUrl, evil, 'application/pdf');
    console.log('A1 re-PUT application/pdf, HTML bytes, same length ->', r2.status);
    const now = await storeGet(s.objectKey);
    console.log('A1 stored now: type=', now.type, 'bytes starts=', JSON.stringify(now.bytes.subarray(0, 14).toString()));
    const row = await admin!.evidence.findUniqueOrThrow({ where: { id: s.id } });
    console.log('A1 row still: mime=', row.mimeType, 'size=', row.fileSizeBytes, 'status=', row.status);
    actAs('a');
    const dl = await callDownload(s.id);
    const f = await fetch(dl.headers.get('location')!);
    console.log('A1 download: ', f.status, f.headers.get('content-type'), f.headers.get('content-disposition'), JSON.stringify((await f.text()).slice(0, 14)));
  });

  test('A2 the same key confirmed twice -> two rows; deleting one orphans the other', async () => {
    const s = await stored('a', PDF('iki-kez'));
    actAs('a');
    const again = await confirm(s.objectKey);
    console.log('A2 second confirm success=', again.success);
    const rows = await admin!.evidence.findMany({ where: { r2ObjectKey: s.objectKey } });
    evidenceIds.push(...rows.map((r) => r.id));
    console.log('A2 rows with that key =', rows.length);
    if (rows.length === 2) {
      await evidence.deleteEvidence(rows[0].id);
      const dl = await callDownload(rows[1].id);
      const f = dl.headers.get('location') ? await fetch(dl.headers.get('location')!) : null;
      console.log('A2 surviving row download: route', dl.status, 'store', f?.status);
    }
  });

  test('A3 confirm of B\'s key, in raw, URL and traversal form, as A', async () => {
    const b = await stored('b', PDF('b-dosya'));
    actAs('a');
    for (const k of [b.objectKey, `https://files.example.org/${b.objectKey}`, `${t.a}/../${b.objectKey}`, `${t.a}/%2e%2e/${b.objectKey}`, ` ${b.objectKey}`, `${t.a}//${b.objectKey}`]) {
      const r = await confirm(k);
      console.log('A3', JSON.stringify(k.slice(0, 40)), '->', JSON.stringify(r));
      expect(r.success).toBe(false);
    }
    // B's object must still be there (a refused confirm deletes nothing of B's)
    expect((await storeGet(b.objectKey)).bytes.length).toBeGreaterThan(0);
  });

  test('A4 presign argument confusion', async () => {
    actAs('a');
    const cases: unknown[][] = [
      ['__proto__', undefined, 10], ['x.constructor', undefined, 10], ['x.__proto__', undefined, 10],
      [['x.pdf'], 'application/pdf', 10], ['x.pdf', ['application/pdf'], 10], ['x.pdf', 'application/pdf', '10'],
      ['x.pdf', 'application/pdf', 1e20], ['x.pdf', 'Application/PDF', 10], ['x.pdf ', 'application/pdf', 10],
      ['x.pdf', 'application/pdf; charset=utf-8', 10], ['x.svg.pdf', 'application/pdf', 10], ['x.pdf', 'application/pdf', storage.EVIDENCE_MAX_BYTES],
    ];
    for (const c of cases) {
      const r = await (evidence.getPresignedUploadUrlAction as (...a: unknown[]) => Promise<{ success: boolean; objectKey?: string; error?: string }>)('certificate', ...c);
      if (r.success && r.objectKey) keys.push(r.objectKey);
      console.log('A4', JSON.stringify(c), '->', r.success ? `OK key=${r.objectKey}` : r.error);
    }
  });

  test('A5 PUT variations against a signed URL', async () => {
    actAs('a');
    const body = PDF('varyasyon');
    const p = await presign('v.pdf', 'application/pdf', body.length);
    const u = new URL(p.uploadUrl);
    const raw = async (headers: Record<string, string>, b: Buffer | ReadableStream = body, url = p.uploadUrl) => {
      const init: RequestInit & { duplex?: string } = { method: 'PUT', headers, body: b as BodyInit };
      if (b instanceof ReadableStream) init.duplex = 'half';
      const r = await fetch(url, init);
      return r.status;
    };
    const stream = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(body)); c.close(); } });
    console.log('A5 chunked (no content-length) ->', await raw({ 'Content-Type': 'application/pdf' }, stream()));
    console.log('A5 no content-type ->', await raw({}));
    console.log('A5 content-type with params ->', await raw({ 'Content-Type': 'application/pdf; charset=utf-8' }));
    console.log('A5 +Content-Disposition inline +x-amz-meta +Content-Encoding (unsigned) ->', await raw({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Content-Encoding': 'gzip', 'x-amz-meta-evil': '1', 'Cache-Control': 'public, max-age=31536000' }));
    try { const s = await storeGet(p.objectKey); console.log('A5 stored headers:', s.type, s.disp, s.enc, JSON.stringify(s.meta)); } catch (e) { console.log('A5 nothing stored', String(e)); }
    console.log('A5 +x-amz-acl public-read ->', await raw({ 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' }));
    const q2 = new URL(u); q2.searchParams.set('X-Amz-Expires', '604800');
    console.log('A5 Expires tampered ->', await raw({ 'Content-Type': 'application/pdf' }, body, q2.toString()));
    const q3 = new URL(u); q3.pathname = q3.pathname.replace(/[^/]+$/, 'other.pdf');
    console.log('A5 other key, same signature ->', await raw({ 'Content-Type': 'application/pdf' }, body, q3.toString()));
    console.log('A5 anonymous store GET ->', (await anonymousStoreGet(p.objectKey)).status);
    const list = await fetch(`${S3.endpoint}/${S3.bucket}?list-type=2`);
    console.log('A5 anonymous bucket LIST ->', list.status);
  });

  test('A6 download URL tampering and roles', async () => {
    const s = await stored('a', PDF('indir'));
    actAs('a');
    const loc = new URL((await callDownload(s.id)).headers.get('location')!);
    const tries: Record<string, URL> = {};
    const a = new URL(loc); a.searchParams.set('response-content-disposition', 'inline'); tries.inline = a;
    const b = new URL(loc); b.searchParams.set('response-content-type', 'text/html'); tries.addType = b;
    const c = new URL(loc); c.searchParams.set('X-Amz-Expires', '604800'); tries.expires = c;
    const d = new URL(loc); d.pathname = d.pathname.replace(t.a, t.b); tries.otherTenantPath = d;
    for (const [k, u] of Object.entries(tries)) console.log('A6', k, '->', (await fetch(u)).status);
    for (const role of ['MEMBER', 'GUEST_PARTNER', 'WRITER']) {
      state.role = role; actAs('a');
      const dl = await callDownload(s.id);
      const pr = await evidence.getPresignedUploadUrlAction('certificate', 'r.pdf', 'application/pdf', 10).catch((e) => ({ thrown: String(e).slice(0, 60) }));
      console.log('A6 role', role, 'download', dl.status, 'presign', JSON.stringify(pr).slice(0, 80));
      if ('objectKey' in pr && pr.objectKey) keys.push(pr.objectKey as string);
    }
    state.role = 'TENANT_OWNER';
  });

  test('A7 the dev upload route is closed whenever an object store is configured', async () => {
    actAs('a');
    const r = await mock.PUT(new Request(`http://localhost/api/evidence/mock-upload?key=${t.a}/x/y/2026/a_b.pdf`, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: PDF('m') }));
    console.log('A7 mock-upload with store ->', r.status);
    expect(r.status).toBe(404);
  });
});
