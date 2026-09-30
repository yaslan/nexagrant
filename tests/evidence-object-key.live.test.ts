import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * TASK-MUN80W2VFY56R (Y-4 of the TASK-MUN66T2HM4A4E scan) — tenant A must not
 * be able to record tenant B's stored object on one of its own evidence rows,
 * nor remove it from the store by deleting that row.
 *
 * Two real tenants; the evidence actions run over `fabrika_app` (NOBYPASSRLS,
 * asserted) with only the session and `revalidatePath` replaced. The store is
 * the local stand-in (`.dev-objects`, no R2 credentials), so "B's file is still
 * there" is a file on disk, not a mock's call log. A positive control deletes
 * one of A's own files through the same path, so an untouched B file is not
 * the result of a delete that never runs.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'evidence-object-key.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `evk-${Date.now().toString(36)}`;

const state = vi.hoisted(() => {
  // The local store only stands in for R2 when no R2 account is configured.
  process.env.R2_ACCOUNT_ID = '';
  return {
    rls: undefined as PrismaClient | undefined,
    scope: {
      tenantId: '',
      userId: '',
      role: 'TENANT_OWNER',
      workspaceIds: [] as string[],
      isPlatformAdmin: false,
    },
  };
});

vi.mock('@/lib/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tenant')>();
  return {
    ...actual,
    requireTenantAction: async () => state.scope,
    tenantScopeOf: () => state.scope,
    assertTenantActionWritable: async () => {},
  };
});
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

const STORE = join(process.cwd(), '.dev-objects');
const fileOf = (key: string) => join(STORE, key);

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const t = { a: '', b: '', userA: '', userB: '' };
const evidenceIds: string[] = [];

async function putFile(key: string, text: string) {
  await mkdir(dirname(fileOf(key)), { recursive: true });
  await writeFile(fileOf(key), text);
}

function actAs(tenant: 'a' | 'b') {
  state.scope = { ...state.scope, tenantId: t[tenant], userId: tenant === 'a' ? t.userA : t.userB };
}

const upload = (objectKey: string) => ({
  title: `${RUN} upload`,
  category: 'CAT-03',
  objectKey,
  fileName: 'x.pdf',
  fileSizeBytes: 3,
  mimeType: 'application/pdf',
});

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
  if (admin) {
    await admin.evidence.deleteMany({ where: { id: { in: presentIds(evidenceIds) } } }).catch(() => {});
    for (const tenantId of presentIds([t.a, t.b])) {
      await admin.evidence.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } }).catch(() => {});
      await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
      // Only this run's tenant directories; the store's other contents are untouched.
      await rm(join(STORE, requireId(tenantId, 'tenantId')), { recursive: true, force: true });
    }
    await admin.user.deleteMany({ where: { id: { in: presentIds([t.userA, t.userB]) } } }).catch(() => {});
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
});

