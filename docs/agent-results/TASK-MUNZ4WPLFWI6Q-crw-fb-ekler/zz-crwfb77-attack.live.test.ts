// İNCELEME-77 (crw-fb) — throwaway attack suite, NOT committed.
// Real MinIO behind a fault-injecting HTTP proxy (127.0.0.1:59478 → MinIO :59477).
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import http from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';

const PROXY_PORT = 59478;
const UPSTREAM = { host: '127.0.0.1', port: 59477 };

const state = vi.hoisted(() => {
  const e = process.env;
  e.R2_ACCOUNT_ID = 'minio-test';
  e.R2_ENDPOINT = 'http://127.0.0.1:59478';
  e.R2_ACCESS_KEY_ID = e.EVIDENCE_S3_TEST_ACCESS_KEY;
  e.R2_SECRET_ACCESS_KEY = e.EVIDENCE_S3_TEST_SECRET_KEY;
  e.R2_BUCKET = e.EVIDENCE_S3_TEST_BUCKET;
  return {
    rls: undefined as PrismaClient | undefined,
    session: null as null | { user: { id: string }; tenantId: string; role: string },
    // proxy fault plan
    fault: { mode: 'pass' as 'pass' | 'dieAfterCopy' | 'delayAfterCopy' | 'delayCopy' | 'down', delayMs: 0, copied: false },
    log: [] as string[],
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
const { loadEvidenceItems } = await import('@/app/[locale]/(app)/[workspace]/evidence/data');
const storage = await import('@/lib/storage');

let admin: PrismaClient;
let proxy: http.Server;
const t = { a: '', b: '', userA: '', userB: '' };
const RUN = `crw77-${Date.now().toString(36)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function actAs(side: 'a' | 'b', role: string) {
  state.session = { user: { id: side === 'a' ? t.userA : t.userB }, tenantId: t[side], role };
}
const PDF = (s: string) => Buffer.from(`%PDF-1.4\n% ${s}\n%%EOF\n`);
const finalOf = (k: string) => k.replace(/^([^/]+)\/incoming\//, '$1/');
const put = (url: string, body: Buffer, ct = 'application/pdf') =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': ct }, body: new Uint8Array(body) });
async function presign(name: string, size: number) {
  const r = await evidence.getPresignedUploadUrlAction('certificate', name, 'application/pdf', size);
  if (!r.success) throw new Error(r.error);
  return r;
}
const confirm = (objectKey: string, over: Record<string, unknown> = {}) =>
  evidence.confirmEvidenceUploadAction({
    title: `${RUN} up`, category: 'CAT-03', objectKey, fileName: 'belge.pdf', fileSizeBytes: 10, mimeType: 'application/pdf', ...over,
  });
const dl = (id: string) => download.GET(new Request(`http://localhost/api/evidence/${id}/download`), { params: Promise.resolve({ id }) });
async function upload(name: string, body = PDF(name)) {
  const p = await presign(name, body.length);
  expect((await put(p.uploadUrl, body)).status).toBe(200);
  return p;
}

beforeAll(async () => {
  proxy = http.createServer((req, res) => {
    const isCopy = req.method === 'PUT' && req.headers['x-amz-copy-source'];
    const tag = `${req.method}${isCopy ? '(copy)' : ''} ${decodeURIComponent((req.url ?? '').split('?')[0])}`;
    state.log.push(tag);
    const f = state.fault;
    const forward = () => {
      const up = http.request({ ...UPSTREAM, method: req.method, path: req.url, headers: req.headers }, (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
        ur.on('end', () => { if (isCopy) f.copied = true; });
      });
      up.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    };
    if (f.mode === 'down') { req.resume(); res.destroy(); return; }
    if (f.mode === 'dieAfterCopy' && f.copied) { req.resume(); res.destroy(); return; }
    if (f.mode === 'delayAfterCopy' && f.copied) { setTimeout(forward, f.delayMs); return; }
    if (f.mode === 'delayCopy' && isCopy) { setTimeout(forward, f.delayMs); return; }
    forward();
  });
  await new Promise<void>((r) => proxy.listen(PROXY_PORT, '127.0.0.1', () => r()));

  state.rls = createDbClient(envValue('DATABASE_URL_RLS_TEST')!);
  admin = createDbClient(envValue('DATABASE_URL')!);
  expect(storage.hasObjectStore).toBe(true);
  for (const side of ['a', 'b'] as const) {
    const tenant = await admin.tenant.create({ data: { name: `${RUN}-${side}`, slug: `${RUN}-${side}`, country: 'TR', kind: 'ORGANIZATION' }, select: { id: true } });
    t[side] = tenant.id;
    const u = await admin.user.create({ data: { email: `${RUN}-${side}@example.invalid`, name: side } });
    t[side === 'a' ? 'userA' : 'userB'] = u.id;
  }
});
beforeEach(() => { state.fault = { mode: 'pass', delayMs: 0, copied: false }; state.log = []; actAs('a', 'TENANT_OWNER'); });
afterAll(async () => {
  state.fault.mode = 'pass';
  for (const id of [t.a, t.b]) if (id) { await admin.evidence.deleteMany({ where: { tenantId: id } }); await admin.tenant.delete({ where: { id } }).catch(() => {}); }
  await admin.user.deleteMany({ where: { id: { in: [t.userA, t.userB].filter(Boolean) } } });
  await admin.$disconnect(); await state.rls?.$disconnect();
  await new Promise((r) => proxy.close(r));
});

describe('Y-1 role matrix (live)', () => {
  test('roles × levels × list/page/download/score', async () => {
    const levels = ['PUBLIC', 'CONSORTIUM', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'confidential', 'Internal', ''];
    const ids: Record<string, string> = {};
    for (const lv of levels) {
      const p = await upload(`m-${lv || 'empty'}.pdf`);
      const r = await confirm(p.objectKey, { confidentiality: lv });
      expect(r.success).toBe(true);
      const id = (r as { evidence: { id: string } }).evidence.id;
      // confirm stores `data.confidentiality || 'INTERNAL'`, so '' becomes INTERNAL
      ids[lv || 'empty'] = id;
    }
    const roles = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER', 'VIEWER_STALE', ''];
    const rows: string[] = [];
    rows.push(['role'.padEnd(16), 'list', 'page', 'score', ...Object.keys(ids).map((k) => k.slice(0, 6).padEnd(6))].join(' | '));
    const result: Record<string, Record<string, number>> = {};
    for (const role of roles) {
      actAs('a', role);
      let list: string;
      try { list = String((await evidence.getEvidenceItemsAction()).length); } catch (e) { list = (e as Error).name.slice(0, 12); }
      const page = (await loadEvidenceItems(t.a, role, state.rls!)).length;
      let score: string;
      try { score = String((await evidence.getHealthScoreAction()).totalItems); } catch (e) { score = (e as Error).name.slice(0, 8); }
      result[role] = {};
      const cells: string[] = [];
      for (const [k, id] of Object.entries(ids)) { const s = (await dl(id)).status; result[role][k] = s; cells.push(String(s).padEnd(6)); }
      rows.push([(role || '(empty)').padEnd(16), list.padEnd(4), String(page).padEnd(4), score.padEnd(5), ...cells].join(' | '));
    }
    console.log('\nROLE MATRIX (download status per stored level; list/page counts of 8 rows)\n' + rows.join('\n'));
    // expectations: writers+ 302 everywhere
    for (const r of ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER']) for (const k of Object.keys(ids)) expect(result[r][k], `${r} ${k}`).toBe(302);
    for (const k of Object.keys(ids)) {
      const open = ['PUBLIC', 'CONSORTIUM', 'INTERNAL', 'empty'].includes(k);
      expect(result.MEMBER[k], `MEMBER ${k}`).toBe(open ? 302 : 403);
      expect(result.GUEST_PARTNER[k], `GUEST ${k}`).toBe(403);
      expect(result.VIEWER_STALE[k]).toBe(403);
    }
    // other tenant's id from a MEMBER of B → 404
    actAs('b', 'TENANT_OWNER');
    expect((await dl(ids.CONFIDENTIAL)).status).toBe(404);
    actAs('b', 'GUEST_PARTNER');
    expect((await dl(ids.CONFIDENTIAL)).status, 'guest of B, id of A').toBe(403);
    // probe: MEMBER sees 403 on a confidential id vs 404 on a made-up id
    actAs('a', 'MEMBER');
    console.log(`MEMBER probe: confidential id → ${(await dl(ids.CONFIDENTIAL)).status}, made-up id → ${(await dl('cnotreal000000000000000000')).status}`);
  });
});

describe('D-1 / staging', () => {
  test('replay PUT after confirm leaves final; staging cleaned; final key never PUT-able', async () => {
    const body = PDF('orig');
    const p = await upload('rp.pdf', body);
    const r = await confirm(p.objectKey);
    expect(r.success).toBe(true);
    expect(await storage.statObject(p.objectKey), 'staging removed after confirm').toBeNull();
    const evil = Buffer.from('<html>x</html>'.padEnd(body.length, ' '));
    expect((await put(p.uploadUrl, evil)).status).toBe(200);
    const fin = await storage.statObject(finalOf(p.objectKey));
    expect(fin!.head.subarray(0, 5).toString()).toBe('%PDF-');
    // second confirm after replay → already_confirmed + staging removed
    expect(await confirm(p.objectKey)).toEqual({ success: false, error: 'already_confirmed' });
    expect(await storage.statObject(p.objectKey)).toBeNull();
    // swap the key in the signed URL to the final one → signature breaks
    const u = new URL(p.uploadUrl); u.pathname = u.pathname.replace('/incoming/', '/');
    console.log('PUT at final key with staging signature →', (await put(u.toString(), evil)).status);
  });

  test('confirm with the other tenant staging key / nested incoming / final key', async () => {
    actAs('b', 'TENANT_OWNER');
    const pb = await upload('b.pdf');
    actAs('a', 'TENANT_OWNER');
    expect(await confirm(pb.objectKey)).toEqual({ success: false, error: 'invalid_object_key' });
    const aStaging = `${t.a}/incoming/${pb.objectKey.split('/').slice(2).join('/')}`;
    expect(await confirm(aStaging), 'same rest under own tenant → nothing there').toEqual({ success: false, error: 'object_missing' });
    expect(await storage.statObject(pb.objectKey), 'B staging untouched').not.toBeNull();
    for (const k of [`${t.a}/incoming/incoming/x.pdf`, `${t.a}/incoming/${t.b}/x.pdf`]) {
      console.log(`confirm ${k.replace(t.a, 'A').replace(t.b, 'B')} →`, JSON.stringify(await confirm(k)));
    }
    expect(await admin.evidence.count({ where: { tenantId: t.a, r2ObjectKey: { contains: '/incoming/' } } })).toBe(0);
  });
});

describe('D-3 concurrency', () => {
  test('5 confirms at once: one row, file intact, staging gone', async () => {
    const p = await upload('c5.pdf');
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => confirm(p.objectKey)));
    console.log('5x confirm →', rs.map((r) => (r.success ? 'ok' : (r as { error: string }).error)).join(','));
    expect(rs.filter((r) => r.success).length).toBe(1);
    expect(await admin.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } })).toBe(1);
    expect(await storage.statObject(finalOf(p.objectKey))).not.toBeNull();
    expect(await storage.statObject(p.objectKey)).toBeNull();
  });
});

