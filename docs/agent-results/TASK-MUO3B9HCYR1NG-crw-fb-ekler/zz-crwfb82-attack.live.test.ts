// İNCELEME-82 (crw-fb) — throwaway attack suite, NOT committed.
// Real MinIO behind a per-request fault-injecting proxy. Env: EVIDENCE_S3_TEST_* + DATABASE_URL(_RLS_TEST).
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import http from 'node:http';
import { execSync } from 'node:child_process';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';

type Req = { method: string; key: string; isCopy: boolean; range: boolean };
type Act = 'pass' | 'destroy' | { delay: number } | { status: number };

const state = vi.hoisted(() => {
  const e = process.env;
  const port = 43000 + (process.pid % 9000);
  e.R2_ACCOUNT_ID = 'minio-test';
  e.R2_ENDPOINT = `http://127.0.0.1:${port}`;
  e.R2_ACCESS_KEY_ID = e.EVIDENCE_S3_TEST_ACCESS_KEY;
  e.R2_SECRET_ACCESS_KEY = e.EVIDENCE_S3_TEST_SECRET_KEY;
  e.R2_BUCKET = e.EVIDENCE_S3_TEST_BUCKET;
  return {
    port,
    rls: undefined as PrismaClient | undefined,
    session: null as null | { user: { id: string }; tenantId: string; role: string },
    hook: null as null | ((r: { method: string; key: string; isCopy: boolean; range: boolean }) => unknown),
    log: [] as string[],
    /** 'before' = throw inside the create tx (rolled back); 'after' = commit then throw (reply lost). */
    dbFault: null as null | 'findFirst' | 'before' | 'after',
  };
});

vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: async (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) => {
      const f = state.dbFault;
      if (f === 'findFirst') {
        return actual.withTenantOn(state.rls!, tenantId, (tx) => cb(new Proxy(tx, { get: (o, k) => k === 'evidence'
          ? new Proxy((o as { evidence: object }).evidence, { get: (e, m) => m === 'findFirst' ? () => { state.dbFault = null; throw new Error('injected: connection lost'); } : Reflect.get(e, m) })
          : Reflect.get(o, k) }) as typeof tx));
      }
      if (f === 'before') {
        return actual.withTenantOn(state.rls!, tenantId, async (tx) => {
          // let the findFirst tx through; fault the create tx only
          const r = await cb(tx);
          if (r && typeof r === 'object' && 'r2ObjectKey' in (r as object)) { state.dbFault = null; throw new Error('injected: rollback'); }
          return r;
        });
      }
      const r = await actual.withTenantOn(state.rls!, tenantId, cb);
      if (f === 'after' && r && typeof r === 'object' && 'r2ObjectKey' in (r as object)) { state.dbFault = null; throw new Error('injected: reply lost after commit'); }
      return r;
    },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const evidence = await import('@/app/[locale]/(app)/[workspace]/evidence/actions');
const download = await import('@/app/api/evidence/[id]/download/route');
const storage = await import('@/lib/storage');
const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

const UP = { host: '127.0.0.1', port: Number(new URL(process.env.EVIDENCE_S3_TEST_ENDPOINT ?? 'http://x:1').port) };
const direct = new S3Client({
  region: 'auto', endpoint: process.env.EVIDENCE_S3_TEST_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: process.env.EVIDENCE_S3_TEST_ACCESS_KEY!, secretAccessKey: process.env.EVIDENCE_S3_TEST_SECRET_KEY! },
});
const BUCKET = process.env.EVIDENCE_S3_TEST_BUCKET!;
async function bytesOf(key: string): Promise<Buffer | null> {
  try { const r = await direct.send(new GetObjectCommand({ Bucket: BUCKET, Key: key })); return Buffer.from(await r.Body!.transformToByteArray()); } catch { return null; }
}

