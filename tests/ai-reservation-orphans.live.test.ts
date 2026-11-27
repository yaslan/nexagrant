import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

/**
 * NG-387 (NG-202 B3) — the orphaned M18 credit reservation, on a real Postgres, the `fabrika_app`
 * role (NOBYPASSRLS, asserted).
 *
 * An M18 action reserves its price as a `usage:M18` CreditLedger row BEFORE the model call
 * (ai-credits.ts). If the process dies before the action ends, neither the `refund:M18` row nor an
 * `llm-refund` alert is written and the tenant's credit is gone, silently. A delivered action
 * writes no refund either: its reservation IS the charge. What tells the two apart is the
 * delivery marker, `AiUsageLog.refId` = the reservation's refId, written by generateCompletion on
 * a complete answer.
 *
 * Scenarios (the card's five, plus the pre-marker history):
 *   i.   a delivered M18 action (the real reserve → generateCompletion path) is NOT refunded;
 *   ii.  an orphaned M18 reservation is refunded once, the balance comes back, ONE SystemAlert opens;
 *   iii. a second run changes nothing and opens no alert;
 *   iv.  an M17 reservation is never refunded by this job (m17-stale-runs owns it);
 *   v.   a reservation younger than RESERVATION_ORPHAN_MINUTES is not touched;
 *   vi.  a reservation older than the first delivery marker (written before the marker existed)
 *        is not touched — it may have been delivered, nothing can prove otherwise.
 *
 * The sweep is cross-tenant, and other live suites run in parallel against the same database. It
 * matches reservations OLDER than its `now`, so it runs with a `now` in 2001 against rows dated
 * then (T0), like m17-stale-runs.live: no other suite's row matches. It also refuses the shared
 * local `fabrika` database (GitHub Actions' `fabrika` is a throwaway service container).
 *
 * Only `fetch` (the Anthropic endpoint) is replaced: no real model call.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop) => (prop === 'ANTHROPIC_API_KEY' ? 'test-key' : Reflect.get(target, prop)),
    }),
  };
});

const { createDbClient, prisma } = await import('@/lib/db');
const { generateCompletion } = await import('@/lib/llm');
const { attemptPurpose, withM18Reservation } = await import('@/modules/m18/server/ai-credits');
const { releaseOrphanReservations, ORPHAN_ALERT_SOURCE } = await import('@/lib/ai/reservation-orphans');
const { aiReservationOrphansTask } = await import('@/lib/jobs/tasks/ai-reservation-orphans');
const { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } = await import('./helpers/live-db-role');
const { presentIds, requireId } = await import('./helpers/teardown-guard');

const SUITE = 'ai-reservation-orphans.live';
const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the sweep works across every tenant; refusing to run on the shared "fabrika" database, so its tests did NOT run');
const HAS_DB = DB_NAME !== undefined && !SHARED;
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `ng387-${Math.random().toString(36).slice(2, 10)}`;
/** This file's clock: every row and every sweep is dated here, so no other suite's row matches. */
const T0 = new Date('2001-01-01T00:00:00.000Z');
const MIN = 60_000;
const ENRICH = 'enrich-organization';

const tenantIds: string[] = [];
const userIds: string[] = [];
let passed = 0;

type Owner = { tenantId: string; userId: string };

async function makeTenant(key: string, grant = 20): Promise<Owner> {
  const t = await admin.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenantIds.push(t.id);
  await admin.creditLedger.create({ data: { tenantId: t.id, delta: grant, reason: 'purchase', createdAt: new Date(T0.getTime() - 400 * 24 * 60 * MIN) } });
  const u = await admin.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  userIds.push(u.id);
  await admin.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
  return { tenantId: t.id, userId: u.id };
}

const refIdOf = (purpose: string) => `M18:${purpose}:${RUN}-${Math.random().toString(36).slice(2, 10)}`;

/** What reserveM18Action writes, dated `at`. */
async function reservation(owner: Owner, at: Date, module = 'M18', refId = refIdOf(ENRICH)): Promise<string> {
  await admin.creditLedger.create({ data: { tenantId: owner.tenantId, delta: -1, reason: `usage:${module}`, refId, createdAt: at } });
  return refId;
}

/** A delivery marker as generateCompletion writes it on a complete answer, dated `at`. */
async function marker(owner: Owner, refId: string, at: Date): Promise<void> {
  await admin.aiUsageLog.create({
    data: {
      tenantId: owner.tenantId,
      module: 'M18',
      purpose: attemptPurpose(ENRICH),
      provider: 'anthropic',
      model: 'scripted',
      promptHash: 'x',
      inputTokens: 1,
      outputTokens: 1,
      credits: 0,
      refId,
      createdAt: at,
    },
  });
}

async function balance(tenantId: string): Promise<number> {
  const r = await admin.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
}

const refunds = (refId: string) => admin.creditLedger.count({ where: { refId, reason: { startsWith: 'refund:' } } });
const orphanAlerts = () => admin.systemAlert.count({ where: { source: ORPHAN_ALERT_SOURCE, createdAt: { gte: STARTED } } });

const STARTED = new Date();

