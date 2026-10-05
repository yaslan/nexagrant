import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { recordAlert, type AlertDbClient } from '@/lib/observability/system-alert';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MUMLEUIQWSI59 — error tracking is the `SystemAlert` table only.
 *
 * The optional Sentry forwarder is gone (patron decision 29.09). What is left
 * to prove is the whole path: a real error — thrown by a Prisma client pointed
 * at a closed port, not a hand-written string — goes through `recordAlert`,
 * lands as a row that a SELECT reads back, and nothing goes out over the
 * network on the way.
 */

const ADMIN_URL = envValue('DATABASE_URL');
const SUITE = 'system-alert live test';
const SOURCE = `test.system-alert.${Date.now()}-${process.pid}`;

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
  if (db && ready) await db.systemAlert.deleteMany({ where: { source: SOURCE } });
  await db?.$disconnect();
});

describe('recordAlert → SystemAlert (no external forwarder)', () => {
  test('a real Prisma error becomes a SystemAlert row and nothing is sent over the network', async (ctx) => {
    if (!ready || !db) return ctx.skip();

    // Nothing listens on port 1: the query fails to connect with a real P1001.
    const broken = createDbClient('postgresql://nobody:nopass@127.0.0.1:1/none');
    let thrown: unknown;
    try {
      await broken.user.findFirst({ where: { email: 'nobody@example.org' } });
    } catch (error) {
      thrown = error;
    } finally {
      await broken.$disconnect();
    }
    expect((thrown as { code?: string }).code).toBe('P1001');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const message = `Saved-search fetch failed: ${errorMessage(thrown)}`;
    const result = await recordAlert(
      { level: 'error', source: SOURCE, message, meta: { attempt: 1 } },
      { client: db as unknown as AlertDbClient }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(result.status).toBe('recorded');
    const id = (result as { id: string }).id;
    const rows = await db.$queryRaw<{ id: string; level: string; source: string; message: string }[]>`
      SELECT "id", "level", "source", "message" FROM "SystemAlert" WHERE "id" = ${id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, level: 'error', source: SOURCE });
    expect(rows[0]?.message.startsWith('Saved-search fetch failed:')).toBe(true);
  });
});