const LOGF = '/private/tmp/claude-501/-Users-macbook-alan/56338281-6978-4118-8f49-4597415a7647/scratchpad/ekler/attack-lines.txt';
const { appendFileSync } = await import('node:fs');
const log = (...a: unknown[]) => appendFileSync(LOGF, a.map(String).join(' ') + '\n');
let admin: PrismaClient;
let proxy: http.Server;
const t = { a: '', user: '' };
const RUN = `crw82-${Date.now().toString(36)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PDF = (s: string) => Buffer.from(`%PDF-1.4\n% ${s}\n%%EOF\n`);
const finalOf = (k: string) => k.replace(/^([^/]+)\/incoming\//, '$1/');
const put = (url: string, body: Buffer, ct = 'application/pdf') =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': ct }, body: new Uint8Array(body) });
const confirm = (objectKey: string, over: Record<string, unknown> = {}) =>
  evidence.confirmEvidenceUploadAction({ title: `${RUN} up`, category: 'CAT-03', objectKey, fileName: 'belge.pdf', fileSizeBytes: 10, mimeType: 'application/pdf', ...over });
async function upload(name: string, body = PDF(name)) {
  const r = await evidence.getPresignedUploadUrlAction('certificate', name, 'application/pdf', body.length);
  if (!r.success) throw new Error(r.error);
  expect((await put(r.uploadUrl, body)).status).toBe(200);
  return { ...r, body };
}
const rows = (k: string) => admin.evidence.findMany({ where: { tenantId: t.a, r2ObjectKey: finalOf(k) }, select: { id: true, fileSizeBytes: true } });
async function snapshot(k: string) {
  const [r, st, fi] = await Promise.all([rows(k), bytesOf(k), bytesOf(finalOf(k))]);
  return { rows: r.length, size: r[0]?.fileSizeBytes ?? null, staging: st, final: fi };
}
const short = (r: unknown) => JSON.stringify(r).slice(0, 70);

beforeAll(async () => {
  proxy = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const key = decodeURIComponent(u.pathname).replace(`/${BUCKET}/`, '');
    const info: Req = { method: req.method ?? '', key, isCopy: req.method === 'PUT' && !!req.headers['x-amz-copy-source'], range: !!req.headers.range };
    state.log.push(`${info.method}${info.isCopy ? '(copy)' : ''}${info.range ? '(range)' : ''} ${key.replace(t.a, 'A')}`);
    const forward = () => {
      const up = http.request({ ...UP, method: req.method, path: req.url, headers: req.headers }, (ur) => { res.writeHead(ur.statusCode ?? 502, ur.headers); ur.pipe(res); });
      up.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    };
    const act = (state.hook?.(info) ?? 'pass') as Act;
    if (act === 'destroy') { req.resume(); res.destroy(); return; }
    if (typeof act === 'object' && 'delay' in act) { setTimeout(forward, act.delay); return; }
    if (typeof act === 'object' && 'status' in act) { req.resume(); res.writeHead(act.status, { 'content-type': 'application/xml' }); res.end('<Error><Code>InternalError</Code></Error>'); return; }
    forward();
  });
  await new Promise<void>((r) => proxy.listen(state.port, '127.0.0.1', () => r()));
  state.rls = createDbClient(envValue('DATABASE_URL_RLS_TEST')!);
  admin = createDbClient(envValue('DATABASE_URL')!);
  expect(storage.hasObjectStore).toBe(true);
  const tenant = await admin.tenant.create({ data: { name: RUN, slug: RUN, country: 'TR', kind: 'ORGANIZATION' }, select: { id: true } });
  t.a = tenant.id;
  t.user = (await admin.user.create({ data: { email: `${RUN}@example.invalid`, name: 'a' } })).id;
});
beforeEach(() => { state.hook = null; state.log = []; state.dbFault = null; state.session = { user: { id: t.user }, tenantId: t.a, role: 'TENANT_OWNER' }; });
afterAll(async () => {
  state.hook = null;
  if (t.a) { await admin.evidence.deleteMany({ where: { tenantId: t.a } }); await admin.tenant.delete({ where: { id: t.a } }).catch(() => {}); }
  if (t.user) await admin.user.delete({ where: { id: t.user } }).catch(() => {});
  await admin.$disconnect(); await state.rls?.$disconnect();
  await new Promise((r) => proxy.close(r));
});

/** Every failure: no success, no row, staging == upload; then a clean retry succeeds, 1 row, final == upload, staging gone. */
async function faultThenRetry(label: string, p: { objectKey: string; body: Buffer }, r: unknown, expectErr: string) {
  const s = await snapshot(p.objectKey);
  const retry = await confirm(p.objectKey);
  const s2 = await snapshot(p.objectKey);
  log(`${label.padEnd(26)} → ${short(r)} rows=${s.rows} stagingIntact=${!!s.staging?.equals(p.body)} final=${!!s.final}\n${''.padEnd(26)}   retry → ${short(retry)} rows=${s2.rows} finalEqUpload=${!!s2.final?.equals(p.body)} staging=${!!s2.staging}`);
  expect(r).toEqual({ success: false, error: expectErr });
  expect(s.rows).toBe(0);
  expect(s.staging?.equals(p.body)).toBe(true);
  expect((retry as { success: boolean }).success).toBe(true);
  expect(s2.rows).toBe(1);
  expect(s2.final?.equals(p.body)).toBe(true);
  expect(s2.staging).toBeNull();
}

describe('B-1 replay (İNCELEME-77 slow-after-copy)', () => {
  test('every store call after the copy takes 6 s → success, 1 row, file intact', async () => {
    const p = await upload('slow.pdf');
    let copied = false;
    state.hook = (r) => { if (r.isCopy) { copied = true; return 'pass'; } return copied ? { delay: 6000 } : 'pass'; };
    const t0 = Date.now();
    const r = await confirm(p.objectKey);
    const ms = Date.now() - t0;
    state.hook = null;
    const s = await snapshot(p.objectKey);
    log(`slow-after-copy (${ms} ms) → success=${r.success} rows=${s.rows} finalEqUpload=${!!s.final?.equals(p.body)} staging=${!!s.staging}`);
    expect(r.success).toBe(true);
    expect(s.rows).toBe(1);
    expect(s.final?.equals(p.body)).toBe(true);
  }, 60000);
});

describe('per-step fault injection (proxy)', () => {
  const stagingHead = (r: Req) => r.method === 'HEAD' && r.key.includes('/incoming/');
  const finalHead = (r: Req) => r.method === 'HEAD' && !r.key.includes('/incoming/');
  const cases: [string, (r: Req) => boolean, Act, string][] = [
    ['staging HEAD dropped', stagingHead, 'destroy', 'storage_unavailable'],
    ['staging HEAD 503', stagingHead, { status: 503 }, 'storage_unavailable'],
    ['staging HEAD 404', stagingHead, { status: 404 }, 'object_missing'],
    ['ranged GET dropped', (r) => r.range, 'destroy', 'storage_unavailable'],
    ['ranged GET 500', (r) => r.range, { status: 500 }, 'storage_unavailable'],
    ['CopyObject dropped', (r) => r.isCopy, 'destroy', 'storage_unavailable'],
    ['CopyObject 500', (r) => r.isCopy, { status: 500 }, 'storage_unavailable'],
    ['CopyObject 412', (r) => r.isCopy, { status: 412 }, 'storage_unavailable'],
    ['final HEAD dropped', finalHead, 'destroy', 'storage_unavailable'],
    ['final HEAD 404', finalHead, { status: 404 }, 'object_missing'],
  ];
  for (const [label, when, act, err] of cases) {
    test(label, async () => {
      const p = await upload(`f-${label.replace(/\W+/g, '-')}.pdf`);
      state.hook = (r) => (when(r) ? act : 'pass');
      const r = await confirm(p.objectKey);
      state.hook = null;
      await faultThenRetry(label, p, r, err);
    }, 30000);
  }

  test('findFirst DB failure → save_failed, nothing touched', async () => {
    const p = await upload('db-ff.pdf');
    state.dbFault = 'findFirst';
    await faultThenRetry('findFirst DB error', p, await confirm(p.objectKey), 'save_failed');
  });
  test('create tx rolled back → save_failed, staging kept, retry ok', async () => {
    const p = await upload('db-create.pdf');
    state.dbFault = 'before';
    await faultThenRetry('create rolled back', p, await confirm(p.objectKey), 'save_failed');
  });
  test('create blocked by a lock past the 5 s tx (P2028) → save_failed; retry ok', async () => {
    const p = await upload('db-p2028.pdf');
    // Hold an uncommitted row with the same (tenantId, r2ObjectKey) for 7 s: the confirm's insert waits on the unique index.
    const hold = admin.$transaction(async (tx) => {
      await tx.evidence.create({ data: { tenantId: t.a, title: 'lock', category: 'CAT-03', kind: 'certificate', body: '', description: '', language: 'tr', confidentiality: 'INTERNAL', status: 'UNVERIFIED', r2ObjectKey: finalOf(p.objectKey), fileBucket: 'x', fileName: 'x', createdBy: t.user } });
      await sleep(7000);
      throw new Error('rollback-hold');
    }, { timeout: 20000 }).catch(() => 'released');
    await sleep(300);
    const t0 = Date.now();
    const r = await confirm(p.objectKey);
    const ms = Date.now() - t0;
    await hold;
    log(`P2028 lock hold: confirm took ${ms} ms`);
    await faultThenRetry('create > tx timeout', p, r, 'save_failed');
  }, 40000);
  test('row committed but the reply is lost → user sees save_failed; retry', async () => {
    const p = await upload('db-after.pdf');
    state.dbFault = 'after';
    const r = await confirm(p.objectKey);
    const s = await snapshot(p.objectKey);
    const retry = await confirm(p.objectKey);
    const s2 = await snapshot(p.objectKey);
    log(`reply lost after commit → ${short(r)} rows=${s.rows} staging=${!!s.staging} finalEqUpload=${!!s.final?.equals(p.body)}\n   retry → ${short(retry)} rows=${s2.rows} staging=${!!s2.staging}`);
    expect(r).toEqual({ success: false, error: 'save_failed' });
    expect(s.rows).toBe(1);
    expect(s.final?.equals(p.body)).toBe(true);
    expect(retry).toEqual({ success: false, error: 'already_confirmed' });
    expect(s2.staging).toBeNull();
  });
  test('staging DELETE fails after the row → success; next confirm cleans up', async () => {
    const p = await upload('del-fail.pdf');
    state.hook = (r) => (r.method === 'DELETE' ? { status: 500 } : 'pass');
    const r = await confirm(p.objectKey);
    state.hook = null;
    const s = await snapshot(p.objectKey);
    const again = await confirm(p.objectKey);
    const s2 = await snapshot(p.objectKey);
    log(`staging DELETE 500 → success=${r.success} rows=${s.rows} staging=${!!s.staging} finalEqUpload=${!!s.final?.equals(p.body)}\n   again → ${short(again)} staging=${!!s2.staging}`);
    expect(r.success).toBe(true);
    expect(s.rows).toBe(1);
    expect(s.final?.equals(p.body)).toBe(true);
    expect(again).toEqual({ success: false, error: 'already_confirmed' });
    expect(s2.staging).toBeNull();
  });
  test('refused file (HTML under .pdf) → unsupported_type, staging removed, final never written', async () => {
    const p = await upload('bad.pdf', Buffer.from('<html><script>alert(1)</script>'));
    const r = await confirm(p.objectKey);
    const s = await snapshot(p.objectKey);
    log(`refused → ${short(r)} rows=${s.rows} staging=${!!s.staging} final=${!!s.final}`);
    expect(r).toEqual({ success: false, error: 'unsupported_type' });
    expect([s.rows, !!s.staging, !!s.final]).toEqual([0, false, false]);
  });
});

describe('concurrency', () => {
  test('two confirms at once (same bytes): one row, file intact', async () => {
    const p = await upload('c2.pdf');
    const rs = await Promise.all([confirm(p.objectKey), confirm(p.objectKey)]);
    const s = await snapshot(p.objectKey);
    log(`2x confirm → ${rs.map((r) => (r.success ? 'ok' : (r as { error: string }).error)).join(',')} rows=${s.rows} finalEqUpload=${!!s.final?.equals(p.body)} staging=${!!s.staging}`);
    expect(rs.filter((r) => r.success).length).toBe(1);
    expect(s.rows).toBe(1);
    expect(s.final?.equals(p.body)).toBe(true);
  });
  test('5 confirms at once', async () => {
    const p = await upload('c5.pdf');
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => confirm(p.objectKey)));
    const s = await snapshot(p.objectKey);
    log(`5x confirm → ${rs.map((r) => (r.success ? 'ok' : (r as { error: string }).error)).join(',')} rows=${s.rows} finalEqUpload=${!!s.final?.equals(p.body)} staging=${!!s.staging}`);
    expect(rs.filter((r) => r.success).length).toBe(1);
    expect(s.rows).toBe(1);
    expect(s.final?.equals(p.body)).toBe(true);
  });

  test('RACE: second confirm after a re-PUT replaces the recorded file (D-1/D-3 guarantee)', async () => {
    const v1 = PDF('ORIGINAL certificate, valid until 2027');
    const v2 = PDF('FORGED   certificate, valid until 2099');
    expect(v2.length).toBe(v1.length); // the signed PUT pins type + length, nothing else
    const p = await upload('race.pdf', v1);
    // Slow only the FIRST confirm's post-copy HEAD of the final key (store latency; the case this fix is about).
    let heads = 0;
    let copies = 0;
    state.hook = (r) => {
      if (r.isCopy) copies++;
      if (r.method === 'HEAD' && !r.key.includes('/incoming/') && heads++ === 0) return { delay: 3000 };
      return 'pass';
    };
    const A = confirm(p.objectKey);
    while (copies < 1) await sleep(20); // A's CopyObject (pinned to v1) went through
    // The holder of the 15-min signed PUT re-uploads while A is still saving its row.
    expect((await put(p.uploadUrl, v2)).status).toBe(200);
    const C = confirm(p.objectKey);
    const [ra, rc] = await Promise.all([A, C]);
    state.hook = null;
    const s = await snapshot(p.objectKey);
    const row = (await rows(p.objectKey))[0];
    actAsOwner();
    const dl = row ? await download.GET(new Request(`http://localhost/api/evidence/${row.id}/download`), { params: Promise.resolve({ id: row.id }) }) : null;
    let served: Buffer | null = null;
    if (dl?.status === 302) served = Buffer.from(await (await fetch(dl.headers.get('location')!)).arrayBuffer());
    log(`RACE → A=${short(ra)} C=${short(rc)} rows=${s.rows} rowSize=${s.size} (v1=${v1.length}, v2=${v2.length})\n   final==v1: ${!!s.final?.equals(v1)}  final==v2: ${!!s.final?.equals(v2)}  download serves: ${served?.toString('latin1').split('\n')[1] ?? dl?.status}\n   store log: ${state.log.join(' ; ')}`);
    // What the recorded row must point at: the bytes confirm A checked and recorded.
    expect(s.final?.equals(v1), 'recorded file replaced after its confirm').toBe(true);
  }, 30000);
});
describe('concurrency 2', () => {
  test('RACE-2: row written by A (v1), file overwritten by C (v2) after A committed', async () => {
    const v1 = PDF('ORIGINAL certificate, valid until 2027');
    const v2 = PDF('FORGED   certificate, valid until 2099');
    const p = await upload('race2.pdf', v1);
    let copies = 0; let finalHeads = 0; let dels = 0;
    // A slow store: A's post-copy HEAD 1.5 s, C's CopyObject 2.5 s, A's staging DELETE 4 s.
    state.hook = (r) => {
      if (r.isCopy) { copies++; return copies === 2 ? { delay: 2500 } : 'pass'; }
      if (r.method === 'HEAD' && !r.key.includes('/incoming/') && finalHeads++ === 0) return { delay: 1500 };
      if (r.method === 'DELETE' && dels++ === 0) return { delay: 4000 };
      return 'pass';
    };
    const A = confirm(p.objectKey);
    while (copies < 1) await sleep(10);
    expect((await put(p.uploadUrl, v2)).status).toBe(200);
    const C = confirm(p.objectKey);
    const [ra, rc] = await Promise.all([A, C]);
    state.hook = null;
    const s = await snapshot(p.objectKey);
    const row = (await rows(p.objectKey))[0];
    const dl = await download.GET(new Request(`http://localhost/api/evidence/${row.id}/download`), { params: Promise.resolve({ id: row.id }) });
    const served = Buffer.from(await (await fetch(dl.headers.get('location')!)).arrayBuffer());
    log(`RACE-2 → A=${short(ra)} C=${short(rc)} rows=${s.rows} rowId==A: ${(ra as { evidence?: { id: string } }).evidence?.id === row.id}\n   final==v1: ${!!s.final?.equals(v1)}  final==v2: ${!!s.final?.equals(v2)}  download of A's row serves: ${served.toString('latin1').split('\n')[1]}\n   store log: ${state.log.join(' ; ')}`);
    expect(s.final?.equals(v1), "A's recorded file replaced after A committed").toBe(true);
  }, 30000);
});
function actAsOwner() { state.session = { user: { id: t.user }, tenantId: t.a, role: 'TENANT_OWNER' }; }