function helpers(): JobHelpers {
  const noop = () => {};
  return {
    job: { id: RUN, attempts: 1, max_attempts: 3 } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

function anthropicReply(): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe.skipIf(!HAS_DB)('orphaned M18 credit reservations (NG-387, live, fabrika_app)', () => {
  afterEach(({ task }) => {
    if (task.result?.state === 'pass') passed++;
  });

  afterAll(async () => {
    process.stderr.write(`${SUITE}: ${passed} tests passed on database "${DB_NAME}"\n`);
    // Literal, not ORPHAN_ALERT_SOURCE: the teardown where-guard accepts only values that cannot be undefined.
    await admin.systemAlert.deleteMany({ where: { source: 'ai-reservation-orphans', createdAt: { gte: STARTED } } });
    await admin.aiUsageLog.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.creditLedger.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.membership.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds(userIds) } } });
    await admin.$disconnect();
  });

  const refs = { delivered: '', orphan: '', m17: '', young: '', history: '' };
  const owners: Record<keyof typeof refs, Owner> = {} as Record<keyof typeof refs, Owner>;

  beforeAll(async () => {
    // The first delivery marker in the database: everything reserved before it predates the marker.
    const first = await makeTenant('first');
    const monthBefore = new Date(T0.getTime() - 30 * 24 * 60 * MIN);
    await marker(first, await reservation(first, monthBefore), monthBefore);

    // i. Delivered, through the real path: reserve → generateCompletion (fetch stubbed) → keep.
    owners.delivered = await makeTenant('delivered');
    vi.stubGlobal('fetch', async () => anthropicReply());
    await withM18Reservation(owners.delivered.tenantId, ENRICH, async ({ refId }) => {
      refs.delivered = refId;
      await generateCompletion({
        tenantId: owners.delivered.tenantId,
        userId: owners.delivered.userId,
        module: 'M18',
        purpose: attemptPurpose(ENRICH),
        creditsReserved: true,
        reservationRefId: refId,
        prompt: 'scripted',
      });
      return { keep: true, value: null };
    });
    vi.unstubAllGlobals();
    // Date the delivered action two hours before T0, so the sweep sees it as old enough.
    const twoHoursBefore = new Date(T0.getTime() - 120 * MIN);
    await admin.creditLedger.updateMany({ where: { refId: requireId(refs.delivered, 'delivered refId') }, data: { createdAt: twoHoursBefore } });
    await admin.aiUsageLog.updateMany({ where: { refId: requireId(refs.delivered, 'delivered refId') }, data: { createdAt: twoHoursBefore } });

    // ii. Orphaned: reserved two hours before T0, then the process died.
    owners.orphan = await makeTenant('orphan');
    refs.orphan = await reservation(owners.orphan, twoHoursBefore);
    // iv. An M17 run's reservation, also unrefunded and old (m17-stale-runs owns it).
    owners.m17 = await makeTenant('m17');
    refs.m17 = await reservation(owners.m17, twoHoursBefore, 'M17', `cm17${RUN}:${twoHoursBefore.getTime()}`);
    // v. Reserved 30 minutes before T0: may still be running.
    owners.young = await makeTenant('young');
    refs.young = await reservation(owners.young, new Date(T0.getTime() - 30 * MIN));
    // vi. Reserved 40 days before T0, before the first marker existed.
    owners.history = await makeTenant('history');
    refs.history = await reservation(owners.history, new Date(T0.getTime() - 40 * 24 * 60 * MIN));

    for (const key of Object.keys(refs) as (keyof typeof refs)[]) {
      expect(await balance(owners[key].tenantId), key).toBe(19);
    }
    // First run, through the job (the cron tick is T0).
    await aiReservationOrphansTask({ _cron: { ts: T0.toISOString() } }, helpers());
  });

  test('i. a delivered M18 action (AiUsageLog.refId = its reservation) is NOT refunded', async () => {
    const logged = await admin.aiUsageLog.findMany({ where: { tenantId: owners.delivered.tenantId }, select: { refId: true } });
    expect(logged).toEqual([{ refId: refs.delivered }]);
    expect(await refunds(refs.delivered)).toBe(0);
    expect(await balance(owners.delivered.tenantId)).toBe(19);
  });

  test('ii. an orphaned M18 reservation is refunded once and ONE SystemAlert opens, with no tenant id', async () => {
    expect(await refunds(refs.orphan)).toBe(1);
    expect(await balance(owners.orphan.tenantId)).toBe(20);
    expect(await orphanAlerts()).toBe(1);
    const alert = await admin.systemAlert.findFirstOrThrow({ where: { source: ORPHAN_ALERT_SOURCE, createdAt: { gte: STARTED } } });
    expect(alert.meta).toMatchObject({ released: 1, credits: 1, olderThanMinutes: 60, modules: ['M18'] });
    // SystemAlert is outside RLS: no tenant id in it.
    expect(JSON.stringify(alert)).not.toContain(owners.orphan.tenantId);
  });

  test('iv. an M17 reservation is not refunded by this job (m17-stale-runs owns it)', async () => {
    expect(await refunds(refs.m17)).toBe(0);
    expect(await balance(owners.m17.tenantId)).toBe(19);
  });

  test('v. a reservation younger than RESERVATION_ORPHAN_MINUTES is not touched', async () => {
    expect(await refunds(refs.young)).toBe(0);
    expect(await balance(owners.young.tenantId)).toBe(19);
  });

  test('vi. a reservation older than the first delivery marker is not touched', async () => {
    expect(await refunds(refs.history)).toBe(0);
    expect(await balance(owners.history.tenantId)).toBe(19);
  });

  test('iii. a second run changes nothing and opens no alert', async () => {
    await aiReservationOrphansTask({ _cron: { ts: T0.toISOString() } }, helpers());
    const again = await releaseOrphanReservations(T0, { olderThanMinutes: 60 });
    expect(again).toMatchObject({ released: 0, credits: 0 });
    expect(await refunds(refs.orphan)).toBe(1);
    for (const key of Object.keys(refs) as (keyof typeof refs)[]) {
      expect(await balance(owners[key].tenantId), key).toBe(key === 'orphan' ? 20 : 19);
    }
    expect(await orphanAlerts()).toBe(1);
  });
});
