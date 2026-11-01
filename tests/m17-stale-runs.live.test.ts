import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { InterregAnalysisStatus } from '@prisma/client';

/**
 * FO-317 — M17 credit follow-ups on a real Postgres, the `fabrika_app` role (NOBYPASSRLS, asserted).
 *
 *  1. The tenant credit lock of the DONE transaction (evaluate.ts, FO-303 Ö-1), on TWO connections:
 *     connection A holds the run's DONE transaction open just after taking the lock; connection B
 *     runs a writer that releases reservations (the text purge, the stale-run sweeper). B must WAIT
 *     on the advisory lock until A commits, then see DONE and refund nothing. Remove the lock from
 *     the DONE transaction and B no longer waits: these tests go red (mutation, FO-317 report).
 *  2. The stale-run sweeper (stale-runs.ts): a dead run's reservation is released once — a second
 *     sweep, and two at once, refund nothing more — and a fresh claim is not touched.
 *
 * Both writers are cross-tenant. They run here with a `now` in 2001, and every row of this file is
 * dated around then, so the sweep and the purge match only this file's rows and never another live
 * suite's, which run in parallel against the same database. Like m17-text-retention.live, it still
 * refuses the shared local database named `fabrika` outside CI.
 *
 * Only the model is replaced: `generateCompletion` returns a scripted answer. The singleton is
 * swapped to the RLS URL (as m17-text-retention.live), so withTenant and withSystemScope both run
 * as fabrika_app; fixtures and reads go through the owner role.
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

const state = vi.hoisted(() => ({
  /** Set: the next `interregCriterionMark.deleteMany` inside withTenant (the DONE transaction's first write) stops here. */
  pauseDone: undefined as { held: () => void; release: Promise<void> } | undefined,
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  // The DONE transaction is held open at its first write, i.e. after its `lockTenantCredits`
  // (if it still has one): the pause does not depend on the lock, so a mutation that removes the
  // lock still pauses here, and only the waiting of connection B tells the difference.
  const pausing = (tx: object): object =>
    new Proxy(tx, {
      get: (target, prop) => {
        const value = Reflect.get(target, prop);
        if (prop !== 'interregCriterionMark') return value;
        return new Proxy(value as object, {
          get: (t, p) => {
            const fn = Reflect.get(t, p);
            if (p !== 'deleteMany' || !state.pauseDone) return fn;
            const pause = state.pauseDone;
            state.pauseDone = undefined;
            return async (...args: unknown[]) => {
              pause.held();
              await pause.release;
              return (fn as (...a: unknown[]) => unknown).apply(t, args);
            };
          },
        });
      },
    });
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenant(tenantId, (tx) => cb(pausing(tx) as typeof tx)),
  };
});

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm')>();
  return {
    ...actual,
    generateCompletion: async () => ({
      text: goodAnswer(),
      inputTokens: 1000,
      outputTokens: 500,
      credits: 0,
      provider: 'anthropic',
      model: 'scripted',
      stopReason: 'end_turn',
    }),
  };
});

const { createDbClient, prisma } = await import('@/lib/db');
const { runEvaluation, runRef, STALE_CLAIM_MS } = await import('@/modules/m17/server/evaluate');
const { releaseStaleRuns } = await import('@/modules/m17/server/stale-runs');
const { purgeExpiredInterregText } = await import('@/modules/m17/server/retention');
const { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } = await import('./helpers/live-db-role');
const { presentIds } = await import('./helpers/teardown-guard');

const SUITE = 'm17-stale-runs.live';
const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) console.warn(`${SUITE} skipped: the sweep works across every tenant; refusing to run on the shared "fabrika" database`);
const HAS_DB = REACHABLE && !SHARED;
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `m17s-${Math.random().toString(36).slice(2, 10)}`;
const RUBRIC = 'interreg-next-bsb.call2.regular';
const PRICE = 3;
/** This file's clock: every row and every sweep is dated here, so no other suite's row matches. */
const T0 = new Date('2001-01-01T00:00:00.000Z');
const MIN = 60_000;

const tenantIds: string[] = [];
const userIds: string[] = [];
let criterionKeys: string[] = [];
let programCheckKeys: string[] = [];

type Owner = { tenantId: string; userId: string };

function goodAnswer(): string {
  return JSON.stringify({
    rubricId: RUBRIC,
    callGridNote: null,
    criterionMarks: criterionKeys.map((k) => ({
      criterionKey: k,
      mark: 3,
      strengths: [`${k} strength`],
      weaknesses: [`${k} weakness`],
      evidence: [{ quote: `quote for ${k}`, location: 'C.4' }],
    })),
    programChecks: programCheckKeys.map((key) => ({ key, status: 'met', note: `${key} ok` })),
    redFlags: [],
    improvements: [],
    rewrite: { originalExcerpt: 'We will do things.', location: 'C.2.1', revisedEn: 'The partnership will jointly develop…' },
  });
}