describe('real outage (docker)', () => {
  test('docker pause 8 s mid-confirm → waits, succeeds, file intact', async () => {
    const p = await upload('pause.pdf');
    execSync('docker pause crwfb82-minio');
    const un = setTimeout(() => execSync('docker unpause crwfb82-minio'), 8000);
    const t0 = Date.now();
    const r = await confirm(p.objectKey);
    const ms = Date.now() - t0;
    clearTimeout(un);
    try { execSync('docker unpause crwfb82-minio 2>/dev/null'); } catch { /* already */ }
    const s = await snapshot(p.objectKey);
    log(`docker PAUSE 8s → success=${r.success} ms=${ms} rows=${s.rows} finalEqUpload=${!!s.final?.equals(p.body)} staging=${!!s.staging}`);
    expect(r.success).toBe(true);
    expect(s.rows).toBe(1);
    expect(s.final?.equals(p.body)).toBe(true);
  }, 90000);
  test('docker stop → storage_unavailable, no row; start → retry ok', async () => {
    const p = await upload('stop.pdf');
    execSync('docker stop -t 1 crwfb82-minio');
    const t0 = Date.now();
    const r = await confirm(p.objectKey);
    const ms = Date.now() - t0;
    const rowsDown = (await rows(p.objectKey)).length;
    execSync('docker start crwfb82-minio');
    for (let i = 0; i < 60 && !(await bytesOf(p.objectKey)); i++) await sleep(500);
    log(`docker STOP → ${short(r)} ms=${ms} rows=${rowsDown}`);
    await faultThenRetry('docker stop', p, r, 'storage_unavailable');
  }, 90000);
});
