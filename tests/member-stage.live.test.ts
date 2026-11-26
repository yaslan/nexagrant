import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * NG-364: the member stage of a consortium seat on a real database.
 *
 * `setSeatMemberStage` is the real server action; only the session (`requireTenantAction`) is
 * faked. Its transaction runs over `fabrika_app` (NOBYPASSRLS, asserted), so a seat of another
 * tenant is invisible to it: the refusal below is the row-level policy's, not a test fixture's.
 *
 * `.live`: needs Postgres and `pnpm db:rls-role`. Locally a missing database skips the file; in CI
 * it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'member-stage.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `member-stage-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  scope: { tenantId: '', userId: '', role: 'PIPELINE_MANAGER', workspaceIds: [] as string[], isPlatformAdmin: false },
}));

vi.mock('@/lib/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tenant')>();
  return {
    ...actual,
    requireTenantAction: async () => state.scope,
    assertTenantActionWritable: async () => {},
  };
});
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  const withTenant = (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
    actual.withTenantOn(state.rls!, tenantId, cb);
  return { ...actual, withTenant };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient, withTenantOn } = await import('@/lib/db');
const m8 = await import('@/modules/m8/server/actions');
const { setMemberStage } = await import('@/modules/m8/server/member-stage');
type TenantTx = import('@/lib/db').TenantTx;

/**
 * NG-368: `tx` whose `consortiumSeat.findFirst` reads the seat, reports it, and then waits for
 * `gate` before handing the row back, so the write that follows runs only after `gate`. Lets one
 * request read the row, another write it, and the first write afterwards, in that order every run.
 * The write itself is the real, unwrapped `updateMany`.
 */
function pausedBeforeWrite(tx: TenantTx, onRead: () => void, gate: Promise<void>): TenantTx {
  const seats = new Proxy(tx.consortiumSeat, {
    get(target, prop) {
      if (prop !== 'findFirst') return Reflect.get(target, prop);
      return async (...args: Parameters<typeof target.findFirst>) => {
        const seat = await target.findFirst(...args);
        onRead();
        await gate;
        return seat;
      };
    },
  });
  return new Proxy(tx, { get: (target, prop) => (prop === 'consortiumSeat' ? seats : Reflect.get(target, prop)) });
}

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const ids = { a: { tenant: '', opp: '', seat: '' }, b: { tenant: '', opp: '', seat: '' } };

