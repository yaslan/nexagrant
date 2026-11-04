// FO-381 B1 — the view client's tenant context must not leak across pooled connections.
// Pure checks always run. Live checks (P1, P3) need a scratch MariaDB: set MYSQL_PWD (and
// optionally MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_DATABASE) and they run; without
// MYSQL_PWD they are skipped, so the gate never talks to a live database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPoolConfig,
  createViewClient,
  isValidTenantId,
  withTenant,
} from '../scripts/mysql-schema/tenant-client.mjs';

const LIVE = Boolean(process.env.MYSQL_PWD);
const FIXTURE = 'fo381_';
const TENANT_A = 'fo381_tenant_a';
const TENANT_B = 'fo381_tenant_b';

describe('buildPoolConfig (pure)', () => {
  it('always sets resetAfterUse=true, even when a caller asks otherwise', () => {
    const cfg = buildPoolConfig({ host: '127.0.0.1', port: 3306, user: 'u', password: 'p', database: 'd', resetAfterUse: false });
    expect(cfg.resetAfterUse).toBe(true);
  });

  it('pins the strict SQL mode and UTC session time zone on every connection', () => {
    const cfg = buildPoolConfig({ host: '127.0.0.1', port: 3306, user: 'u', password: 'p', database: 'd' });
    expect(cfg.initSql.join(';')).toContain('STRICT_ALL_TABLES');
    expect(cfg.initSql.join(';')).toContain("time_zone='+00:00'");
  });
});

describe('isValidTenantId (pure, N8)', () => {
  it('accepts ids made of letters, digits, underscore and dash', () => {
    expect(isValidTenantId('tenant_A-1')).toBe(true);
  });

  it('rejects trailing spaces (PAD SPACE would match another tenant), empty and oversized ids', () => {
    expect(isValidTenantId('tenant_A ')).toBe(false);
    expect(isValidTenantId('')).toBe(false);
    expect(isValidTenantId('a'.repeat(129))).toBe(false);
    expect(isValidTenantId(null)).toBe(false);
  });
});

describe.skipIf(!LIVE)('tenant context on pooled connections (live MariaDB)', () => {
  const env = {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PWD,
    database: process.env.MYSQL_DATABASE ?? 'fabrika_faz1',
  };
  // P1: one connection, so every request reuses it.
  const single = createViewClient({ ...env, connectionLimit: 1 });
  // P3: several connections under concurrency.
  const pool = createViewClient({ ...env, connectionLimit: 5 });

  beforeAll(async () => {
    // Fixture rows go in through the root connection (base tables), then are removed.
    await single.prisma.$executeRawUnsafe(`DELETE FROM \`Document\` WHERE \`id\` LIKE '${FIXTURE}%'`);
    const rows = [
      [`${FIXTURE}a1`, TENANT_A],
      [`${FIXTURE}a2`, TENANT_A],
      [`${FIXTURE}a3`, TENANT_A],
      [`${FIXTURE}b1`, TENANT_B],
    ];
    for (const [id, tenantId] of rows) {
      await single.prisma.$executeRawUnsafe(
        'INSERT INTO `Document` (`id`, `tenantId`, `kind`, `title`) VALUES (?, ?, ?, ?)',
        id,
        tenantId,
        'topic',
        'fo381 fixture',
      );
    }
  });

  afterAll(async () => {
    await single.prisma.$executeRawUnsafe(`DELETE FROM \`Document\` WHERE \`id\` LIKE '${FIXTURE}%'`);
    await single.disconnect();
    await pool.disconnect();
  });

  it('P1: after a tenant transaction returns its connection, the next request without a tenant sees no rows', async () => {
    const inTenant = await withTenant(single.prisma, TENANT_A, (tx) => tx.document.count());
    expect(inTenant).toBe(3);

    const afterwards = await single.prisma.document.count();
    expect(afterwards).toBe(0);
  });

  it('P3: under 12 concurrent requests on 5 connections, no request reads another tenant', async () => {
    const jobs = [];
    for (let i = 0; i < 12; i++) {
      const tenant = i % 2 === 0 ? TENANT_A : TENANT_B;
      const expected = tenant === TENANT_A ? 3 : 1;
      jobs.push(
        withTenant(pool.prisma, tenant, async (tx) => ({ got: await tx.document.count(), expected })),
      );
      // Requests with no tenant context must see nothing, even while others hold the pool.
      jobs.push(pool.prisma.document.count().then((got) => ({ got, expected: 0 })));
    }
    const results = await Promise.all(jobs);
    const wrong = results.filter((r) => r.got !== r.expected);
    expect(wrong).toEqual([]);
  });
});