async function makeTenant(key: string, grant = 50): Promise<Owner> {
  const t = await admin.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenantIds.push(t.id);
  await admin.creditLedger.create({ data: { tenantId: t.id, delta: grant, reason: 'purchase' } });
  const u = await admin.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  userIds.push(u.id);
  await admin.membership.create({ data: { tenantId: t.id, userId: u.id, role: 'MEMBER' } });
  return { tenantId: t.id, userId: u.id };
}

/** An analysis with both texts, in `status`, claimed (updatedAt) at `updatedAt`, texts expiring at `expiresAt`. */
async function analysis(owner: Owner, status: InterregAnalysisStatus, updatedAt: Date, expiresAt = new Date(Date.now() + 30 * 24 * 60 * MIN)): Promise<string> {
  const row = await admin.interregAnalysis.create({
    data: {
      tenantId: owner.tenantId,
      userId: owner.userId,
      rubricId: RUBRIC,
      status,
      callFileName: 'guide.txt',
      callFormat: 'TXT',
      callChars: 15,
      callText: 'call guide text',
      callExtractedAt: T0,
      callTextExpiresAt: expiresAt,
      projectFileName: 'draft.txt',
      projectFormat: 'TXT',
      projectChars: 12,
      projectText: 'project text',
      projectExtractedAt: T0,
      projectTextExpiresAt: expiresAt,
    },
    select: { id: true },
  });
  await admin.interregAnalysis.update({ where: { id: row.id }, data: { updatedAt } });
  return row.id;
}

/** What a run wrote at its claim (FO-274): its price, reserved on the ledger. */
const reserve = (owner: Owner, id: string, claimedAt: Date) =>
  admin.creditLedger.create({ data: { tenantId: owner.tenantId, delta: -PRICE, reason: 'usage:M17', refId: runRef(id, claimedAt) } });

const ledgerFor = async (id: string) =>
  (await admin.creditLedger.findMany({ where: { refId: { startsWith: id } }, select: { delta: true } })).map((r) => r.delta).sort((a, b) => a - b);
const load = (id: string) => admin.interregAnalysis.findUniqueOrThrow({ where: { id }, select: { status: true, updatedAt: true } });

