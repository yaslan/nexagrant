import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';
import { DOCX_MIME, cleanDocx, eicarDocx, nestedDocx } from './helpers/eicar';
import { bombDocxB, hiddenZip64EicarDocx } from './helpers/zip-fixtures';

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

const { createDbClient, withTenant } = await import('@/lib/db');
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

/** The scan jobs of one file with the columns that tell a live job from a failed-for-good one. */
async function scanJobs(evidenceId: string) {
  return admin!.$queryRawUnsafe<{ id: string; key: string; attempts: number; last_error: string | null }[]>(
    `select id::text as id, key, attempts, last_error from graphile_worker.jobs where key like $1 order by key`,
    `evidence-scan:${evidenceId}:%`
  );
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
    // NG-263: the infected event is written before the removal, so it carries no objectDeleted;
    // the removal's outcome is the second event.
    expect(audit[0]!.data).toMatchObject({ signature: expect.stringMatching(/Eicar/i) });
    expect(audit[0]!.data).not.toHaveProperty('objectDeleted');
    const removed = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id } });
    expect(removed).toHaveLength(1);
    expect(removed[0]!.data).toMatchObject({ objectDeleted: true });

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
  // NG-239 Ö-1: clamd must run with `AlertExceedsMax yes` (docker-compose.yml). A file it cannot
  // read to the end (here a ZIP nested 20 deep, past MaxRecursion 17) is not CLEAN and does not download.
  test('a .docx that unpacks past clamd\'s limits is ERROR (limits_exceeded), kept, and D1 answers 409', async () => {
    const id = await uploadPresigned('over-limit.docx', nestedDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    const out = await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd, enqueue: async () => true });
    console.log(`[clamd limits] over-limit.docx: ${JSON.stringify(out)}`);
    expect(out).toMatchObject({ status: 'ERROR', reason: expect.stringMatching(/^limits_exceeded: Heuristics\.Limits\.Exceeded\./) });
    const row = await rowOf(id);
    expect(row.scanStatus).toBe('ERROR');
    expect(row.scanSignature).toBeNull();
    expect(await storage.statObject(key), 'not malware: the object is kept').not.toBeNull();

    const res = await callDownload(id);
    console.log(`[clamd limits] D1 status ${res.status}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_ERROR' });
  });

  // NG-269 (NG-265 (b), K-584606 = C): clamd cuts one ZIP member at MaxFileSize (100 MiB) and
  // answers OK even with AlertExceedsMax. A 150 KB .docx whose one member unpacks to 150 MiB,
  // EICAR at 140 MiB, was CLEAN and downloaded. The member check stops it before clamd.
  test('NG-269 (b): a .docx whose member unpacks past 100 MiB is ERROR (limits_exceeded), kept, and D1 answers 409', async () => {
    const body = bombDocxB();
    const id = await uploadPresigned('ng269-b-150M-eicar-at-140M.docx', body);
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    const out = await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd, enqueue: async () => true });
    const row = await rowOf(id);
    const res = await callDownload(id);
    console.log(`[NG-269 b] ${body.length}B | scanEvidence=${JSON.stringify(out)} | row=${JSON.stringify({ scanStatus: row.scanStatus, scanSignature: row.scanSignature, scanAttempts: row.scanAttempts })} | D1 HTTP ${res.status}`);
    expect(out).toMatchObject({ status: 'ERROR', reason: expect.stringMatching(/^limits_exceeded: zip_member_check: member_too_large/) });
    expect(row.scanStatus).toBe('ERROR');
    expect(row.scanSignature).toBeNull();
    expect(await storage.statObject(key), 'not proven malware: the object is kept').not.toBeNull();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_ERROR' });
  });

  // NG-269 review B-1: a local entry left out of the central directory, empty name, written as
  // ZIP64, EICAR inside. clamd reads it but does not unpack ZIP64 and answers OK; the member check
  // asked ZIP64 only of entries with a plausible name, so the row was CLEAN and D1 answered 200.
  test('NG-269 B-1: a .docx with a hidden, nameless ZIP64 entry holding EICAR is ERROR (zip64), and D1 answers 409', async () => {
    const body = hiddenZip64EicarDocx();
    const id = await uploadPresigned('ng269-b1-hidden-zip64.docx', body);
    await dropQueuedScans(id);
    const out = await scanner.scanEvidence({ tenantId: t.tenant, evidenceId: id, attempt: 0 }, { clamd, enqueue: async () => true });
    const row = await rowOf(id);
    const res = await callDownload(id);
    console.log(`[NG-269 B-1] ${body.length}B | scanEvidence=${JSON.stringify(out)} | row=${JSON.stringify({ scanStatus: row.scanStatus, scanAttempts: row.scanAttempts })} | D1 HTTP ${res.status}`);
    expect(out).toMatchObject({ status: 'ERROR', reason: 'limits_exceeded: zip_member_check: zip64' });
    expect(row.scanStatus).toBe('ERROR');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_ERROR' });
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

  // NG-239 Ö-2: a scan job that failed for good (the queue used every attempt, e.g. the database
  // was away) kept its key, and `unsafe_dedupe` let the sweep "queue" into it forever.
  test('the sweep replaces a scan job that failed for good, and leaves a live one alone', async () => {
    const id = await uploadPresigned('dead-job.docx', cleanDocx('ölü iş'));
    const jobKey = `evidence-scan:${id}:0`;
    expect(await queuedScanKeys(id), 'the upload queued attempt 0').toEqual([jobKey]);
    await admin!.$executeRawUnsafe(
      `update graphile_worker._private_jobs set attempts = max_attempts, last_error = 'NG-239 test: failed for good' where key = $1`,
      jobKey
    );
    const updatedAt = (await admin!.evidence.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;
    const sweepAt = new Date(updatedAt.getTime() + scanner.EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS + 1);

    const r = await scanner.sweepUnscannedEvidence({ tenantIds: [t.tenant], now: sweepAt });
    expect(r.tenantsFailed).toBe(0);
    const after = await scanJobs(id);
    expect(after, 'one live job under the same key').toHaveLength(1);
    expect(after[0]).toMatchObject({ key: jobKey, attempts: 0, last_error: null });

    // Live (queued, not failed): a second sweep leaves it as it is (same job id).
    await scanner.sweepUnscannedEvidence({ tenantIds: [t.tenant], now: sweepAt });
    expect(await scanJobs(id)).toEqual(after);
    await dropQueuedScans(id);
  });

  // NG-239 Ö-2 (re-review): `replaceFailed` picked the failed job with one statement and removed
  // it with `remove_job`, which runs its own statements. When another request replaced the failed
  // job in between and a worker locked the new one, `remove_job` could not delete it and fell back
  // to clearing its key and using up its attempts: the running scan lost its retry, and this
  // request then queued a second job for the same attempt. Replayed here without timing luck:
  // connection A replaces the job and holds the transaction open until this request is waiting on
  // A's row lock, then commits.
  test('replacing a failed scan job leaves one that another request queued and a worker locked meanwhile', async () => {
    const id = await uploadPresigned('race-job.docx', cleanDocx('yarış'));
    const jobKey = `evidence-scan:${id}:0`;
    expect(await queuedScanKeys(id), 'the upload queued attempt 0').toEqual([jobKey]);
    await admin!.$executeRawUnsafe(
      `update graphile_worker._private_jobs set attempts = max_attempts, last_error = 'NG-239 test: failed for good' where key = $1`,
      jobKey
    );
    const payload = { tenantId: t.tenant, evidenceId: id, attempt: 0 };
    const jobsOfFile = () =>
      admin!.$queryRawUnsafe<{ id: string; key: string | null; attempts: number; locked_by: string | null }[]>(
        `select id::text as id, key, attempts, locked_by from graphile_worker._private_jobs
          where payload->>'evidenceId' = $1 order by id`,
        id
      );

    const { Client } = await import('pg');
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    const a = new Client({ connectionString: ADMIN_URL });
    await a.connect();
    try {
      // A: the other request replaced the failed job, and a worker locked the new one (attempt 1).
      await a.query('begin');
      await a.query('delete from graphile_worker._private_jobs where key = $1', [jobKey]);
      const added = await a.query<{ id: string }>(
        `select (graphile_worker.add_job('evidence-scan', $2::json, job_key := $1, job_key_mode := 'unsafe_dedupe', max_attempts := 25)).id::text as id`,
        [jobKey, JSON.stringify(payload)]
      );
      const running = added.rows[0]!.id;
      await a.query(
        `update graphile_worker._private_jobs set locked_at = now(), locked_by = 'ng239-race-test', attempts = 1 where id = $1`,
        [running]
      );
      const aPid = (await a.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;

      // B: this request, still seeing the failed job.
      const b = enqueueJob('evidence-scan', payload, { replaceFailed: true, connectionString: ADMIN_URL });
      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i++) {
        // Asked on another connection: inside A's open transaction pg_stat_activity stays as first read.
        const w = await admin!.$queryRawUnsafe<{ n: number }[]>(
          `select count(*)::int as n from pg_stat_activity
            where pid <> $1 and wait_event_type = 'Lock' and query ~ '(remove_job|_private_jobs)'`,
          aPid
        );
        blocked = (w[0]?.n ?? 0) > 0;
        if (!blocked) await new Promise((r) => setTimeout(r, 100));
      }
      expect(blocked, 'the request waits on the row A is replacing').toBe(true);
      await a.query('commit');
      await b;

      expect(await jobsOfFile(), 'the running job keeps its key and its retries; no second job').toEqual([
        { id: running, key: jobKey, attempts: 1, locked_by: 'ng239-race-test' },
      ]);
    } finally {
      await a.query('rollback').catch(() => {});
      await a.end().catch(() => {});
      await admin!
        .$executeRawUnsafe(`delete from graphile_worker._private_jobs where payload->>'evidenceId' = $1`, id)
        .catch(() => {});
    }
  });

  // NG-239 Ö-2 (3rd review, item 1): a worker holds the job on its last attempt
  // (attempts = max_attempts while it runs). That job has not failed; only `locked_at is null`
  // keeps `replaceFailed` from deleting it. The race test above cannot see this, because its
  // locked job is on attempt 1 of 25.
  test('replaceFailed leaves a job a worker holds on its last attempt', async () => {
    const id = await uploadPresigned('last-attempt.docx', cleanDocx('son deneme'));
    const jobKey = `evidence-scan:${id}:0`;
    expect(await queuedScanKeys(id), 'the upload queued attempt 0').toEqual([jobKey]);
    const lockedJobs = () =>
      admin!.$queryRawUnsafe<
        { id: string; key: string | null; attempts: number; max_attempts: number; locked_by: string | null; locked: boolean }[]
      >(
        `select id::text as id, key, attempts, max_attempts, locked_by, locked_at is not null as locked
           from graphile_worker._private_jobs where payload->>'evidenceId' = $1 order by id`,
        id
      );
    try {
      await admin!.$executeRawUnsafe(
        `update graphile_worker._private_jobs
            set attempts = max_attempts, locked_at = now(), locked_by = 'ng239-last-attempt-test'
          where key = $1`,
        jobKey
      );
      const before = await lockedJobs();
      expect(before, 'one job, locked, on its last attempt').toHaveLength(1);
      expect(before[0]).toMatchObject({ key: jobKey, locked_by: 'ng239-last-attempt-test', locked: true });
      expect(before[0]!.attempts).toBe(before[0]!.max_attempts);

      const { enqueueJob } = await import('@/lib/jobs/enqueue');
      await enqueueJob('evidence-scan', { tenantId: t.tenant, evidenceId: id, attempt: 0 }, {
        replaceFailed: true,
        connectionString: ADMIN_URL,
      });

      expect(await lockedJobs(), 'the running job stays (same id, key and lock); no second job').toEqual(before);
    } finally {
      await admin!
        .$executeRawUnsafe(`delete from graphile_worker._private_jobs where payload->>'evidenceId' = $1`, id)
        .catch(() => {});
    }
  });

  // NG-239 Ö-4: the sweep read one page (100 rows) per tenant per tick; a tenant with more
  // PENDING files than that waited 15 minutes per hundred.
  test('the sweep queues every due file of a tenant in one tick, past one page', async () => {
    const n = scanner.EVIDENCE_SCAN_SWEEP_PAGE + 5;
    const ids = Array.from({ length: n }, (_, i) => `${RUN}-bulk-${String(i).padStart(4, '0')}`);
    await admin!.evidence.createMany({
      data: ids.map((id) => ({
        id,
        tenantId: t.tenant,
        kind: 'certificate',
        title: `${RUN} bulk`,
        body: '',
        category: 'CAT-03',
        r2ObjectKey: `${t.tenant}/evidence/${id}.docx`,
      })),
    });
    const enqueue = vi.fn(async () => true);
    const r = await scanner.sweepUnscannedEvidence({ tenantIds: [t.tenant], now: new Date(Date.now() + 60 * 60_000), enqueue });
    expect(r.tenantsFailed).toBe(0);
    const swept = new Set(enqueue.mock.calls.map((c) => (c as unknown as [{ evidenceId: string }])[0].evidenceId));
    for (const id of ids) expect(swept.has(id), id).toBe(true);
    await admin!.evidence.deleteMany({ where: { tenantId: requireId(t.tenant, 'tenantId'), id: { in: presentIds(ids) } } });
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

/**
 * NG-263 (NG-239 Ö-3): the INFECTED write is the first thing that happens after a FOUND
 * verdict, the object is deleted after it. A failure in between must not lose the answer:
 * the job retries, reads the object again (it is still there) and reaches the same verdict.
 */
describe.skipIf(!CLAMD_HOST)('NG-263: an INFECTED verdict survives a failed write, and the object is removed', () => {
  const clamd = { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 60_000 };
  const run = (id: string) => ({ tenantId: t.tenant, evidenceId: id, attempt: 0 });

  /**
   * The first auditEvent call that `match` picks throws once, inside its transaction (the row write
   * rolls back with it). Every other call goes to the database as usual.
   */
  function failAuditCallOnce(match: (method: string, args: { where?: { type?: string }; data?: { type?: string } }) => boolean) {
    let failed = false;
    const runTenant: NonNullable<import('@/lib/evidence-scan').EvidenceScanDeps['runTenant']> = (tenantId, cb) =>
      withTenant(tenantId, (tx) =>
        cb(
          new Proxy(tx, {
            get(target, prop) {
              if (prop !== 'auditEvent' || failed) return Reflect.get(target, prop);
              return new Proxy(target.auditEvent, {
                get(model, method) {
                  const fn = Reflect.get(model, method);
                  if (typeof fn !== 'function') return fn;
                  return (args: { where?: { type?: string }; data?: { type?: string } }) => {
                    if (!failed && match(String(method), args)) {
                      failed = true;
                      throw new Error('injected: audit call failed');
                    }
                    return fn.call(model, args);
                  };
                },
              });
            },
          })
        )
      );
    return { runTenant, didFail: () => failed };
  }

  test.each([
    ['U1+U4+U2', uploadPresigned],
    ['U3', uploadFormData],
  ])('%s: the first INFECTED transaction fails, the retry still ends INFECTED with an AuditEvent, an alarm and no object', async (name, upload) => {
    const since = new Date();
    const id = await upload(`ng263-retry-${name.slice(0, 2)}.docx`, eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    const inject = failAuditCallOnce((method, args) => method === 'create' && args.data?.type === 'evidence.scan.infected');

    await expect(scanner.scanEvidence(run(id), { clamd, enqueue: async () => true, runTenant: inject.runTenant })).rejects.toThrow('injected');
    expect(inject.didFail()).toBe(true);
    expect((await rowOf(id)).scanStatus, 'the failed transaction rolled back').toBe('PENDING');

    // The job retry: same attempt, the object is still in the store, so the same verdict comes out.
    const out = await scanner.scanEvidence(run(id), { clamd, enqueue: async () => true, runTenant: inject.runTenant });
    expect(out).toMatchObject({ status: 'INFECTED' });
    expect((await rowOf(id)).scanStatus).toBe('INFECTED');
    expect(await storage.statObject(key), 'the infected object is removed').toBeNull();

    const audit = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.infected', target: id } });
    expect(audit, 'exactly one infected AuditEvent').toHaveLength(1);
    const removed = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id } });
    expect(removed).toHaveLength(1);
    expect(removed[0]!.data).toMatchObject({ objectDeleted: true });

    const alerts = await admin!.systemAlert.findMany({ where: { source: 'evidence-scan', level: 'error', createdAt: { gte: since } } });
    const mine = alerts.filter((a) => (a.meta as { evidenceId?: string } | null)?.evidenceId === id);
    expect(mine, 'one SystemAlert for this file').toHaveLength(1);
    alertIds.push(...mine.map((a) => a.id));

    const res = await callDownload(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'EVIDENCE_SCAN_INFECTED' });
  });

  test('the object delete fails: INFECTED, the object stays, the alarm says so, the download is still refused', async () => {
    const since = new Date();
    const id = await uploadPresigned('ng263-delete-fails.docx', eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    const out = await scanner.scanEvidence(run(id), {
      clamd,
      enqueue: async () => true,
      deleteObject: async () => {
        throw new Error('injected: delete failed');
      },
    });
    expect(out).toMatchObject({ status: 'INFECTED', objectDeleted: false });
    expect((await rowOf(id)).scanStatus).toBe('INFECTED');
    expect(await storage.statObject(key)).not.toBeNull();
    const removed = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id } });
    expect(removed[0]?.data).toMatchObject({ objectDeleted: false });
    const alerts = await admin!.systemAlert.findMany({ where: { source: 'evidence-scan', level: 'error', createdAt: { gte: since } } });
    const mine = alerts.filter((a) => (a.meta as { evidenceId?: string } | null)?.evidenceId === id);
    expect(mine[0]?.message).toMatch(/could NOT be deleted/);
    alertIds.push(...mine.map((a) => a.id));
    const res = await callDownload(id);
    expect(res.status).toBe(409);
    expect(Buffer.from(await res.arrayBuffer()).includes(Buffer.from('EICAR-STANDARD'))).toBe(false);
  });

  test('a run that finds the row INFECTED with the object still there (crash after the write) removes it and records the outcome', async () => {
    const id = await uploadPresigned('ng263-resume.docx', eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    // First run: the INFECTED write commits, then the run is lost before the removal starts
    // (its check for a recorded outcome throws: the job fails, the object is still in the store).
    const inject = failAuditCallOnce((method, args) => method === 'findMany' && args.where?.type === 'evidence.scan.object_removed');
    await expect(scanner.scanEvidence(run(id), { clamd, enqueue: async () => true, runTenant: inject.runTenant })).rejects.toThrow('injected');
    expect(inject.didFail()).toBe(true);
    expect((await rowOf(id)).scanStatus).toBe('INFECTED');
    expect(await storage.statObject(key)).not.toBeNull();
    // The retry of that job finds INFECTED and finishes the job instead of skipping it.
    const out = await scanner.scanEvidence(run(id), { clamd, enqueue: async () => true });
    expect(out).toMatchObject({ status: 'INFECTED', objectDeleted: true });
    expect(await storage.statObject(key)).toBeNull();
    const removed = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id } });
    expect(removed).toHaveLength(1);
    expect(removed[0]!.data).toMatchObject({ objectDeleted: true });
    // Nothing left to do: a further run changes nothing.
    expect(await scanner.scanEvidence(run(id), { clamd })).toEqual({ skipped: 'already_final' });
  });

  /**
   * NG-278 (NG-263 Ö-1): two runs that both reach `finishInfectedRemoval` for one INFECTED row.
   * Run A (real clamd: FOUND) writes INFECTED, checks for a recorded outcome, then stops inside
   * the object delete. Run B starts only then: it finds the row INFECTED, sees no outcome yet
   * (A has not written it) and removes the object too. Each run then writes its own
   * `evidence.scan.object_removed` and its own `error` alarm, unless the check and the write
   * are one locked step.
   */
  test('NG-278: two runs that both finish the removal of one INFECTED file record one object_removed and one alarm', async () => {
    const id = await uploadPresigned('ng278-race.docx', eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;

    let reachedDelete!: () => void;
    const aInDelete = new Promise<void>((resolve) => (reachedDelete = resolve));
    let releaseDelete!: () => void;
    const aMayDelete = new Promise<void>((resolve) => (releaseDelete = resolve));
    let deleteCalls = 0;
    const deleteObject = async (k: string): Promise<boolean> => {
      deleteCalls += 1;
      if (deleteCalls === 1) {
        reachedDelete();
        await aMayDelete;
      }
      return storage.deleteObjectBytes(k);
    };

    const runA = scanner.scanEvidence(run(id), { clamd, enqueue: async () => true, deleteObject });
    await aInDelete;
    // Run B: the row is INFECTED, A's check has passed, A has not written its outcome yet.
    const runB = scanner.scanEvidence(run(id), { clamd, enqueue: async () => true, deleteObject });
    // Give B time to finish on its own (a fixed window, not a sleep for correctness: with the
    // fix B waits for A's lock and the counts below hold either way).
    await new Promise((resolve) => setTimeout(resolve, 1500));
    releaseDelete();
    const [outA, outB] = await Promise.all([runA, runB]);
    console.log(`[NG-278 race] A=${JSON.stringify(outA)} B=${JSON.stringify(outB)} deleteCalls=${deleteCalls}`);

    expect(await storage.statObject(key), 'the infected object is removed').toBeNull();
    const removed = await admin!.auditEvent.findMany({ where: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id } });
    expect(removed, 'exactly one object_removed AuditEvent').toHaveLength(1);
    const alerts = await admin!.systemAlert.findMany({ where: { source: 'evidence-scan', level: 'error' } });
    const mine = alerts.filter((a) => (a.meta as { evidenceId?: string } | null)?.evidenceId === id);
    expect(mine, 'exactly one error alarm for this file').toHaveLength(1);
    alertIds.push(...mine.map((a) => a.id));
  });
});

/**
 * NG-279 (NG-263 inceleme Ö-2): a removal that failed (`objectDeleted: false`) used to be the end —
 * the sweep took only PENDING and ERROR rows, so the infected bytes stayed in the store. Each sweep
 * tick below is run as the worker would: the runs it queues for this file are run at once, at the
 * tick's clock. The verdict comes from the real clamd when one is configured (NG239_CLAMD_HOST);
 * without one (CI) the scan answer is injected, the rest is the same.
 */
describe('NG-279: an infected object that could not be deleted is tried again by the sweep', () => {
  type Run = import('@/lib/evidence-scan').EvidenceScanRun;
  type Deps = import('@/lib/evidence-scan').EvidenceScanDeps;
  const run = (id: string): Run => ({ tenantId: t.tenant, evidenceId: id, attempt: 0 });
  const verdictDeps: Deps = CLAMD_HOST
    ? { clamd: { host: CLAMD_HOST, port: CLAMD_PORT, timeoutMs: 60_000 } }
    : { scan: async () => ({ verdict: 'infected', signature: 'Eicar-Test-Signature' }) };
  const failingDelete = async (): Promise<boolean> => {
    throw new Error('injected: delete failed');
  };
  const MIN = 60_000;
  const HOUR = 60 * MIN;

  /** One sweep tick at `at`; this file's queued runs are run at once with `deleteObject` (default: the real one). */
  async function tick(id: string, at: Date, deleteObject?: Deps['deleteObject']) {
    const queued: Run[] = [];
    const sweep = await scanner.sweepUnscannedEvidence({
      now: at,
      tenantIds: [t.tenant],
      enqueue: async (r) => {
        queued.push(r);
        return true;
      },
    });
    const mine = queued.filter((r) => r.evidenceId === id);
    const outs = [];
    for (const r of mine) {
      outs.push(await scanner.scanEvidence(r, { ...verdictDeps, enqueue: async () => true, now: () => at, ...(deleteObject ? { deleteObject } : {}) }));
    }
    return { queued: mine.length, outs, sweep };
  }

  const removedEvents = (id: string) =>
    admin!.auditEvent.findMany({
      where: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, data: true, createdAt: true },
    });
  async function alertsFor(id: string) {
    const rows = await admin!.systemAlert.findMany({ where: { source: 'evidence-scan' }, orderBy: { createdAt: 'asc' } });
    const mine = rows.filter((a) => (a.meta as { evidenceId?: string } | null)?.evidenceId === id);
    alertIds.push(...mine.map((a) => a.id));
    const { repeatCountOf } = await import('@/lib/observability/system-alert');
    return mine.map((a) => ({ level: a.level, message: a.message, repeatCount: repeatCountOf(a.meta) }));
  }
  async function downloadRefused(id: string) {
    const res = await callDownload(id);
    const body = Buffer.from(await res.arrayBuffer());
    return res.status === 409 && !body.includes(Buffer.from('EICAR-STANDARD'));
  }

  test('the first delete fails; a later sweep tick deletes the object, as a second object_removed event', async () => {
    console.log(`[NG-279] verdict source: ${CLAMD_HOST ? `real clamd ${CLAMD_HOST}:${CLAMD_PORT}` : 'injected (no clamd configured)'}`);
    const id = await uploadPresigned('ng279-retry.docx', eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    const t0 = new Date();

    const first = await scanner.scanEvidence(run(id), { ...verdictDeps, enqueue: async () => true, deleteObject: failingDelete, now: () => t0 });
    expect(first).toMatchObject({ status: 'INFECTED', objectDeleted: false });
    expect(await storage.statObject(key), 'the object stayed').not.toBeNull();
    expect(await downloadRefused(id)).toBe(true);
    const firstEvent = (await removedEvents(id))[0]!;

    // Within the first wait: nothing is queued yet.
    const early = await tick(id, new Date(t0.getTime() + 1 * MIN));
    // Past it: the run is queued and the removal is tried again (the real delete now works).
    const later = await tick(id, new Date(t0.getTime() + 16 * MIN));
    const afterRetry = {
      earlyQueued: early.queued,
      laterQueued: later.queued,
      laterOut: later.outs,
      objectInStore: (await storage.statObject(key)) !== null,
      events: (await removedEvents(id)).map((e) => e.data),
      status: (await rowOf(id)).scanStatus,
      downloadRefused: await downloadRefused(id),
    };
    console.log('[NG-279] retry:', JSON.stringify(afterRetry));
    expect(afterRetry).toEqual({
      earlyQueued: 0,
      laterQueued: 1,
      laterOut: [expect.objectContaining({ status: 'INFECTED', objectDeleted: true })],
      objectInStore: false,
      events: [{ objectDeleted: false }, { objectDeleted: true }],
      status: 'INFECTED',
      downloadRefused: true,
    });
    // The first event is left as it was (a new event per try, never an update).
    expect((await removedEvents(id))[0]).toEqual(firstEvent);
    // Out of the set for good: a tick two days later queues nothing.
    expect((await tick(id, new Date(t0.getTime() + 48 * HOUR))).queued).toBe(0);
    // Alarms: the first try's error, one info for the retry that worked.
    const alerts = await alertsFor(id);
    expect(alerts.map((a) => a.level)).toEqual(['error', 'info']);
    expect(alerts[0]!.message).toMatch(/could NOT be deleted/);
  });

  test('the delete keeps failing: one alarm at the limit, none per try, the download stays refused', async () => {
    const id = await uploadPresigned('ng279-stuck.docx', eicarDocx());
    await dropQueuedScans(id);
    const key = (await rowOf(id)).r2ObjectKey!;
    const t0 = new Date();
    await scanner.scanEvidence(run(id), { ...verdictDeps, enqueue: async () => true, deleteObject: failingDelete, now: () => t0 });
    const firstEvent = (await removedEvents(id))[0]!;

    const rounds: Array<{ hour: number; queued: number; alerts: number; repeats: number[]; refused: boolean }> = [];
    let clock = t0.getTime();
    for (let round = 1; round <= 7; round++) {
      clock += 25 * HOUR; // past every wait
      const r = await tick(id, new Date(clock), failingDelete);
      // A tick 15 minutes later (the sweep's own rhythm): nothing is due, nothing is raised.
      const quiet = await tick(id, new Date(clock + 15 * MIN), failingDelete);
      const now = await alertsFor(id);
      rounds.push({
        hour: Math.round((clock - t0.getTime()) / HOUR),
        queued: r.queued + quiet.queued,
        alerts: now.length,
        // NG-369 (Ö3): a failure past the alarm limit must not raise a new alert; it is a repeat of the
        // one row (same dedupeKey), so its counter moves and the alarm count does not. This is what
        // catches `===` turned into `>=` at finishInfectedRemoval (mutant M2).
        repeats: now.map((a) => a.repeatCount),
        refused: await downloadRefused(id),
      });
    }
    const events = await removedEvents(id);
    const alerts = await alertsFor(id);
    console.log('[NG-279] stuck rounds:', JSON.stringify(rounds));
    console.log('[NG-279] stuck alerts:', JSON.stringify(alerts));

    expect(rounds.map((r) => r.queued)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    // 1 try at upload + 7 retries = 8 failures; the alarm count only moves at the 5th failure (round 4).
    expect(rounds.map((r) => r.alerts)).toEqual([1, 1, 1, 2, 2, 2, 2]);
    // NG-369 (Ö3): the first alarm is one occurrence. The limit alarm is raised once, and the failures
    // after it raise nothing, so its counter stays at 1 through rounds 4–7. Under M2 each of those
    // rounds would repeat it (counter 2, 3, 4).
    expect(rounds.map((r) => r.repeats)).toEqual([[1], [1], [1], [1, 1], [1, 1], [1, 1], [1, 1]]);
    expect(rounds.every((r) => r.refused)).toBe(true);
    expect(events.map((e) => e.data)).toEqual(Array(8).fill({ objectDeleted: false }));
    expect(events[0]).toEqual(firstEvent);
    expect(alerts.map((a) => a.level)).toEqual(['error', 'error']);
    expect(alerts[1]!.message).toContain(`since ${t0.toISOString()}`);
    expect(alerts[1]!.message).toMatch(/after 5 failed removals/);
    expect(await storage.statObject(key), 'still there: the delete keeps failing').not.toBeNull();
    expect((await rowOf(id)).scanStatus).toBe('INFECTED');
  });

  test('NG-369 (Ö1): a row whose object was deleted is not read by the removal sweep; one still in the store is', async () => {
    const gone = await uploadPresigned('ng369-gone.docx', eicarDocx());
    const stuck = await uploadPresigned('ng369-stuck.docx', eicarDocx());
    await dropQueuedScans(gone);
    await dropQueuedScans(stuck);
    const t0 = new Date();
    await scanner.scanEvidence(run(gone), { ...verdictDeps, enqueue: async () => true, now: () => t0 });
    await scanner.scanEvidence(run(stuck), { ...verdictDeps, enqueue: async () => true, deleteObject: failingDelete, now: () => t0 });
    expect((await removedEvents(gone))[0]!.data).toMatchObject({ objectDeleted: true });
    expect((await removedEvents(stuck))[0]!.data).toMatchObject({ objectDeleted: false });

    const page = await withTenant(t.tenant, (tx) => scanner.readInfectedPage(tx, t.tenant, ''));
    const ids = page.rows.map((r) => r.id);
    expect(ids, 'the deleted row is not read').not.toContain(gone);
    expect(ids, 'the row whose delete failed is still read').toContain(stuck);
    expect(page.events.map((e) => e.target)).not.toContain(gone);
  });

  test('NG-369 (Ö-a): a deleted event of ANOTHER tenant, or a shared one, on the same row does not hide it, on the RLS client or the owner client', async () => {
    const id = await uploadPresigned('ng369-oa.docx', eicarDocx());
    await dropQueuedScans(id);
    await scanner.scanEvidence(run(id), { ...verdictDeps, enqueue: async () => true, deleteObject: failingDelete, now: () => new Date() });
    const other = await admin!.tenant.create({
      data: { name: `${RUN} ng369 other`, slug: `${RUN}-ng369-other`, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    });
    try {
      await admin!.auditEvent.create({ data: { tenantId: other.id, type: 'evidence.scan.object_removed', target: id, data: { objectDeleted: true }, actorId: 'ng369-oa' } });
      await admin!.auditEvent.create({ data: { tenantId: null, type: 'evidence.scan.object_removed', target: id, data: { objectDeleted: true }, actorId: 'ng369-oa' } });
      const viaRls = await withTenant(t.tenant, (tx) => scanner.readInfectedPage(tx, t.tenant, ''));
      const viaOwner = await admin!.$transaction((tx) => scanner.readInfectedPage(tx as never, t.tenant, ''));
      expect(viaRls.rows.map((r) => r.id), 'RLS client').toContain(id);
      expect(viaOwner.rows.map((r) => r.id), 'owner client (BYPASSRLS, only the SQL predicate scopes it)').toContain(id);
    } finally {
      await admin!.auditEvent.deleteMany({ where: { actorId: 'ng369-oa' } });
      await admin!.tenant.delete({ where: { id: other.id } }).catch(() => {});
    }
  });

  test('NG-369 (Ö-b): a JSON string "true" is not a deletion, in SQL and in the JS decision alike', async () => {
    const id = await uploadPresigned('ng369-ob.docx', eicarDocx());
    await dropQueuedScans(id);
    await scanner.scanEvidence(run(id), { ...verdictDeps, enqueue: async () => true, deleteObject: failingDelete, now: () => new Date() });
    await admin!.auditEvent.create({
      data: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: id, data: { objectDeleted: 'true' }, actorId: 'ng369-ob' },
    });
    try {
      const page = await withTenant(t.tenant, (tx) => scanner.readInfectedPage(tx, t.tenant, ''));
      const sqlReads = page.rows.some((r) => r.id === id);
      const attempts = page.events.filter((e) => e.target === id).map(scanner.attemptOf);
      const decision = scanner.objectRemovalDecision(attempts, new Date(Date.now() + 100 * 3600_000));
      expect({ sqlReads, jsDue: decision.due }).toEqual({ sqlReads: true, jsDue: true });
    } finally {
      await admin!.auditEvent.deleteMany({ where: { actorId: 'ng369-ob' } });
    }
  });

  test('NG-374: a deleted event with target NULL in the same tenant does not empty the sweep page (RLS and owner client)', async () => {
    // Guards the `a."target" IS NOT NULL` predicate in readInfectedPage: `e.id NOT IN (…, NULL)` is never
    // true, so without it one NULL-target object_removed event would drop every INFECTED row of the tenant.
    const id = await uploadPresigned('ng374-null-target.docx', eicarDocx());
    await dropQueuedScans(id);
    await scanner.scanEvidence(run(id), { ...verdictDeps, enqueue: async () => true, deleteObject: failingDelete, now: () => new Date() });
    await admin!.auditEvent.create({
      data: { tenantId: t.tenant, type: 'evidence.scan.object_removed', target: null, data: { objectDeleted: true }, actorId: 'ng374-null' },
    });
    try {
      const viaRls = await withTenant(t.tenant, (tx) => scanner.readInfectedPage(tx, t.tenant, ''));
      const viaOwner = await admin!.$transaction((tx) => scanner.readInfectedPage(tx as never, t.tenant, ''));
      expect(viaRls.rows.map((r) => r.id), 'RLS client: the infected row is still read').toContain(id);
      expect(viaOwner.rows.map((r) => r.id), 'owner client: the infected row is still read').toContain(id);
    } finally {
      await admin!.auditEvent.deleteMany({ where: { actorId: 'ng374-null' } });
    }
  });
});
