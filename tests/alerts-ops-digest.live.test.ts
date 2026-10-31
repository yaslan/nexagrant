import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { recordAlert, type AlertDbClient } from '@/lib/observability/system-alert';
import { runAlertsOpsDigest, prismaDigestDb, needsDigest, CANDIDATE_LIMIT } from '@/lib/observability/alerts-ops-digest';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * FO-246 — the alerts-ops-digest against the real SystemAlert table.
 *
 * The unit test runs the logic on an in-memory table; what only Postgres can
 * answer is whether the query the digest builds is valid for Prisma, whether the
 * stamp survives the JSON round trip, and whether a stamped row still folds the
 * next occurrence of the same alert (dedup) instead of opening a new one.
 *
 * SystemAlert has no tenant column and no row security, so the owner client is
 * the right one. The digest reads EVERY open error row, so the client it gets
 * here is narrowed to this run's own `source` prefix: on a shared local database
 * other people's alerts are neither mailed nor stamped by this test.
 */

const ADMIN_URL = envValue('DATABASE_URL');
const SUITE = 'alerts-ops-digest live test';
const PREFIX = `test.ops-digest.${Date.now()}-${process.pid}`;

let db: PrismaClient | undefined;
let ready = false;

beforeAll(async () => {
  if (!ADMIN_URL) {
    skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
    return;
  }
  db = createDbClient(ADMIN_URL);
  try {
    await db.$queryRaw`SELECT 1`;
    ready = true;
  } catch (error) {
    skipOrFailInCi(SUITE, `database unreachable: ${errorMessage(error)}`);
  }
});

afterAll(async () => {
  if (db && ready) await db.systemAlert.deleteMany({ where: { source: { startsWith: PREFIX } } });
  await db?.$disconnect();
});

function scoped(client: PrismaClient) {
  return prismaDigestDb(client, { sourcePrefix: PREFIX });
}

