import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';
import { DOCX_MIME, cleanDocx, eicarDocx } from './helpers/eicar';

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
const scanner = await import('@/lib/evidence-scan');

/**
 * The real clamd for the scan tests (docker compose --profile scan up -d clamav).
 * `.env` keeps CLAMD_HOST blank, so it comes from the shell: NG239_CLAMD_HOST or
 * CLAMD_HOST. Without one the real-clamd tests skip (CI has no clamd service);
 * the clamd-down tests always run.
 */
const CLAMD_HOST = process.env.NG239_CLAMD_HOST || process.env.CLAMD_HOST || '';
const CLAMD_PORT = Number(process.env.NG239_CLAMD_PORT || process.env.CLAMD_PORT || 3310);
/** Nothing listens here: the scan sees "connection refused", as with clamd stopped. */
const DOWN = { host: '127.0.0.1', port: 9, timeoutMs: 3000 };

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const t = { tenant: '', user: '' };
const keys: string[] = [];
const alertIds: string[] = [];

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
    await admin.systemAlert.deleteMany({ where: { id: { in: alertIds } } }).catch(() => {});
    await admin
      .$queryRawUnsafe(
        `select graphile_worker.remove_job(key)::text from graphile_worker.jobs where task_identifier = 'evidence-scan' and payload->>'tenantId' = $1 and key is not null`,
        t.tenant
      )
      .catch(() => {});
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

/** Jobs the uploads queued in this run's database (no worker runs here). */
async function queuedScanKeys(evidenceId: string): Promise<string[]> {
  const rows = await admin!.$queryRawUnsafe<{ key: string }[]>(
    `select key from graphile_worker.jobs where key like $1 order by key`,
    `evidence-scan:${evidenceId}:%`
  );
  return rows.map((r) => r.key);
}

async function dropQueuedScans(evidenceId: string) {
  await admin!
    .$queryRawUnsafe(`select graphile_worker.remove_job(key)::text from graphile_worker.jobs where key like $1`, `evidence-scan:${evidenceId}:%`)
    .catch(() => {});
}

const rowOf = (id: string) =>
  admin!.evidence.findUniqueOrThrow({
    where: { id },
    select: { scanStatus: true, scannedAt: true, scanSignature: true, scanAttempts: true, r2ObjectKey: true },
  });

describe('NG-239: every upload path writes PENDING and queues a scan', () => {
  test.each([
    ['U1+U4+U2 presign → PUT → confirm', uploadPresigned],
    ['U3 FormData', uploadFormData],
  ])('%s: the row is PENDING, attempt 0 is queued, D1 answers 409 EVIDENCE_SCAN_PENDING', async (_name, upload) => {
    const id = await upload(`pending-${_name.slice(0, 2)}.docx`, cleanDocx('beklemede'));
    try {
      expect((await rowOf(id)).scanStatus).toBe('PENDING');
      expect(await queuedScanKeys(id)).toEqual([`evidence-scan:${id}:0`]);
      const res = await callDownload(id);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_PENDING' });
    } finally {
      await dropQueuedScans(id);
    }
  });
});