const row = (id: string) =>
  admin!.consortiumSeat.findUniqueOrThrow({
    where: { id },
    select: { tenantId: true, status: true, memberStage: true, memberStageAt: true, loiReceivedAt: true, loiDocumentUrl: true },
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

  for (const key of ['a', 'b'] as const) {
    const t = await admin.tenant.create({
      data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    });
    tenants.push(t.id);
    const ws = await admin.workspace.create({ data: { tenantId: t.id, name: `${RUN}-${key}`, slug: `${RUN}-${key}` } });
    const opp = await admin.opportunity.create({ data: { tenantId: t.id, workspaceId: ws.id, title: `${RUN} ${key}`, stage: 'G0' } });
    const seat = await admin.consortiumSeat.create({
      data: { tenantId: t.id, opportunityId: opp.id, roleKey: 'research', status: 'INVITED', organizationId: `${RUN}-org-${key}` },
    });
    ids[key] = { tenant: t.id, opp: opp.id, seat: seat.id };
  }
  state.scope = { ...state.scope, tenantId: ids.a.tenant, userId: `${RUN}-user` };
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin) {
    await admin.consortiumSeat.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } }).catch(() => {});
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('setSeatMemberStage on a real database (NG-364)', () => {
  test('interested → met → letter of intent: each step is written to the row', async () => {
    const { seat, opp } = ids.a;
    expect(await row(seat)).toMatchObject({ memberStage: null, loiReceivedAt: null });

    expect(await m8.setSeatMemberStage({ seatId: seat, opportunityId: opp, stage: 'INTERESTED' })).toMatchObject({
      ok: true,
      memberStage: 'INTERESTED',
      loiReceivedAt: null,
    });
    expect(await m8.setSeatMemberStage({ seatId: seat, opportunityId: opp, stage: 'MET' })).toMatchObject({ ok: true });
    const result = await m8.setSeatMemberStage({
      seatId: seat,
      opportunityId: opp,
      stage: 'LOI',
      loiReceivedAt: '2026-11-02',
      loiDocumentUrl: 'https://files.example.org/loi.pdf',
    });
    expect(result).toMatchObject({ ok: true, memberStage: 'LOI', loiReceivedAt: '2026-11-02T00:00:00.000Z' });

    const written = await row(seat);
    console.log(`[${SUITE}] row after LOI:`, JSON.stringify(written));
    expect(written).toMatchObject({
      tenantId: ids.a.tenant,
      status: 'INVITED',
      memberStage: 'LOI',
      loiReceivedAt: new Date('2026-11-02T00:00:00.000Z'),
      loiDocumentUrl: 'https://files.example.org/loi.pdf',
    });
    expect(written.memberStageAt).toBeInstanceOf(Date);
  });

  test('a rule refusal writes nothing: stage CONFIRMED on a seat that is only INVITED', async () => {
    const before = await row(ids.a.seat);
    expect(await m8.setSeatMemberStage({ seatId: ids.a.seat, opportunityId: ids.a.opp, stage: 'CONFIRMED' })).toEqual({
      ok: false,
      code: 'SEAT_NOT_CONFIRMED',
    });
    expect(await row(ids.a.seat)).toEqual(before);
  });

  test('bad input is refused before the database: a javascript: link, an unknown stage', async () => {
    for (const input of [
      { seatId: ids.a.seat, opportunityId: ids.a.opp, stage: 'LOI', loiDocumentUrl: 'javascript:alert(1)' },
      { seatId: ids.a.seat, opportunityId: ids.a.opp, stage: 'SIGNED' },
      { seatId: ids.a.seat, opportunityId: ids.a.opp, stage: 'LOI', loiReceivedAt: 'yesterday' },
    ]) {
      expect(await m8.setSeatMemberStage(input)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    }
  });

  test('another tenant’s seat: SEAT_NOT_FOUND under RLS, and its row is untouched', async () => {
    const before = await row(ids.b.seat);
    // Tenant A's session names tenant B's seat and opportunity.
    const result = await m8.setSeatMemberStage({ seatId: ids.b.seat, opportunityId: ids.b.opp, stage: 'MET' });
    console.log(`[${SUITE}] tenant A on tenant B's seat:`, JSON.stringify(result));
    expect(result).toEqual({ ok: false, code: 'SEAT_NOT_FOUND' });
    expect(await row(ids.b.seat)).toEqual(before);

    // The row exists (the admin connection sees it); fabrika_app under tenant A's context does not.
    const seenByA = await state.rls!.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ids.a.tenant}, true)`;
      return tx.consortiumSeat.count({ where: { id: ids.b.seat } });
    });
    expect(seenByA).toBe(0);
  });

  test('NG-368: two requests read the same letter; the late one gets SEAT_CHANGED and the URL stays', async () => {
    const tenantId = ids.a.tenant;
    const opportunityId = ids.a.opp;
    const firstLetter = new Date('2026-11-01T00:00:00.000Z');
    const seat = await admin!.consortiumSeat.create({
      data: {
        tenantId,
        opportunityId,
        roleKey: 'industry',
        status: 'INVITED',
        organizationId: `${RUN}-org-race`,
        memberStage: 'LOI',
        memberStageAt: firstLetter,
        loiReceivedAt: firstLetter,
      },
      select: { id: true },
    });
    const url = 'https://files.example.org/race-loi.pdf';
    const now = new Date();

    let readDone!: () => void;
    const read = new Promise<void>((resolve) => (readDone = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    // Request 1 corrects the date. It reads the row (no URL yet) and pauses before its write.
    const late = withTenantOn(state.rls!, tenantId, (tx) =>
      setMemberStage(pausedBeforeWrite(tx, readDone, gate), {
        tenantId,
        opportunityId,
        seatId: seat.id,
        request: { to: 'LOI', loiReceivedAt: new Date('2026-11-03T00:00:00.000Z') },
        now,
      }),
    );
    await read;

    // Request 2 read the same row and adds the document; it commits first.
    const early = await withTenantOn(state.rls!, tenantId, (tx) =>
      setMemberStage(tx, { tenantId, opportunityId, seatId: seat.id, request: { to: 'LOI', loiDocumentUrl: url }, now }),
    );
    expect(early).toMatchObject({ ok: true, data: { loiDocumentUrl: url } });

    release();
    const lateResult = await late;
    const after = await row(seat.id);
    console.log(`[${SUITE}] race: late=${JSON.stringify(lateResult)} row=${JSON.stringify(after)}`);
    expect(lateResult).toEqual({ ok: false, code: 'SEAT_CHANGED' });
    expect(after).toMatchObject({ memberStage: 'LOI', loiReceivedAt: firstLetter, loiDocumentUrl: url });
  });

  test('a seat of this tenant named with another opportunity is not found', async () => {
    expect(await m8.setSeatMemberStage({ seatId: ids.a.seat, opportunityId: ids.b.opp, stage: 'MET' })).toEqual({
      ok: false,
      code: 'SEAT_NOT_FOUND',
    });
  });
});