describe('alerts-ops-digest → SystemAlert (real Postgres)', () => {
  test('mails new error rows once, ignores warn/resolved, and a stamped row still dedups', async (ctx) => {
    if (!ready || !db) return ctx.skip();
    const alertDb = db as unknown as AlertDbClient;
    const a = `${PREFIX}.a`;
    const b = `${PREFIX}.b`;

    await recordAlert({ level: 'error', source: a, message: 'boom' }, { client: alertDb });
    await recordAlert({ level: 'error', source: a, message: 'boom' }, { client: alertDb }); // folds: repeatCount 2
    await recordAlert({ level: 'error', source: b, message: 'other' }, { client: alertDb });
    await recordAlert({ level: 'warn', source: `${PREFIX}.w`, message: 'quiet' }, { client: alertDb });
    const resolved = await recordAlert({ level: 'error', source: `${PREFIX}.r`, message: 'done' }, { client: alertDb });
    await db.systemAlert.update({ where: { id: resolved.id! }, data: { resolvedAt: new Date() } });

    const sent: Array<{ to: string; subject: string; html: string }> = [];
    const opts = { recipient: 'ops@example.com', db: scoped(db), mailer: async (m: (typeof sent)[number]) => void sent.push(m) };

    const first = await runAlertsOpsDigest(opts);
    expect(first).toEqual({ outcome: 'sent', alerts: 2, stampFailures: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.html).toContain(a);
    expect(sent[0]!.html).toContain(b);
    expect(sent[0]!.html).not.toContain(`${PREFIX}.w`);
    expect(sent[0]!.html).not.toContain(`${PREFIX}.r`);
    expect(sent[0]!.html).not.toContain('boom'); // message never leaves

    const stamped = await db.$queryRaw<{ source: string; digested: string | null; count: number | null }[]>`
      SELECT "source", "meta"->>'alertDigestedAt' AS digested, ("meta"->>'alertDigestedCount')::int AS count
      FROM "SystemAlert" WHERE "source" IN (${a}, ${b}) ORDER BY "source"`;
    expect(stamped.map((r) => [r.source, r.digested !== null, r.count])).toEqual([
      [a, true, 2],
      [b, true, 1],
    ]);

    expect((await runAlertsOpsDigest(opts)).outcome).toBe('nothing_new');
    expect(sent).toHaveLength(1);

    // The same alert again folds into the stamped row (no new row) and stays quiet.
    const again = await recordAlert({ level: 'error', source: a, message: 'boom' }, { client: alertDb });
    expect(again).toMatchObject({ status: 'recorded', deduped: true, repeatCount: 3 });
    expect(await db.systemAlert.count({ where: { source: a } })).toBe(1);
    expect((await runAlertsOpsDigest(opts)).outcome).toBe('nothing_new');
  });
  test('Y1: an old unstamped row is mailed although more than the limit of newer rows are stamped and still open', async (ctx) => {
    if (!ready || !db) return ctx.skip();
    const noisy = `${PREFIX}.y1noisy`;
    const old = `${PREFIX}.y1old`;
    const stamp = { alertRepeatCount: 1, alertDigestedAt: '2026-10-30T08:20:00.000Z', alertDigestedCount: 1 };
    await db.systemAlert.create({ data: { level: 'error', source: old, message: 'forgotten', createdAt: new Date('2026-01-01T00:00:00Z') } });
    await db.systemAlert.createMany({
      data: Array.from({ length: CANDIDATE_LIMIT + 5 }, (_, i) => ({
        level: 'error',
        source: noisy,
        message: `m${i}`,
        meta: stamp,
        createdAt: new Date(Date.UTC(2026, 5, 1) + i * 1000),
      })),
    });
    const sent: Array<{ html: string }> = [];
    // One prefix covers both sources: the 1005 newer stamped rows compete with the old one for the limit.
    const result = await runAlertsOpsDigest({
      recipient: 'ops@example.com',
      db: prismaDigestDb(db, { sourcePrefix: `${PREFIX}.y1` }),
      mailer: async (m) => void sent.push(m),
    });
    expect(result).toEqual({ outcome: 'sent', alerts: 1, stampFailures: 0 });
    expect(sent[0]!.html).toContain(old);
    expect(sent[0]!.html).not.toContain(noisy);
  });

  test('Y2: a recordAlert repeat that lands between the select and the stamp keeps its counter', async (ctx) => {
    if (!ready || !db) return ctx.skip();
    const alertDb = db as unknown as AlertDbClient;
    const src = `${PREFIX}.y2`;
    for (let i = 0; i < 5; i++) await recordAlert({ level: 'error', source: src, message: 'race' }, { client: alertDb }); // repeat 5
    const opts = {
      recipient: 'ops@example.com',
      db: scoped(db),
      // The mail is sent after the select and before the stamp: a repeat folds in right here.
      mailer: async () => void (await recordAlert({ level: 'error', source: src, message: 'race' }, { client: alertDb })),
    };
    expect(await runAlertsOpsDigest(opts)).toEqual({ outcome: 'sent', alerts: 1, stampFailures: 0 });
    const [r] = await db.$queryRaw<{ repeat: number; digested: number; stamped: boolean }[]>`
      SELECT ("meta"->>'alertRepeatCount')::int AS repeat, ("meta"->>'alertDigestedCount')::int AS digested,
             ("meta"->>'alertDigestedAt') IS NOT NULL AS stamped
      FROM "SystemAlert" WHERE "source" = ${src}`;
    expect(r).toEqual({ repeat: 6, digested: 5, stamped: true });
  });
  test('the SQL pending test matches needsDigest, including odd stored meta (no cast error)', async (ctx) => {
    if (!ready || !db) return ctx.skip();
    const src = `${PREFIX}.sql`;
    const at = '2026-10-30T08:20:00.000Z';
    const metas: Array<[string, unknown, boolean]> = [
      ['unstamped', null, true],
      ['grew-by-step', { alertRepeatCount: 11, alertDigestedAt: at, alertDigestedCount: 1 }, true],
      ['grew-less-than-step', { alertRepeatCount: 10, alertDigestedAt: at, alertDigestedCount: 1 }, false],
      ['stamp-without-count', { alertRepeatCount: 11, alertDigestedAt: at }, true],
      ['string-counters', { alertRepeatCount: 'abc', alertDigestedAt: at, alertDigestedCount: 'x' }, false],
      ['array-meta', [1, 2], true],
    ];
    await db.systemAlert.createMany({
      data: metas.map(([name, meta]) => ({
        level: 'error',
        source: `${src}.${name}`,
        message: name,
        ...(meta === null ? {} : { meta: meta as never }),
      })),
    });
    const pending = await prismaDigestDb(db, { sourcePrefix: src }).findPending({ limit: 100, excludeSource: 'none' });
    const got = pending.map((r) => r.source.slice(src.length + 1)).sort();
    const expected = metas.filter(([, , want]) => want).map(([name]) => name).sort();
    expect(got).toEqual(expected);
    // ...and the pure function agrees on every row.
    for (const [name, meta, want] of metas) expect([name, needsDigest({ meta })]).toEqual([name, want]);
  });
});