describe.skipIf(!CLAMD_HOST)(`NG-239 against a real clamd (${CLAMD_HOST || 'not configured'}:${CLAMD_PORT})`, () => {
  const clamd = { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 60_000 };

  test.each([
    ['U1+U4+U2', uploadPresigned],
    ['U3', uploadFormData],
  ])('%s: a clean file is scanned CLEAN and then downloads, bytes intact', async (name, upload) => {
    const body = cleanDocx(`temiz ${name}`);
    const id = await upload(`clean-${name.slice(0, 2)}.docx`, body);
    await dropQueuedScans(id);
    const out = await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd, enqueue: async () => true });
    expect(out).toEqual({ status: 'CLEAN' });
    const row = await rowOf(id);
    expect(row.scanStatus).toBe('CLEAN');
    expect(row.scannedAt).not.toBeNull();
    expect(row.scanSignature).toBeNull();

    const res = await callDownload(id);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);
    // A second run of the same attempt changes nothing.
    expect(await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd })).toEqual({ skipped: 'already_final' });
  });

  test.each([
    ['U1+U4+U2', uploadPresigned],
    ['U3', uploadFormData],
  ])('%s: EICAR is INFECTED, its object deleted, an AuditEvent and a SystemAlert written, D1 answers 409', async (name, upload) => {
    const since = new Date();
    const id = await upload(`eicar-${name.slice(0, 2)}.docx`, eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    expect(await storage.statObject(key), 'stored before the scan').not.toBeNull();

    const out = await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd, enqueue: async () => true });
    expect(out).toMatchObject({ status: 'INFECTED', objectDeleted: true });
    expect('signature' in out && out.signature).toMatch(/Eicar/i);

    const row = await rowOf(id);
    expect(row.scanStatus).toBe('INFECTED');
    expect(row.scanSignature).toMatch(/Eicar/i);
    expect(await storage.statObject(key), 'the infected object is gone from the store').toBeNull();

    const audit = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.infected', target: id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.data).toMatchObject({ objectDeleted: true });

    const alerts = await admin!.systemAlert.findMany({ where: { source: 'evidence-scan', level: 'error', createdAt: { gte: since } } });
    const mine = alerts.filter((a) => (a.meta as { evidenceId?: string } | null)?.evidenceId === id);
    expect(mine, 'one SystemAlert for this file').toHaveLength(1);
    // SystemAlert has no tenant isolation: neither the tenant id nor the file name is in it.
    expect(JSON.stringify(mine[0])).not.toContain(t.tenant);
    expect(JSON.stringify(mine[0])).not.toContain('eicar-');
    alertIds.push(...mine.map((a) => a.id));

    const res = await callDownload(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_INFECTED' });
  });
});