/** Advisory-lock requests on this tenant's credit key (lockTenantCredits) that are WAITING, not granted. */
async function waitersOn(tenantId: string): Promise<number> {
  const rows = await admin.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM pg_locks
     WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
       AND ((classid::bigint << 32) | objid::bigint) = hashtextextended(${tenantId}, 0)`;
  return Number(rows[0]?.n ?? 0);
}

async function eventually(probe: () => Promise<boolean>, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await probe()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return probe();
}

describe.skipIf(!HAS_DB)('M17 credit follow-ups (FO-317, live, fabrika_app)', () => {
  beforeAll(async () => {
    const rubric = await admin.interregRubric.findUnique({
      where: { id: RUBRIC },
      select: { programChecks: true, criteria: { select: { criterionKey: true } } },
    });
    if (!rubric) throw new Error(`rubric ${RUBRIC} is not seeded (pnpm db:seed)`);
    criterionKeys = rubric.criteria.map((c) => c.criterionKey);
    programCheckKeys = (rubric.programChecks as { key: string }[]).map((c) => c.key);
  });

  beforeEach(() => {
    state.pauseDone = undefined;
  });

  afterAll(async () => {
    await admin.interregAnalysis.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.creditLedger.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.membership.deleteMany({ where: { tenantId: { in: presentIds(tenantIds) } } });
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenantIds) } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds(userIds) } } });
    await admin.$disconnect();
  });

  // Connection B, one per writer that releases a reservation. Each sees A's run as one to refund:
  // the sweeper because the claim is past STALE_CLAIM_MS at its `now`, the purge because the texts
  // are past their expiry at its `now`. Only the DONE transaction's lock keeps them from refunding a
  // result that is being delivered.
  const writers = [
    {
      name: 'the stale-run sweeper',
      expiresAt: () => new Date(Date.now() + 30 * 24 * 60 * MIN),
      run: () => releaseStaleRuns(new Date(T0.getTime() + STALE_CLAIM_MS + MIN)),
    },
    {
      name: 'the text purge',
      expiresAt: () => new Date(T0.getTime() + 30_000),
      run: () => purgeExpiredInterregText(new Date(T0.getTime() + MIN)),
    },
  ];

  test.each(writers)('DONE holds the tenant credit lock: $name on a second connection waits, then refunds nothing', async (writer) => {
    const owner = await makeTenant(`lock-${writer.name.split(' ').at(-1)}`);
    const id = await analysis(owner, 'READY', T0, writer.expiresAt());
    let held!: () => void;
    const reachedDone = new Promise<void>((r) => (held = r));
    let release!: () => void;
    state.pauseDone = { held, release: new Promise<void>((r) => (release = r)) };

    // Connection A: the run, claimed at T0, stops inside its DONE transaction.
    const a = runEvaluation(owner, id, { locale: 'en', now: T0 });
    await reachedDone;

    // Connection B: starts while A holds the transaction open.
    let bSettled = false;
    const b = writer.run().finally(() => {
      bSettled = true;
    });
    const waited = await eventually(async () => (await waitersOn(owner.tenantId)) > 0, 5000);
    const settledWhileHeld = bSettled;
    release();
    const [run] = await Promise.all([a, b]);

    expect({ waited, settledWhileHeld }).toEqual({ waited: true, settledWhileHeld: false });
    expect(run).toMatchObject({ ok: true });
    // The delivered result keeps its charge: one debit, no refund.
    expect(await ledgerFor(id)).toEqual([-PRICE]);
    expect((await load(id)).status).not.toBe('FAILED');
  });

  test('a dead run: its reservation is released and the row is FAILED; a second sweep refunds nothing more', async () => {
    const owner = await makeTenant('dead');
    const claimedAt = T0;
    const id = await analysis(owner, 'ANALYZING', claimedAt);
    await reserve(owner, id, claimedAt);
    const now = new Date(T0.getTime() + STALE_CLAIM_MS + MIN);

    const first = await releaseStaleRuns(now);
    expect(first.released).toBeGreaterThanOrEqual(1);
    expect(await ledgerFor(id)).toEqual([-PRICE, PRICE]);
    const after = await load(id);
    expect(after.status).toBe('FAILED');

    await releaseStaleRuns(now);
    expect(await ledgerFor(id)).toEqual([-PRICE, PRICE]);
    expect(await load(id)).toEqual(after); // updatedAt included: the second sweep wrote nothing
  });

  test('two sweeps at once refund a dead run once', async () => {
    const owner = await makeTenant('twice');
    const id = await analysis(owner, 'ANALYZING', T0);
    await reserve(owner, id, T0);
    const now = new Date(T0.getTime() + STALE_CLAIM_MS + MIN);

    await Promise.all([releaseStaleRuns(now), releaseStaleRuns(now), releaseStaleRuns(now)]);

    expect(await ledgerFor(id)).toEqual([-PRICE, PRICE]);
    expect((await load(id)).status).toBe('FAILED');
  });

  test('a fresh claim (a run still inside STALE_CLAIM_MS) is not touched: no refund, still ANALYZING, same claim', async () => {
    const owner = await makeTenant('fresh');
    const claimedAt = new Date(T0.getTime() + STALE_CLAIM_MS); // claimed at the sweep's own `now`
    const id = await analysis(owner, 'ANALYZING', claimedAt);
    await reserve(owner, id, claimedAt);
    const boundary = await analysis(owner, 'ANALYZING', T0); // exactly at staleBefore: not older, kept
    await reserve(owner, boundary, T0);

    await releaseStaleRuns(new Date(T0.getTime() + STALE_CLAIM_MS));

    expect(await ledgerFor(id)).toEqual([-PRICE]);
    expect(await load(id)).toEqual({ status: 'ANALYZING', updatedAt: claimedAt });
    expect(await ledgerFor(boundary)).toEqual([-PRICE]);
    expect(await load(boundary)).toEqual({ status: 'ANALYZING', updatedAt: T0 });
  });

  test('only ANALYZING is swept: an old DONE keeps its charge, an old FAILED or READY is left as it is', async () => {
    const owner = await makeTenant('other');
    const done = await analysis(owner, 'DONE', T0);
    await reserve(owner, done, T0);
    const failed = await analysis(owner, 'FAILED', T0);
    const ready = await analysis(owner, 'READY', T0);
    // A dead run from before FO-274 has no reservation: it is FAILED, and no ledger row is written.
    const unreserved = await analysis(owner, 'ANALYZING', T0);

    await releaseStaleRuns(new Date(T0.getTime() + STALE_CLAIM_MS + MIN));

    expect(await ledgerFor(done)).toEqual([-PRICE]);
    expect(await load(done)).toEqual({ status: 'DONE', updatedAt: T0 });
    expect(await load(failed)).toEqual({ status: 'FAILED', updatedAt: T0 });
    expect(await load(ready)).toEqual({ status: 'READY', updatedAt: T0 });
    expect((await load(unreserved)).status).toBe('FAILED');
    expect(await ledgerFor(unreserved)).toEqual([]);
  });

  test('pages: more rows than one batch are all released, in several transactions', async () => {
    const owner = await makeTenant('pages');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await analysis(owner, 'ANALYZING', T0);
      await reserve(owner, id, T0);
      ids.push(id);
    }
    const out = await releaseStaleRuns(new Date(T0.getTime() + STALE_CLAIM_MS + MIN), { batchSize: 2 });
    expect(out.more).toBe(false);
    for (const id of ids) expect(await ledgerFor(id)).toEqual([-PRICE, PRICE]);
  });

  test('refuses an Invalid Date', async () => {
    await expect(releaseStaleRuns(new Date('nope'))).rejects.toThrow('valid Date');
  });
});
