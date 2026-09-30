import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * TASK-MUO122UPRPJQH (İNCELEME-77 B-1) — confirm against a store that is slow,
 * down, or dies half-way, and a row save that fails.
 *
 * Confirm used to copy the staging object, delete it and check the copy inside
 * the row's interactive transaction. A store slower than Prisma's 5 s ended the
 * transaction; the catch deleted the copy as well, so the file was nowhere, and
 * the "DB offline" branch answered `success: true` with a made-up id. Now the
 * store calls run outside any transaction and the staging object is removed
 * only after the row is saved, so every failure below must leave: no row, the
 * staging object as uploaded, an error — and a second confirm that succeeds.
 *
 * The store is the MinIO of tests/evidence-upload-s3.live.test.ts (same
 * EVIDENCE_S3_TEST_* variables, same skip in CI, where the job has no S3
 * service), reached through an in-process HTTP proxy that injects the faults.
 */

const SUITE = 'evidence-confirm-store-faults.live';
const S3 = {
  endpoint: process.env.EVIDENCE_S3_TEST_ENDPOINT,
  accessKey: process.env.EVIDENCE_S3_TEST_ACCESS_KEY,
  secretKey: process.env.EVIDENCE_S3_TEST_SECRET_KEY,
  bucket: process.env.EVIDENCE_S3_TEST_BUCKET,
};
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `evflt-${Date.now().toString(36)}`;

type Fault = 'pass' | 'down' | 'dieAfterCopy' | 'slowAfterCopy';

const state = vi.hoisted(() => {
  // storage.ts builds its client when imported: point it at the proxy first.
  const e = process.env;
  const proxyPort = 41000 + (process.pid % 15000);
  if (e.EVIDENCE_S3_TEST_ENDPOINT) {
    e.R2_ACCOUNT_ID = 'minio-test';
    e.R2_ENDPOINT = `http://127.0.0.1:${proxyPort}`;
    e.R2_ACCESS_KEY_ID = e.EVIDENCE_S3_TEST_ACCESS_KEY;
    e.R2_SECRET_ACCESS_KEY = e.EVIDENCE_S3_TEST_SECRET_KEY;
    e.R2_BUCKET = e.EVIDENCE_S3_TEST_BUCKET;
  }
  return {
    proxyPort,
    rls: undefined as PrismaClient | undefined,
    session: null as null | { user: { id: string }; tenantId: string; role: string },
    fault: 'pass' as Fault,
    copied: false,
    /** Runs while the proxy holds a CopyObject request, before it is forwarded. */
    beforeCopy: null as null | (() => Promise<void>),
    /** Holds the row insert past the interactive transaction's 5 s. */
    stallCreate: false,
    requests: [] as string[],
  };
});

vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  // Only `evidence.create` is held: the pre-check and everything else run as usual.
  const stalling = <T extends object>(tx: T): T =>
    new Proxy(tx, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'evidence' || !state.stallCreate) return value;
        const delegate = value as { create: (args: unknown) => Promise<unknown> };
        return new Proxy(delegate, {
          get(d, m, r) {
            if (m !== 'create') return Reflect.get(d, m, r);
            return async (args: unknown) => {
              await new Promise((res) => setTimeout(res, 5_500));
              return d.create(args);
            };
          },
        });
      },
    });
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, (tx) => cb(stalling(tx))),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const evidence = await import('@/app/[locale]/(app)/[workspace]/evidence/actions');
const storage = await import('@/lib/storage');

let admin: PrismaClient | undefined;
let proxy: http.Server | undefined;
let ready = false;
let skipReason = '';
const t = { a: '', userA: '' };
const evidenceIds: string[] = [];
const keys: string[] = [];

const finalOf = (stagingKey: string) => stagingKey.replace(/^([^/]+)\/incoming\//, '$1/');
const PDF = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const put = (url: string, body: Buffer) =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: new Uint8Array(body) });