describe('evidence object keys stay inside their tenant (Y-4)', () => {
  test('A cannot record B’s object, nor any key that climbs out of A’s prefix', async () => {
    const bKey = `${t.b}/org-default/certificate/2026/aaaaaaaa_b_secret.pdf`;
    await putFile(bKey, 'B');

    for (const key of [
      bKey,
      `${t.a}/../${bKey}`,
      `${t.a}/%2e%2e/${bKey}`,
      `${t.a}//${bKey}`,
      `/${bKey}`,
      `https://files.example.com/${bKey}`,
      `${t.a}/..\\${bKey}`,
    ]) {
      const res = await evidence.confirmEvidenceUploadAction(upload(key));
      expect(res, key).toEqual({ success: false, error: 'invalid_object_key' });
    }
    // A key of the wrong type from a hand-built request is refused the same way.
    const odd = await evidence.confirmEvidenceUploadAction({ ...upload(''), objectKey: undefined as unknown as string });
    expect(odd).toEqual({ success: false, error: 'invalid_object_key' });

    expect(await admin!.evidence.count({ where: { tenantId: t.a } })).toBe(0);
    expect(existsSync(fileOf(bKey))).toBe(true);
  });

  test('a row of A that already names B’s object loses the row, B keeps the file', async () => {
    // As a row written before the fix would look.
    const bKey = `${t.b}/org-default/certificate/2026/bbbbbbbb_b_contract.pdf`;
    await putFile(bKey, 'B');
    const legacy = await admin!.evidence.create({
      data: { tenantId: t.a, kind: 'certificate', title: `${RUN} legacy`, body: '', r2ObjectKey: bKey },
    });
    evidenceIds.push(legacy.id);
    const legacyUrl = await admin!.evidence.create({
      data: {
        tenantId: t.a,
        kind: 'certificate',
        title: `${RUN} legacy-url`,
        body: '',
        fileUrl: `https://files.example.com/${bKey}`,
      },
    });
    evidenceIds.push(legacyUrl.id);

    expect(await evidence.deleteEvidence(legacy.id)).toEqual({ success: true });
    expect(await evidence.deleteEvidence(legacyUrl.id)).toEqual({ success: true });

    expect(await admin!.evidence.count({ where: { id: { in: [legacy.id, legacyUrl.id] } } })).toBe(0);
    expect(existsSync(fileOf(bKey))).toBe(true);
  });

  test('A cannot delete B’s row, and B’s file stays', async () => {
    const bKey = `${t.b}/org-default/certificate/2026/cccccccc_b_own.pdf`;
    await putFile(bKey, 'B');
    const bRow = await admin!.evidence.create({
      data: { tenantId: t.b, kind: 'certificate', title: `${RUN} b`, body: '', r2ObjectKey: bKey },
    });
    evidenceIds.push(bRow.id);

    expect(await evidence.deleteEvidence(bRow.id)).toEqual({ success: false });
    expect(await admin!.evidence.count({ where: { id: bRow.id } })).toBe(1);
    expect(existsSync(fileOf(bKey))).toBe(true);
  });

  test('positive control: A records and deletes its own presigned upload, the file goes', async () => {
    const presign = await evidence.getPresignedUploadUrlAction('certificate', 'Kalite Belgesi.pdf', 'application/pdf', 10);
    if (!presign.success) throw new Error(`presign refused: ${presign.error}`);
    const { objectKey } = presign;
    expect(objectKey.startsWith(`${t.a}/`)).toBe(true);
    // What the browser's PUT would have stored; confirm checks it is a PDF (TASK-MUNODY0DVDWC5).
    await putFile(objectKey, '%PDF-1.4 A');

    const res = await evidence.confirmEvidenceUploadAction(upload(objectKey));
    expect(res.success).toBe(true);
    const row = await admin!.evidence.findFirst({ where: { tenantId: t.a, r2ObjectKey: objectKey } });
    expect(row, 'the row really exists (not the DB-offline fallback)').not.toBeNull();
    evidenceIds.push(row!.id);

    expect(await evidence.deleteEvidence(row!.id)).toEqual({ success: true });
    expect(existsSync(fileOf(objectKey))).toBe(false);
  });

  test('FormData upload: the file name cannot steer the key, and the bytes are really stored', async () => {
    const form = new FormData();
    form.set('title', `${RUN} form`);
    form.set('category', `../../${t.b}`);
    form.set('file', new File(['%PDF-1.4 A'], `../../${t.b}/org-default/x.pdf`, { type: 'application/pdf' }));

    const created = (await evidence.createEvidence(form)) as { id: string };
    evidenceIds.push(created.id);
    const row = await admin!.evidence.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tenantId).toBe(t.a);
    expect(row.r2ObjectKey?.startsWith(`${t.a}/org-default/`)).toBe(true);
    expect(row.r2ObjectKey?.split('/')).toHaveLength(5);
    expect(existsSync(fileOf(row.r2ObjectKey!))).toBe(true);

    expect(await evidence.deleteEvidence(row.id)).toEqual({ success: true });
    expect(existsSync(fileOf(row.r2ObjectKey!))).toBe(false);
  });
});
