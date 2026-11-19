import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';
import { DOCX_MIME, eicarDocx } from './helpers/eicar';

/**
 * NG-239 — virus scan of uploaded evidence (§18.3, K-584154 = A).
 *
 * The rule under test: a file whose scan has not ended CLEAN leaves through no
 * download path. Every upload path writes the same `Evidence` row, so each one
 * is driven for real here and then read through the one download route:
 *
 *   U1 + U4 + U2  presign → PUT to the dev stand-in (`/api/evidence/mock-upload`)
 *                 → `confirmEvidenceUploadAction`
 *   U3            the FormData fallback `createEvidence`
 *   D1            `GET /api/evidence/[id]/download` (dev-store branch here; the
 *                 presigned-GET branch is in evidence-upload-s3.live.test.ts)
 *
 * The infected file is EICAR inside a `.docx` (tests/helpers/eicar.ts), never
 * real malware.
 *
 * No object store: R2 is switched off before `storage.ts` is imported, so the
 * bytes land in `.dev-objects`. Only the session is replaced; the actions and
 * the route run for real over `fabrika_app` (NOBYPASSRLS).
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`.
 */

const SUITE = 'evidence-scan.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `evscan-${Date.now().toString(36)}`;

const state = vi.hoisted(() => {
  for (const k of ['R2_ACCOUNT_ID', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k];
  return {
    rls: undefined as PrismaClient | undefined,
    session: null as null | { user: { id: string }; tenantId: string; role: string },
  };
});

vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1], opts?: Parameters<typeof actual.withTenant>[2]) =>
      actual.withTenantOn(state.rls!, tenantId, cb, opts),
    withTenantLockPool: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1], opts?: Parameters<typeof actual.withTenant>[2]) =>
      actual.withTenantOn(state.rls!, tenantId, cb, opts),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const evidence = await import('@/app/[locale]/(app)/[workspace]/evidence/actions');
const download = await import('@/app/api/evidence/[id]/download/route');
const mock = await import('@/app/api/evidence/mock-upload/route');
const storage = await import('@/lib/storage');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const t = { tenant: '', user: '' };
const keys: string[] = [];

const finalOf = (stagingKey: string) => stagingKey.replace(/^([^/]+)\/incoming\//, '$1/');

const callDownload = (id: string) =>
  download.GET(new Request(`http://localhost/api/evidence/${id}/download`), { params: Promise.resolve({ id }) });

/** U1 + U4 + U2: the browser's path, end to end, as the upload screen drives it. */
async function uploadPresigned(name: string, body: Buffer) {
  const p = await evidence.getPresignedUploadUrlAction('certificate', name, DOCX_MIME, body.length);
  if (!p.success) throw new Error(`presign refused: ${p.error}`);
  keys.push(p.objectKey, finalOf(p.objectKey));
  const put = await mock.PUT(
    new Request(`http://localhost/api/evidence/mock-upload?key=${encodeURIComponent(p.objectKey)}`, {
      method: 'PUT',
      headers: { 'content-type': p.contentType },
      body: new Uint8Array(body),
    })
  );
  expect(put.status, 'dev PUT stored the bytes').toBeLessThan(300);
  const res = await evidence.confirmEvidenceUploadAction({
    title: `${RUN} ${name}`,
    category: 'CAT-03',
    objectKey: p.objectKey,
    fileName: name,
    fileSizeBytes: body.length,
    mimeType: DOCX_MIME,
  });
  if (!res.success || !res.evidence) throw new Error(`confirm refused: ${'error' in res ? res.error : '?'}`);
  return res.evidence.id as string;
}

/** U3: the FormData fallback. */
async function uploadFormData(name: string, body: Buffer) {
  const fd = new FormData();
  fd.set('title', `${RUN} ${name}`);
  fd.set('category', 'CAT-03');
  fd.set('file', new File([new Uint8Array(body)], name, { type: DOCX_MIME }));
  const row = (await evidence.createEvidence(fd)) as { id: string; r2ObjectKey?: string | null };
  expect(row.id.startsWith('ev-mock-'), 'a real row was written').toBe(false);
  if (row.r2ObjectKey) keys.push(row.r2ObjectKey);
  return row.id;
}

beforeAll(async () => {
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
  expect(storage.hasObjectStore, 'this suite is about the dev store').toBe(false);

  const tenant = await admin.tenant.create({
    data: { name: `${RUN} Kurum`, slug: RUN, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  t.tenant = tenant.id;
  const user = await admin.user.create({ data: { email: `${RUN}@example.invalid`, name: 'scan' } });
  t.user = user.id;
  ready = true;
});

beforeEach(({ skip }) => {
  if (!ready) skip(skipReason);
  state.session = { user: { id: t.user }, tenantId: t.tenant, role: 'TENANT_OWNER' };
});

afterAll(async () => {
  for (const key of keys) await storage.deleteObjectBytes(key).catch(() => {});
  if (admin) {
    for (const tenantId of presentIds([t.tenant])) {
      const rows = await admin.evidence
        .findMany({ where: { tenantId: requireId(tenantId, 'tenantId') }, select: { r2ObjectKey: true } })
        .catch(() => []);
      for (const r of rows) if (r.r2ObjectKey) await storage.deleteObjectBytes(r.r2ObjectKey).catch(() => {});
      await admin.evidence.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } }).catch(() => {});
      await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
    await admin.user.deleteMany({ where: { id: { in: presentIds([t.user]) } } }).catch(() => {});
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
});

describe('NG-239: an EICAR upload that has not been scanned does not download', () => {
  test('U1+U4+U2 (presign → PUT → confirm): EICAR is stored, and D1 refuses it with 409', async () => {
    const id = await uploadPresigned('eicar-presigned.docx', eicarDocx());
    const res = await callDownload(id);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.includes(Buffer.from('EICAR-STANDARD')), 'the EICAR bytes must not leave').toBe(false);
    expect(res.status).toBe(409);
  });

  test('U3 (FormData fallback): EICAR is stored, and D1 refuses it with 409', async () => {
    const id = await uploadFormData('eicar-formdata.docx', eicarDocx());
    const res = await callDownload(id);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.includes(Buffer.from('EICAR-STANDARD')), 'the EICAR bytes must not leave').toBe(false);
    expect(res.status).toBe(409);
  });
});