describe('store failure mid-confirm (proxy)', () => {
  test('store down before copy: object_missing, no row, staging kept', async () => {
    const p = await upload('down.pdf');
    state.fault.mode = 'down';
    const r = await confirm(p.objectKey);
    state.fault.mode = 'pass';
    console.log('down-before-copy →', JSON.stringify(r));
    expect(r).toEqual({ success: false, error: 'object_missing' });
    expect(await admin.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } })).toBe(0);
    expect(await storage.statObject(p.objectKey), 'staging still there → retry possible').not.toBeNull();
    const retry = await confirm(p.objectKey);
    expect(retry.success, 'retry after store is back').toBe(true);
  });

  test('store dies right after CopyObject', async () => {
    const p = await upload('die.pdf');
    state.fault.mode = 'dieAfterCopy';
    const r = await confirm(p.objectKey);
    const log = [...state.log];
    state.fault.mode = 'pass';
    const rows = await admin.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    const st = !!(await storage.statObject(p.objectKey));
    const fi = !!(await storage.statObject(finalOf(p.objectKey)));
    console.log(`die-after-copy → ${JSON.stringify(r)} rows=${rows} staging=${st} final=${fi}\n  requests: ${log.join(' ; ')}`);
    const retry = await confirm(p.objectKey);
    console.log('  retry →', JSON.stringify(retry).slice(0, 80));
  });

  test('store slow after copy (HEAD/GET 6 s) > interactive tx timeout', async () => {
    const p = await upload('slow.pdf');
    state.fault.mode = 'delayAfterCopy';
    state.fault.delayMs = 6000;
    const t0 = Date.now();
    const r = await confirm(p.objectKey);
    const ms = Date.now() - t0;
    state.fault.mode = 'pass';
    await sleep(200);
    const rows = await admin.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    const st = !!(await storage.statObject(p.objectKey));
    const fi = !!(await storage.statObject(finalOf(p.objectKey)));
    console.log(`slow-after-copy (${ms} ms) → success=${r.success} id=${(r as { evidence?: { id: string } }).evidence?.id} rows=${rows} staging=${st} final=${fi}`);
  }, 30000);

  test('two confirms, first slow in CopyObject (6 s): what the second gets', async () => {
    const p = await upload('slow2.pdf');
    state.fault.mode = 'delayCopy';
    state.fault.delayMs = 6000;
    const first = confirm(p.objectKey);
    await sleep(300);
    const second = await confirm(p.objectKey);
    const f = await first;
    state.fault.mode = 'pass';
    const rows = await admin.evidence.count({ where: { tenantId: t.a, r2ObjectKey: finalOf(p.objectKey) } });
    const fi = !!(await storage.statObject(finalOf(p.objectKey)));
    console.log(`slow-copy pair → first=${JSON.stringify(f).slice(0, 90)} second=${JSON.stringify(second).slice(0, 90)} rows=${rows} final=${fi}`);
  }, 30000);
});
