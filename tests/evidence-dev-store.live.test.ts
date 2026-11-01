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

const SUITE = 'evidence-dev-store.live';
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
    /** Makes the row insert of confirm fail, as a database error would. */
    failCreate: false,
  };
});

vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  const failingCreate = <T extends object>(tx: T): T =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'evidence' || !state.failCreate) return value;
        return new Proxy(value as object, {
          get(d, m, r) {
            if (m !== 'create') return Reflect.get(d, m, r);
            return async () => {
              throw new Error('injected: the row insert failed');
            };
          },
        });
      },
    });
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1], opts?: Parameters<typeof actual.withTenant>[2]) =>
      actual.withTenantOn(state.rls!, tenantId, (tx) => cb(failingCreate(tx)), opts),
    // Confirm's own pool (TASK-MUO9IFMMVRUDJ); the pool itself is tested in evidence-confirm-store-faults.
    withTenantLockPool: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1], opts?: Parameters<typeof actual.withTenant>[2]) =>
      actual.withTenantOn(state.rls!, tenantId, (tx) => cb(failingCreate(tx)), opts),
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
  state.failCreate = false;
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

describe('mock-upload refuses what a signed R2 PUT would refuse', () => {
  test('no session, a role without edit_proposal, another tenant’s key, no key, a traversal, a final key', async () => {
    const body = PDF('ret');
    const p = await presign('ret.pdf', body.length);
    actAs('b');
    const bKey = (await presign('b.pdf', body.length)).objectKey;
    actAs('anon');
    expect((await mput(p.objectKey, body, 'application/pdf')).status, 'no session').toBe(401);
    state.role = 'MEMBER';
    actAs('a');
    expect((await mput(p.objectKey, body, 'application/pdf')).status, 'MEMBER').toBe(403);
    state.role = 'GUEST_PARTNER';
    actAs('a');
    expect((await mput(p.objectKey, body, 'application/pdf')).status, 'GUEST_PARTNER').toBe(403);
    state.role = 'TENANT_OWNER';
    actAs('a');
    for (const key of [bKey, null, `${t.a}/../${bKey}`, `${t.a}/incoming/../${finalOf(p.objectKey)}`, finalOf(p.objectKey)]) {
      expect((await mput(key, body, 'application/pdf')).status, String(key)).toBe(403);
    }
    expect(await storage.statObject(p.objectKey), 'nothing was stored').toBeNull();
    expect(await storage.statObject(finalOf(p.objectKey))).toBeNull();
  });

  test('a type outside the list or not the key’s, and a body over the limit, declared or streamed', async () => {
    const body = PDF('tur');
    const p = await presign('tur.pdf', body.length);
    expect((await mput(p.objectKey, body, 'text/html')).status).toBe(415);
    expect((await mput(p.objectKey.replace(/\.pdf$/, '.html'), body, 'text/html')).status).toBe(415);
    expect(
      (await mput(p.objectKey, body, 'application/pdf', { 'content-length': String(storage.EVIDENCE_MAX_BYTES + 1) })).status
    ).toBe(413);
    const big = Buffer.alloc(storage.EVIDENCE_MAX_BYTES + 1, 0x20);
    big.write('%PDF-');
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(big));
        c.close();
      },
    });
    expect((await mput(p.objectKey, stream, 'application/pdf')).status).toBe(413);
    expect(await storage.statObject(p.objectKey)).toBeNull();
  }, 60_000);

  test('exactly 25 MB is accepted: the limit is inclusive', async () => {
    const exact = Buffer.alloc(storage.EVIDENCE_MAX_BYTES, 0x20);
    exact.write('%PDF-');
    const p = await presign('tam.pdf', exact.length);
    expect((await mput(p.objectKey, exact, 'application/pdf')).status).toBe(200);
    const res = await confirm(p.objectKey);
    expect(res.success).toBe(true);
    const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    evidenceIds.push(row.id);
    expect(row.fileSizeBytes).toBe(storage.EVIDENCE_MAX_BYTES);
  }, 60_000);

  test('bytes that are not the key’s type are stored by the route and refused by confirm, which removes them', async () => {
    const p = await presign('sahte.pdf', 14);
    expect((await mput(p.objectKey, Buffer.from('<html>x</html>'), 'application/pdf')).status).toBe(200);
    expect(await confirm(p.objectKey)).toEqual({ success: false, error: 'unsupported_type' });
    expect(await storage.statObject(p.objectKey)).toBeNull();
    expect(await storage.statObject(finalOf(p.objectKey))).toBeNull();
    expect(await admin!.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } })).toBe(0);
  });
});