describe('NG-239: clamd down or silent → ERROR, no download, a retry', () => {
  test.each([
    ['U1+U4+U2', uploadPresigned],
    ['U3', uploadFormData],
  ])('%s: refused connection → ERROR, attempt 1 queued after 1 minute, D1 answers 409 EVIDENCE_SCAN_ERROR', async (name, upload) => {
    const id = await upload(`down-${name.slice(0, 2)}.docx`, cleanDocx('clamd yok'));
    await dropQueuedScans(id);
    const queued: { run: unknown; runAt?: Date }[] = [];
    const now = new Date('2026-11-19T10:00:00Z');
    const out = await scanner.scanEvidence(
      { tenantId: t.tenant, evidenceId: id, attempt: 0 },
      { clamd: DOWN, now: () => now, enqueue: async (run, runAt) => (queued.push({ run, runAt }), true) }
    );
    expect(out).toMatchObject({ status: 'ERROR', retryQueued: true });
    expect('reason' in out && out.reason).toMatch(/^unreachable/);
    expect(queued).toEqual([{ run: { tenantId: t.tenant, evidenceId: id, attempt: 1 }, runAt: new Date(now.getTime() + 60_000) }]);
    const row = await rowOf(id);
    expect(row.scanStatus).toBe('ERROR');
    expect(row.scanAttempts).toBe(1);

    const res = await callDownload(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_ERROR' });

    // The run queued for attempt 0 again is stale and writes nothing.
    expect(await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd: DOWN })).toEqual({ skipped: 'stale_attempt' });
  });

  test('no CLAMD_HOST at all is ERROR too (not "clean by default")', async () => {
    const id = await uploadFormData('nohost.docx', cleanDocx('host yok'));
    await dropQueuedScans(id);
    const out = await scanner.scanEvidence(
      { tenantId: t.tenant, evidenceId: id, attempt: 0 },
      { scan: async () => ({ verdict: 'error', reason: 'not_configured' }), enqueue: async () => true }
    );
    expect(out).toMatchObject({ status: 'ERROR', reason: 'not_configured' });
    expect((await callDownload(id)).status).toBe(409);
  });

  test('the retries run out: ERROR stays, a warn SystemAlert says so, the sweep tries again 6 h later', async () => {
    const since = new Date();
    const id = await uploadFormData('exhausted.docx', cleanDocx('tükendi'));
    await dropQueuedScans(id);
    const waits = scanner.EVIDENCE_SCAN_RETRY_WAITS_MS.length;
    await admin!.evidence.update({ where: { id }, data: { scanAttempts: waits } });
    const enqueue = vi.fn(async () => true);
    const out = await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: waits }, { clamd: DOWN, enqueue });
    expect(out).toMatchObject({ status: 'ERROR', retryQueued: false });
    expect(enqueue).not.toHaveBeenCalled();
    const alerts = await admin!.systemAlert.findMany({ where: { source: 'evidence-scan', level: 'warn', createdAt: { gte: since } } });
    expect(alerts.some((a) => /after all retries/.test(a.message))).toBe(true);
    alertIds.push(...alerts.map((a) => a.id));

    const row = await rowOf(id);
    const sweptBefore = await scanner.sweepUnscannedEvidence({ tenantIds: [t.tenant], now: new Date(row.scannedAt!.getTime() + 60_000), enqueue });
    expect(enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ evidenceId: id }));
    expect(sweptBefore.tenants).toBe(1);
    await scanner.sweepUnscannedEvidence({
      tenantIds: [t.tenant],
      now: new Date(row.scannedAt!.getTime() + scanner.EVIDENCE_SCAN_SWEEP_ERROR_AFTER_MS + 1),
      enqueue,
    });
    expect(row.scanAttempts).toBe(waits + 1);
    expect(enqueue).toHaveBeenCalledWith({ tenantId: t.tenant, evidenceId: id, attempt: waits + 1 });
  });

  test('the sweep queues a PENDING file whose job was lost, after 2 minutes, through the real queue', async () => {
    const id = await uploadPresigned('lost-job.docx', cleanDocx('kayıp iş'));
    await dropQueuedScans(id);
    expect(await queuedScanKeys(id)).toEqual([]);
    const updatedAt = (await admin!.evidence.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;

    await scanner.sweepUnscannedEvidence({ tenantIds: [t.tenant], now: new Date(updatedAt.getTime() + 60_000) });
    expect(await queuedScanKeys(id), 'not yet: the upload may still be queueing it').toEqual([]);

    const r = await scanner.sweepUnscannedEvidence({
      tenantIds: [t.tenant],
      now: new Date(updatedAt.getTime() + scanner.EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS + 1),
    });
    expect(r.tenantsFailed).toBe(0);
    expect(await queuedScanKeys(id)).toEqual([`evidence-scan:${id}:0`]);
    // A second sweep adds no second job.
    await scanner.sweepUnscannedEvidence({ tenantIds: [t.tenant], now: new Date(updatedAt.getTime() + 10 * 60_000) });
    expect(await queuedScanKeys(id)).toEqual([`evidence-scan:${id}:0`]);
    await dropQueuedScans(id);
  });
});

/**
 * The clamd-stopped check, run by hand with the real clamd container stopped
 * (`docker stop <clamd>`, then NG239_CLAMD_STOPPED=1 NG239_CLAMD_HOST=…): the
 * configured clamd does not answer, and the file stays undownloadable.
 */
describe.runIf(process.env.NG239_CLAMD_STOPPED === '1' && CLAMD_HOST)('NG-239 with the configured clamd stopped', () => {
  test('EICAR and a clean file both end ERROR and neither downloads', async () => {
    for (const [name, body] of [['stopped-eicar.docx', eicarDocx()], ['stopped-clean.docx', cleanDocx('durdu')]] as const) {
      const id = await uploadPresigned(name, body);
      await dropQueuedScans(id);
      const out = await scanner.scanEvidence(
        { tenantId: t.tenant, evidenceId: id, attempt: 0 },
        { clamd: { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 10_000 }, enqueue: async () => true }
      );
      console.log(`[clamd stopped] ${name}: ${JSON.stringify(out)}`);
      expect(out).toMatchObject({ status: 'ERROR' });
      expect((await rowOf(id)).scanStatus).toBe('ERROR');
      const res = await callDownload(id);
      expect(res.status).toBe(409);
      expect(Buffer.from(await res.arrayBuffer()).includes(Buffer.from('EICAR-STANDARD'))).toBe(false);
    }
  });
});
