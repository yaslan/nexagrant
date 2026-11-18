import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-220 (NG-216 review, finding 1) — two concurrent stage moves of the same deal.
 *
 * Before the fix `moveDealStage` read the deal with a plain `findFirst` (no row lock, READ
 * COMMITTED), so two moves started at once both saw the old stage, both passed
 * `checkStageTransition` and both wrote their STAGE_CHANGE activity and auto tasks. The last
 * writer set the stage, but the losing move's tasks (e.g. "send quote") stayed on the deal.
 *
 * The interleaving is made deterministic: each transaction waits at its first `deal.update`
 * until the other one has arrived too, or 1.5 s have passed. Without the row lock both arrive
 * (both read the old stage) and the race happens every time; with it the second transaction is
 * still waiting for the first one's lock, the first proceeds after the timeout and commits, and
 * the second then reads the committed stage and is checked against it.
 *
 * Real Postgres, real Prisma, the `fabrika_app` role (NOBYPASSRLS), no mocks; fixtures and counts
 * go through the owner role (same setup as tests/m18-merge-race.live.test.ts).
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
      if (i > 0 && t.slice(0, i) === key) return t.slice(i + 1).replace(/^["']|["']$/g, '') || undefined;
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import type { DealStage } from '@prisma/client';
import { createDbClient, prisma, withTenant, type TenantTx } from '@/lib/db';
import { DealTransitionError, moveDealStage } from '@/modules/m18/server/deals-repo';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'm18 deal stage race test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
let tenantId = '';

/** Resolves for every caller once `n` have arrived, or after `ms` for whoever is still waiting. */
function barrier(n: number, ms: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const all = new Promise<void>((r) => (release = r));
  return async () => {
    arrived += 1;
    if (arrived >= n) release();
    await Promise.race([all, new Promise<void>((r) => setTimeout(r, ms))]);
  };
}

/** `tx` whose first `deal.update` waits at `gate` first. Everything else passes through. */
function gated(tx: TenantTx, gate: () => Promise<void>): TenantTx {
  let waited = false;
  const deal = new Proxy(tx.deal, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop === 'update' && typeof value === 'function') {
        return async (...args: unknown[]) => {
          if (!waited) {
            waited = true;
            await gate();
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'deal') return deal;
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

async function dealAt(stage: DealStage, label: string): Promise<string> {
  const org = await admin.leadOrganization.create({ data: { tenantId, name: `NG220 ${label} ${RUN}` }, select: { id: true } });
  const deal = await admin.deal.create({
    data: { tenantId, organizationId: org.id, title: `NG220 ${label} ${RUN}`, stage },
    select: { id: true },
  });
  return deal.id;
}

type Outcome = { ok: true; to: DealStage } | { ok: false; reason: string };

/** Starts both moves at once, each behind the same gate, and reports how each one ended. */
async function race(dealId: string, moves: Array<{ to: DealStage; lostReason?: string }>): Promise<Outcome[]> {
  const gate = barrier(moves.length, 1500);
  return Promise.all(
    moves.map(({ to, lostReason }) =>
      withTenant(tenantId, (tx) => moveDealStage(gated(tx, gate), tenantId, { dealId, to, lostReason }, null, 'tr'), {
        timeout: 15_000,
      }).then(
        (): Outcome => ({ ok: true, to }),
        (e: unknown): Outcome => {
          if (e instanceof DealTransitionError) return { ok: false, reason: e.reason };
          throw e;
        },
      ),
    ),
  );
}

const ruleKeysOf = async (dealId: string) =>
  (await admin.dealTask.findMany({ where: { tenantId, dealId, deletedAt: null }, orderBy: { autoRuleKey: 'asc' } })).map(
    (t) => t.autoRuleKey,
  );

const stageChangesOf = async (dealId: string) =>
  (
    await admin.dealActivity.findMany({
      where: { tenantId, dealId, kind: 'STAGE_CHANGE' },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { payload: true },
    })
  ).map((a) => a.payload as { from: DealStage; to: DealStage });

describe.skipIf(!HAS_DB)('M18 concurrent stage moves of one deal (NG-220)', () => {
  beforeAll(async () => {
    const t = await admin.tenant.create({ data: { name: `ng220-${RUN}`, slug: `ng220-${RUN}`, country: 'TR', orgType: 'CONSULTANCY' } });
    tenantId = t.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('ELIGIBILITY_ANALYSIS → PROPOSAL and → DISCOVERY_MEETING at once: one wins, the loser writes no task', async () => {
    const dealId = await dealAt('ELIGIBILITY_ANALYSIS', 'diverge');
    const outcomes = await race(dealId, [{ to: 'PROPOSAL' }, { to: 'DISCOVERY_MEETING' }]);

    const won = outcomes.filter((o): o is { ok: true; to: DealStage } => o.ok);
    expect(won).toHaveLength(1);
    // After either move the other one skips a stage, checked against the committed stage.
    expect(outcomes.filter((o) => !o.ok)).toEqual([{ ok: false, reason: 'SKIPS_STAGES' }]);

    const winner = won[0]!.to;
    expect((await admin.deal.findUniqueOrThrow({ where: { id: dealId } })).stage).toBe(winner);
    expect(await ruleKeysOf(dealId)).toEqual(
      winner === 'PROPOSAL' ? ['proposal.follow-up', 'proposal.send-quote'] : ['discovery.send-meeting-notes'],
    );
    expect(await stageChangesOf(dealId)).toEqual([{ from: 'ELIGIBILITY_ANALYSIS', to: winner }]);
  });

  test('ELIGIBILITY_ANALYSIS → PROPOSAL and → LOST at once: the second move is checked against the first one\'s stage', async () => {
    const dealId = await dealAt('ELIGIBILITY_ANALYSIS', 'lost');
    const outcomes = await race(dealId, [{ to: 'PROPOSAL' }, { to: 'LOST', lostReason: 'Bütçe yok' }]);

    // History is one chain: the second move starts where the first one left the deal.
    const changes = await stageChangesOf(dealId);
    expect(changes[0]?.from).toBe('ELIGIBILITY_ANALYSIS');
    for (let i = 1; i < changes.length; i++) expect(changes[i]?.from).toBe(changes[i - 1]?.to);

    const stage = (await admin.deal.findUniqueOrThrow({ where: { id: dealId } })).stage;
    expect(changes.at(-1)?.to).toBe(stage);
    if (stage === 'LOST' && changes.length === 1) {
      // LOST committed first: LOST → PROPOSAL is refused, PROPOSAL's tasks are not written.
      expect(outcomes).toContainEqual({ ok: false, reason: 'REOPEN_ONLY_TO_NEW' });
      expect(await ruleKeysOf(dealId)).toEqual(['lost.reengage']);
    } else {
      // PROPOSAL committed first, then PROPOSAL → LOST is a legal move of its own.
      expect(changes).toEqual([
        { from: 'ELIGIBILITY_ANALYSIS', to: 'PROPOSAL' },
        { from: 'PROPOSAL', to: 'LOST' },
      ]);
      expect(outcomes.every((o) => o.ok)).toBe(true);
    }
  });

  test('the same move twice at once (→ PROPOSAL, → PROPOSAL): one is applied, the other is SAME_STAGE, no duplicate task', async () => {
    const dealId = await dealAt('ELIGIBILITY_ANALYSIS', 'same');
    const outcomes = await race(dealId, [{ to: 'PROPOSAL' }, { to: 'PROPOSAL' }]);

    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok)).toEqual([{ ok: false, reason: 'SAME_STAGE' }]);
    expect(await ruleKeysOf(dealId)).toEqual(['proposal.follow-up', 'proposal.send-quote']);
    expect(await stageChangesOf(dealId)).toEqual([{ from: 'ELIGIBILITY_ANALYSIS', to: 'PROPOSAL' }]);
  });
});