describe('the download route serving the dev store', () => {
  test('always an attachment, octet-stream, sandboxed and not cached; other tenants 404, no session 401', async () => {
    const body = PDF('indir');
    const p = await presign('indir.pdf', body.length);
    expect((await mput(p.objectKey, body, 'application/pdf')).status).toBe(200);
    expect((await confirm(p.objectKey)).success).toBe(true);
    const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    evidenceIds.push(row.id);

    const res = await callDownload(row.id);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="belge.pdf"');
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);

    actAs('b');
    expect((await callDownload(row.id)).status).toBe(404);
    actAs('anon');
    expect((await callDownload(row.id)).status).toBe(401);
    state.role = 'GUEST_PARTNER';
    actAs('a');
    expect((await callDownload(row.id)).status).toBe(403);
  });

  test('D-1 on the dev store: a PUT after confirm does not reach the recorded file', async () => {
    const body = PDF('dev-a1');
    const p = await presign('dev-a1.pdf', body.length);
    expect((await mput(p.objectKey, body, 'application/pdf')).status).toBe(200);
    expect((await confirm(p.objectKey)).success).toBe(true);
    const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    evidenceIds.push(row.id);

    const html = Buffer.from('<html>'.padEnd(body.length - 7, 'x') + '</html>');
    expect((await mput(p.objectKey, html, 'application/pdf')).status).toBe(200);
    expect(await confirm(p.objectKey)).toEqual({ success: false, error: 'already_confirmed' });
    expect(Buffer.from(await (await callDownload(row.id)).arrayBuffer()).equals(body)).toBe(true);
    expect(await storage.statObject(p.objectKey), 'the second staging object is removed').toBeNull();
  });
});

describe('B-1 on the dev store (TASK-MUO64MVW8TLMX, İNCELEME-82 T-2)', () => {
  test('the row save fails: save_failed, no row, the staging file kept as uploaded; the retry succeeds', async () => {
    const body = PDF('dev-satir');
    const p = await presign('dev-satir.pdf', body.length);
    expect((await mput(p.objectKey, body, 'application/pdf')).status).toBe(200);

    state.failCreate = true;
    expect(await confirm(p.objectKey)).toEqual({ success: false, error: 'save_failed' });
    expect(await admin!.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } })).toBe(0);
    // The dev store copies, it does not move: the user's only copy is still there.
    expect((await storage.getObjectBytes(p.objectKey))?.equals(body), 'the staging file is kept for the next try').toBe(true);

    state.failCreate = false;
    expect((await confirm(p.objectKey)).success).toBe(true);
    const row = await admin!.evidence.findFirstOrThrow({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    evidenceIds.push(row.id);
    expect(row.fileSizeBytes).toBe(body.length);
    expect((await storage.getObjectBytes(finalOf(p.objectKey)))?.equals(body)).toBe(true);
    expect(await storage.statObject(p.objectKey), 'the staging file goes once the row is saved').toBeNull();
  });
});

describe('the FormData path checks the bytes too (M18)', () => {
  test('HTML named .pdf and typed application/pdf is not stored, and the row gets no key', async () => {
    const form = new FormData();
    form.set('title', `${RUN} sahte form`);
    form.set('file', new File(['<html><script>1</script></html>'], 'rapor.pdf', { type: 'application/pdf' }));
    const created = (await evidence.createEvidence(form)) as { id: string };
    evidenceIds.push(created.id);
    const row = await admin!.evidence.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.r2ObjectKey).toBeNull();
    expect(row.mimeType).toBeNull();
  });

  test('positive control: a real PDF through the same path is stored under the row’s key', async () => {
    const form = new FormData();
    form.set('title', `${RUN} gercek form`);
    form.set('file', new File([new Uint8Array(PDF('form'))], 'rapor.pdf', { type: 'application/pdf' }));
    const created = (await evidence.createEvidence(form)) as { id: string };
    evidenceIds.push(created.id);
    const row = await admin!.evidence.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.r2ObjectKey).not.toBeNull();
    keys.push(row.r2ObjectKey!);
    expect((await storage.getObjectBytes(row.r2ObjectKey!))!.equals(PDF('form'))).toBe(true);
  });
});
