import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * TASK-MUNTTZ94LJWBC (İNCELEME-66 D-4) — the development upload path, which
 * had no test of its own: `/api/evidence/mock-upload` (the stand-in for a
 * presigned R2 PUT), the download route's own headers when it serves the dev
 * store's bytes, the exact 25 MB limit, and the byte check on the FormData
 * path. Mutants M11–M14, M16 and M18 of that review survived every suite.
 *
 * No object store: R2 is switched off before `storage.ts` is imported, so the
 * bytes land in `.dev-objects` and every "stored" / "not stored" below is a
 * file on disk. Only the session is replaced; `requireTenantApi` and
 * `requireTenantAction` run for real, over `fabrika_app` (NOBYPASSRLS).
 * The production gate (M11) is `evidence-mock-upload-gate.test.ts`.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'zz-crwfb77-dev';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `evd-${Date.now().toString(36)}`;

const state = vi.hoisted(() => {
  // The dev store stands in for R2 only when no R2 account is configured; a
  // suite earlier in the same worker may have pointed these at MinIO.
  for (const k of ['R2_ACCOUNT_ID', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k];
  return {
    rls: undefined as PrismaClient | undefined,
    session: null as null | { user: { id: string }; tenantId: string; role: string },
    role: 'TENANT_OWNER',
  };
});

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
const mock = await import('@/app/api/evidence/mock-upload/route');
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

const PDF = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const finalOf = (stagingKey: string) => stagingKey.replace(/^([^/]+)\/incoming\//, '$1/');

async function presign(name: string, size: number) {
  const res = await evidence.getPresignedUploadUrlAction('certificate', name, 'application/pdf', size);
  if (!res.success) throw new Error(`presign refused: ${res.error}`);
  keys.push(res.objectKey, finalOf(res.objectKey));
  return res;
}

/** A PUT to the dev stand-in, as the browser makes it with the URL presign returned. */
function mput(key: string | null, body: Buffer | ReadableStream, type: string, extra: Record<string, string> = {}) {
  const init: RequestInit & { duplex?: string } = { method: 'PUT', headers: { 'content-type': type, ...extra }, body: body as BodyInit };
  if (body instanceof ReadableStream) init.duplex = 'half';
  const q = key === null ? '' : `?key=${encodeURIComponent(key)}`;
  return mock.PUT(new Request(`http://localhost/api/evidence/mock-upload${q}`, init));
}

const confirm = (objectKey: string) =>
  evidence.confirmEvidenceUploadAction({
    title: `${RUN} upload`,
    category: 'CAT-03',
    objectKey,
    fileName: 'belge.pdf',
    fileSizeBytes: 10,
    mimeType: 'application/pdf',
  });

const callDownload = (id: string) =>
  download.GET(new Request(`http://localhost/api/evidence/${id}/download`), { params: Promise.resolve({ id }) });

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
  for (const key of keys) await storage.deleteObjectBytes(key).catch(() => {});
  if (admin) {
    const rows = await admin.evidence
      .findMany({ where: { id: { in: presentIds(evidenceIds) } }, select: { r2ObjectKey: true } })
      .catch(() => []);
    for (const r of rows) if (r.r2ObjectKey) await storage.deleteObjectBytes(r.r2ObjectKey).catch(() => {});
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


describe('crw-fb 77: nested incoming in the dev store', () => {
  test('staging <t>/incoming/incoming/x.pdf → recorded final key is itself a staging key', async () => {
    const nested = `${t.a}/incoming/incoming/org-default/certificate/2026/deadbeef_n_pdf.pdf`;
    const recorded = `${t.a}/incoming/org-default/certificate/2026/deadbeef_n_pdf.pdf`;
    keys.push(nested, recorded, `${t.a}/org-default/certificate/2026/deadbeef_n_pdf.pdf`);
    const body = PDF('asil');
    console.log('PUT nested staging →', (await mput(nested, body, 'application/pdf')).status);
    const r = await confirm(nested);
    console.log('confirm nested →', JSON.stringify(r).slice(0, 60));
    const row = await admin!.evidence.findFirst({ where: { tenantId: t.a, r2ObjectKey: recorded }, select: { id: true, r2ObjectKey: true } });
    console.log('row key =', row?.r2ObjectKey?.replace(t.a, 'A'));
    const evil = Buffer.from('<html><script>alert(1)</script>'.padEnd(body.length, ' '));
    console.log('PUT to recorded key (after confirm) →', (await mput(recorded, evil, 'application/pdf')).status);
    const d = await callDownload(row!.id);
    const bytes = Buffer.from(await d.arrayBuffer()).toString('latin1').slice(0, 20);
    console.log('download after replace →', d.status, JSON.stringify(bytes));
    // and a second confirm of the recorded key moves the file out from under row 1
    const r2 = await confirm(recorded);
    console.log('confirm recorded key →', JSON.stringify(r2).slice(0, 60));
    const d2 = await callDownload(row!.id);
    console.log('row-1 download after move →', d2.status);
    evidenceIds.push(row!.id);
  });
});
