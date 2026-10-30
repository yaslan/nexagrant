import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { recordAlert, type AlertDbClient } from '@/lib/observability/system-alert';
import { runAlertsOpsDigest, type DigestDbClient } from '@/lib/observability/alerts-ops-digest';
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

function scoped(client: PrismaClient): DigestDbClient {
  return {
    systemAlert: {
      findMany: (args) =>
        client.systemAlert.findMany({
          ...args,
          where: { ...args.where, AND: [{ source: { startsWith: PREFIX } }] },
        }) as ReturnType<DigestDbClient['systemAlert']['findMany']>,
      update: (args) => client.systemAlert.update(args as Parameters<typeof client.systemAlert.update>[0]),
    },
  };
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
});