async function uploaded(name: string) {
  const body = PDF(name);
  const p = await evidence.getPresignedUploadUrlAction('certificate', `${name}.pdf`, 'application/pdf', body.length);
  if (!p.success) throw new Error(`presign refused: ${p.error}`);
  keys.push(p.objectKey, finalOf(p.objectKey));
  expect((await put(p.uploadUrl, body)).status).toBe(200);
  return { ...p, finalKey: finalOf(p.objectKey), body };
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

const rowsOf = (finalKey: string) => admin!.evidence.findMany({ where: { tenantId: t.a, r2ObjectKey: finalKey } });

/** The store as it is, read with the faults off. */
async function stored(key: string) {
  const fault = state.fault;
  state.fault = 'pass';
  try {
    return await storage.getObjectBytes(key);
  } finally {
    state.fault = fault;
  }
}

/** A failed confirm: an error, no row, and the upload still under its staging key. */
async function expectNothingLost(up: Awaited<ReturnType<typeof uploaded>>, res: Awaited<ReturnType<typeof confirm>>, error: string) {
  expect(res).toEqual({ success: false, error });
  expect(await rowsOf(up.finalKey)).toHaveLength(0);
  expect((await stored(up.objectKey))?.equals(up.body), 'the staging object is kept for the next try').toBe(true);
}

/** The retry: one row with the store's figures, the checked bytes under the final key, no staging object. */
async function expectRetrySucceeds(up: Awaited<ReturnType<typeof uploaded>>) {
  state.fault = 'pass';
  state.stallCreate = false;
  const res = await confirm(up.objectKey);
  expect(res.success).toBe(true);
  const rows = await rowsOf(up.finalKey);
  evidenceIds.push(...rows.map((r) => r.id));
  expect(rows).toHaveLength(1);
  expect(res.success && res.evidence && 'id' in res.evidence ? res.evidence.id : null).toBe(rows[0]?.id);
  expect(rows[0]?.fileSizeBytes).toBe(up.body.length);
  expect((await stored(up.finalKey))?.equals(up.body)).toBe(true);
  expect(await stored(up.objectKey), 'the staging object goes once the row is saved').toBeNull();
}

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

  const upstream = new URL(S3.endpoint);
  proxy = http.createServer(async (req, res) => {
    const isCopy = req.method === 'PUT' && Boolean(req.headers['x-amz-copy-source']);
    state.requests.push(`${req.method}${isCopy ? '(copy)' : ''} ${(req.url ?? '').split('?')[0]}`);
    if (state.fault === 'down' || (state.fault === 'dieAfterCopy' && state.copied)) {
      req.socket.destroy();
      return;
    }
    if (state.fault === 'slowAfterCopy' && state.copied) await sleep(6_000);
    if (isCopy && state.beforeCopy) {
      const hook = state.beforeCopy;
      state.beforeCopy = null;
      await hook();
    }
    const up = http.request(
      { host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: req.headers },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
        ur.on('end', () => {
          if (isCopy && (ur.statusCode ?? 0) < 300) state.copied = true;
        });
      }
    );
    up.on('error', () => res.destroy());
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => {
    proxy!.once('error', reject);
    proxy!.listen(state.proxyPort, '127.0.0.1', () => resolve());
  });

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

  const tenant = await admin.tenant.create({
    data: { name: `${RUN} Kurum`, slug: RUN, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  t.a = tenant.id;
  t.userA = (await admin.user.create({ data: { email: `${RUN}@example.invalid`, name: 'a' } })).id;
  ready = true;
});

beforeEach(({ skip }) => {
  if (!ready) skip(skipReason);
  state.session = { user: { id: t.userA }, tenantId: t.a, role: 'TENANT_OWNER' };
  state.fault = 'pass';
  state.copied = false;
  state.beforeCopy = null;
  state.stallCreate = false;
  state.requests = [];
});

afterAll(async () => {
  state.fault = 'pass';
  for (const key of keys) await storage.deleteObjectBytes(key).catch(() => {});
  if (admin) {
    await admin.evidence.deleteMany({ where: { id: { in: presentIds(evidenceIds) } } }).catch(() => {});
    for (const tenantId of presentIds([t.a])) {
      await admin.evidence.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } }).catch(() => {});
      await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
    await admin.user.deleteMany({ where: { id: { in: presentIds([t.userA]) } } }).catch(() => {});
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
  await new Promise((resolve) => (proxy ? proxy.close(resolve) : resolve(undefined)));
});

describe('B-1 (TASK-MUO122UPRPJQH): a slow or failing store never loses the upload', () => {
  test('crw-fb’s case: every store call after the copy takes 6 s — the confirm is slow, and it succeeds', async () => {
    const up = await uploaded('yavas');
    state.fault = 'slowAfterCopy';
    const res = await confirm(up.objectKey);
    expect(res.success, JSON.stringify(res)).toBe(true);
    const rows = await rowsOf(up.finalKey);
    evidenceIds.push(...rows.map((r) => r.id));
    expect(rows).toHaveLength(1);
    expect(res.success && res.evidence && 'id' in res.evidence ? res.evidence.id : null).toBe(rows[0]?.id);
    expect((await stored(up.finalKey))?.equals(up.body)).toBe(true);
    expect(await stored(up.objectKey)).toBeNull();
  }, 90_000);

  test('the row save outlives its transaction: save_failed, no row, the upload kept; the retry succeeds', async () => {
    const up = await uploaded('tx-suresi');
    state.stallCreate = true;
    const res = await confirm(up.objectKey);
    await expectNothingLost(up, res, 'save_failed');
    await expectRetrySucceeds(up);
  }, 60_000);

  test('the store is down before the copy: storage_unavailable, nothing lost; the retry succeeds', async () => {
    const up = await uploaded('kapali');
    state.fault = 'down';
    const res = await confirm(up.objectKey);
    await expectNothingLost(up, res, 'storage_unavailable');
    expect(state.requests.some((r) => r.startsWith('PUT(copy)')), 'no copy was attempted').toBe(false);
    await expectRetrySucceeds(up);
  }, 60_000);

  test('the store dies right after the copy: storage_unavailable, nothing lost; the retry succeeds', async () => {
    const up = await uploaded('kopya-sonrasi');
    state.fault = 'dieAfterCopy';
    const res = await confirm(up.objectKey);
    expect(state.copied, 'the copy did go through').toBe(true);
    await expectNothingLost(up, res, 'storage_unavailable');
    await expectRetrySucceeds(up);
  }, 60_000);

  test('the staging object is replaced between the check and the copy: the unchecked bytes never reach the final key', async () => {
    const up = await uploaded('degisen');
    const html = Buffer.from('<html>'.padEnd(up.body.length - 7, 'x') + '</html>');
    expect(html.length).toBe(up.body.length);
    // Same signed URL, type and length: the store takes it, mid-confirm.
    state.beforeCopy = async () => {
      expect((await put(up.uploadUrl, html)).status).toBe(200);
    };
    const res = await confirm(up.objectKey);
    expect(res).toEqual({ success: false, error: 'storage_unavailable' });
    expect(await rowsOf(up.finalKey)).toHaveLength(0);
    expect(await stored(up.finalKey), 'the copy was refused, the final key holds nothing').toBeNull();

    // The next confirm checks what is there now, and refuses it for good.
    expect(await confirm(up.objectKey)).toEqual({ success: false, error: 'unsupported_type' });
    expect(await stored(up.objectKey)).toBeNull();
    expect(await stored(up.finalKey)).toBeNull();
    expect(await rowsOf(up.finalKey)).toHaveLength(0);
  }, 60_000);

  test('positive control: through the same proxy with no fault, one confirm is one row and no staging object', async () => {
    const up = await uploaded('temiz');
    await expectRetrySucceeds(up);
    expect(state.requests.filter((r) => r.startsWith('PUT(copy)'))).toHaveLength(1);
  });
});
