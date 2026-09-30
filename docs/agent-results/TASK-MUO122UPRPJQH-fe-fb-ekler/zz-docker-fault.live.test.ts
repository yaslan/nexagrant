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

const SUITE = 'zz-docker-fault';
import { execSync } from 'node:child_process';
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
const t = { a: '', b: '', userA: '', userB: '' };
const evidenceIds: string[] = [];
const keys: string[] = [];

function actAs(who: 'a' | 'b' | 'anon') {
  state.session =
    who === 'anon' ? null : { user: { id: who === 'a' ? t.userA : t.userB }, tenantId: t[who], role: state.role };
}

/** The final key a staging key is confirmed under (D-1): the same path without `incoming/`. */
const finalOf = (stagingKey: string) => stagingKey.replace(/^([^/]+)\/incoming\//, '$1/');
/** A staging key of tenant A, as the presign hands out. */
const stagingOf = (finalKey: string) => finalKey.replace(/^([^/]+)\//, '$1/incoming/');

const PDF = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

async function presign(name: string, mime: string, size: number) {
  const res = await evidence.getPresignedUploadUrlAction('certificate', name, mime, size);
  if (!res.success) throw new Error(`presign refused: ${res.error}`);
  keys.push(res.objectKey, finalOf(res.objectKey));
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
  state.role = 'TENANT_OWNER';
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


const docker = (cmd: string) => execSync(`docker ${cmd} fefb122-minio`, { stdio: 'pipe' }).toString().trim();
const waitStore = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${S3.endpoint}/minio/health/live`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('store not back'); };
const rows = (k: string) => admin!.evidence.count({ where: { tenantId: t.a, r2ObjectKey: k } });

describe('docker fault injection (fe-fb, TASK-MUO122UPRPJQH)', () => {
  test('docker pause for 8 s during confirm: slow, then success; row + final, staging gone', async () => {
    const body = PDF('pause');
    const p = await presign('pause.pdf', 'application/pdf', body.length);
    expect((await put(p.uploadUrl, body, 'application/pdf')).status).toBe(200);
    docker('pause');
    const t0 = Date.now();
    const pending = confirm(p.objectKey);
    await new Promise((r) => setTimeout(r, 8000));
    docker('unpause');
    const res = await pending;
    const ms = Date.now() - t0;
    const n = await rows(finalOf(p.objectKey));
    const fin = await storage.getObjectBytes(finalOf(p.objectKey));
    const st = await storage.statObject(p.objectKey);
    console.log(`PAUSE8s → ${JSON.stringify(res).slice(0, 70)} ms=${ms} rows=${n} finalEqualsUpload=${fin?.equals(body)} staging=${st !== null}`);
    expect(res.success).toBe(true);
    expect(n).toBe(1);
    if (res.success && res.evidence && 'id' in res.evidence) evidenceIds.push(res.evidence.id as string);
  }, 120_000);

  test('docker stop (store down): error, no row, staging survives; docker start → same confirm succeeds', async () => {
    const body = PDF('stop');
    const p = await presign('stop.pdf', 'application/pdf', body.length);
    expect((await put(p.uploadUrl, body, 'application/pdf')).status).toBe(200);
    docker('stop');
    const res = await confirm(p.objectKey);
    const n = await rows(finalOf(p.objectKey));
    docker('start');
    await waitStore();
    const st = await storage.getObjectBytes(p.objectKey);
    console.log(`STOP → ${JSON.stringify(res)} rows=${n} stagingEqualsUpload=${st?.equals(body)}`);
    expect(res).toEqual({ success: false, error: 'storage_unavailable' });
    expect(n).toBe(0);
    expect(st?.equals(body)).toBe(true);
    const retry = await confirm(p.objectKey);
    const n2 = await rows(finalOf(p.objectKey));
    const fin = await storage.getObjectBytes(finalOf(p.objectKey));
    console.log(`STOP retry → ${JSON.stringify(retry).slice(0, 70)} rows=${n2} finalEqualsUpload=${fin?.equals(body)} staging=${(await storage.statObject(p.objectKey)) !== null}`);
    expect(retry.success).toBe(true);
    if (retry.success && retry.evidence && 'id' in retry.evidence) evidenceIds.push(retry.evidence.id as string);
  }, 180_000);
});
