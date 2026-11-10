import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { assertAppConnection, requireRlsTestUrl, type RawQueryable } from './helpers/live-db-role';

/**
 * NG-40 (§18.3): the audit trail is append-only for the application role.
 *
 * Every assertion runs through DATABASE_URL_RLS_TEST (`fabrika_app`). The
 * superuser connection would pass a "cannot UPDATE" check only by accident of
 * the test, never by the grant, so the role is pinned before the first write
 * (assertAppConnection). `prisma` is the owner connection and only sets up
 * and removes fixtures.
 */
const APP_URL = requireRlsTestUrl(process.env.DATABASE_URL_RLS_TEST, 'auditevent-immutable.live');
const HAS_DB = Boolean(process.env.DATABASE_URL);
const RUN = HAS_DB && Boolean(APP_URL);

const RUNID = `ng40aud${Date.now().toString(36)}`;
const TENANT = `${RUNID}-t`;
const USER_ERASED = `${RUNID}-u1`;
const USER_ACTIVE = `${RUNID}-u2`;
const EVENT_ERASED = `${RUNID}-e1`;
const EVENT_ACTIVE = `${RUNID}-e2`;

function queryable(app: pg.Client): RawQueryable {
  return { $queryRawUnsafe: (async (q: string) => (await app.query(q)).rows) as RawQueryable['$queryRawUnsafe'] };
}

async function withApp<T>(fn: (app: pg.Client) => Promise<T>): Promise<T> {
  const app = new pg.Client({ connectionString: APP_URL });
  await app.connect();
  try {
    await assertAppConnection(queryable(app), prisma, 'auditevent-immutable.live');
    return await fn(app);
  } finally {
    await app.end();
  }
}

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { id: { in: [EVENT_ERASED, EVENT_ACTIVE] } } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: TENANT } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
  await prisma.user.deleteMany({ where: { id: { in: [USER_ERASED, USER_ACTIVE] } } });
}

describe.skipIf(!RUN)('AuditEvent is append-only for the app role (live database)', () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: TENANT, name: RUNID, slug: RUNID, country: 'TR' } });
    await prisma.user.create({
      data: { id: USER_ERASED, email: `${RUNID}-1@example.test`, deletionRequestedAt: new Date() },
    });
    await prisma.user.create({ data: { id: USER_ACTIVE, email: `${RUNID}-2@example.test` } });
    await prisma.auditEvent.create({
      data: { id: EVENT_ERASED, tenantId: TENANT, actorId: USER_ERASED, type: 'ng40.test', target: 'keep-me' },
    });
    await prisma.auditEvent.create({
      data: { id: EVENT_ACTIVE, tenantId: TENANT, actorId: USER_ACTIVE, type: 'ng40.test', target: 'keep-me' },
    });
  });

  afterAll(cleanup);

  it('UPDATE is refused with 42501 and the row is unchanged', async () => {
    await withApp(async (app) => {
      await app.query('BEGIN');
      await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT]);
      await expect(
        app.query(`UPDATE "AuditEvent" SET "type" = 'tampered' WHERE "id" = $1`, [EVENT_ACTIVE])
      ).rejects.toMatchObject({ code: '42501' });
      await app.query('ROLLBACK');
    });
    const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id: EVENT_ACTIVE } });
    expect(row.type).toBe('ng40.test');
  });

  it('DELETE and a whole-table wipe are refused with 42501 and the row survives', async () => {
    await withApp(async (app) => {
      await app.query('BEGIN');
      await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT]);
      await expect(app.query(`DELETE FROM "AuditEvent" WHERE "id" = $1`, [EVENT_ACTIVE])).rejects.toMatchObject({
        code: '42501',
      });
      await app.query('ROLLBACK');
      await expect(app.query(`TRUNCATE "AuditEvent"`)).rejects.toMatchObject({ code: '42501' });
    });
    expect(await prisma.auditEvent.count({ where: { id: EVENT_ACTIVE } })).toBe(1);
  });

  it('INSERT still works inside the tenant scope', async () => {
    const id = `${RUNID}-ins`;
    await withApp(async (app) => {
      await app.query('BEGIN');
      await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT]);
      await app.query(
        `INSERT INTO "AuditEvent" ("id","tenantId","type","createdAt") VALUES ($1,$2,'ng40.insert',now())`,
        [id, TENANT]
      );
      await app.query('COMMIT');
    });
    expect(await prisma.auditEvent.count({ where: { id } })).toBe(1);
    await prisma.auditEvent.delete({ where: { id } });
  });

  it('audit_detach_actor nulls actorId for an erasure subject and changes nothing else', async () => {
    const n = await withApp(async (app) => {
      await app.query('BEGIN');
      const r = await app.query(`SELECT public.audit_detach_actor($1) AS n`, [USER_ERASED]);
      await app.query('COMMIT');
      return r.rows[0].n as number;
    });
    expect(n).toBe(1);
    const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id: EVENT_ERASED } });
    expect(row.actorId).toBeNull();
    expect(row.type).toBe('ng40.test');
    expect(row.target).toBe('keep-me');
  });

  it('audit_detach_actor refuses a user with no pending erasure (42501)', async () => {
    await withApp(async (app) => {
      await expect(app.query(`SELECT public.audit_detach_actor($1)`, [USER_ACTIVE])).rejects.toMatchObject({
        code: '42501',
      });
    });
    const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id: EVENT_ACTIVE } });
    expect(row.actorId).toBe(USER_ACTIVE);
  });

  it('a tenant hard delete (FK cascade) still removes its audit rows', async () => {
    const t = `${RUNID}-casc`;
    await prisma.tenant.create({ data: { id: t, name: t, slug: t, country: 'TR' } });
    await prisma.auditEvent.create({ data: { id: `${t}-e`, tenantId: t, type: 'ng40.cascade' } });
    await withApp(async (app) => {
      await app.query('BEGIN');
      await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [t]);
      await app.query(`DELETE FROM "Tenant" WHERE "id" = $1`, [t]);
      await app.query('COMMIT');
    });
    expect(await prisma.auditEvent.count({ where: { tenantId: t } })).toBe(0);
  });
});
