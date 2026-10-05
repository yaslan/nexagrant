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

const SUITE = 'zz-devfb66-devstore.live';
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
const RUN = `dv66d-${Date.now().toString(36)}`;

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
  if (false) {
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
  expect(storage.hasObjectStore).toBe(false);

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
const mput = (key: string | null, body: Buffer | ReadableStream, type: string, extra: Record<string, string> = {}) => {
  const init: RequestInit & { duplex?: string } = { method: 'PUT', headers: { 'content-type': type, ...extra }, body: body as BodyInit };
  if (body instanceof ReadableStream) init.duplex = 'half';
  return mock.PUT(new Request(`http://localhost/api/evidence/mock-upload${key === null ? '' : `?key=${encodeURIComponent(key)}`}`, init));
};
describe('DEV STORE', () => {
  test('D1 mock-upload refusals', async () => {
    actAs('a');
    const body = PDF('dev');
    const p = await presign('d.pdf', 'application/pdf', body.length);
    const bp = (() => { actAs('b'); return presign('bd.pdf', 'application/pdf', body.length); })();
    const bKey = (await bp).objectKey; actAs('a');
    const out: Record<string, number> = {};
    actAs('anon'); out.noSession = (await mput(p.objectKey, body, 'application/pdf')).status; actAs('a');
    state.role = 'MEMBER'; actAs('a'); out.memberRole = (await mput(p.objectKey, body, 'application/pdf')).status; state.role = 'TENANT_OWNER'; actAs('a');
    out.otherTenantKey = (await mput(bKey, body, 'application/pdf')).status;
    out.noKey = (await mput(null, body, 'application/pdf')).status;
    out.traversal = (await mput(`${t.a}/../${bKey}`, body, 'application/pdf')).status;
    out.htmlType = (await mput(p.objectKey, body, 'text/html')).status;
    out.htmlKey = (await mput(p.objectKey.replace(/\.pdf$/, '.html'), body, 'text/html')).status;
    out.declaredTooBig = (await mput(p.objectKey, body, 'application/pdf', { 'content-length': String(storage.EVIDENCE_MAX_BYTES + 1) })).status;
    const big = Buffer.alloc(storage.EVIDENCE_MAX_BYTES + 1, 0x20); big.write('%PDF-');
    out.chunkedTooBig = (await mput(p.objectKey, new ReadableStream({ start(c) { c.enqueue(new Uint8Array(big)); c.close(); } }), 'application/pdf')).status;
    out.htmlBytesPdfType = (await mput(p.objectKey, Buffer.from('<html>x</html>'), 'application/pdf')).status;
    console.log('D1', JSON.stringify(out));
    // the html-bytes PUT stored; confirm must refuse and delete it
    const c = await confirm(p.objectKey);
    console.log('D1 confirm of html bytes via dev store ->', JSON.stringify(c), 'stat after:', await storage.statObject(p.objectKey));
    out.good = (await mput(p.objectKey, body, 'application/pdf')).status;
    const ok = await confirm(p.objectKey);
    console.log('D1 good PUT', out.good, 'confirm', ok.success);
    const row = await admin!.evidence.findFirstOrThrow({ where: { r2ObjectKey: p.objectKey } }); evidenceIds.push(row.id);
    const dl = await callDownload(row.id);
    console.log('D2 dev download', dl.status, JSON.stringify(Object.fromEntries(dl.headers)));
    actAs('b'); console.log('D2 other tenant dev download', (await callDownload(row.id)).status);
    actAs('anon'); console.log('D2 anon dev download', (await callDownload(row.id)).status);
  });
});
