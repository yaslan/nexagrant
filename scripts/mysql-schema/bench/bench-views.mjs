#!/usr/bin/env node
// FO-381 B5 — view timing on 200k rows through Prisma (bench-only, scratch database).
//
//   MYSQL_PASSWORD=... MYSQL_PORT=3307 node scripts/mysql-schema/bench/bench-views.mjs
// Prerequisites on the scratch DB: apply.sh --reset, then seed.sql, then alt-views.sql.
// Refuses non-local hosts and any database whose name lacks "faz1" or "bench".
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../node_modules/.prisma/client-mysql/index.js';
import { SQL_MODE, createViewClient } from '../tenant-client.mjs';
import { performance } from 'node:perf_hooks';

const HOST = process.env.MYSQL_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MYSQL_PORT ?? 3306);
const USER = process.env.MYSQL_USER ?? 'root';
const PASSWORD = process.env.MYSQL_PASSWORD ?? '';
const DATABASE = process.env.MYSQL_DATABASE ?? 'fabrika_faz1';
const RUNS = Number(process.env.BENCH_RUNS ?? 11);

if (!['127.0.0.1', 'localhost'].includes(HOST)) {
  console.error(`refusing bench on non-local host: ${HOST}`);
  process.exit(1);
}
if (!/faz1|bench/.test(DATABASE)) {
  console.error(`refusing bench on database "${DATABASE}": it runs only on a scratch database`);
  process.exit(1);
}

const conn = { host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE };
const base = new PrismaClient({
  adapter: new PrismaMariaDb({ ...conn, connectionLimit: 2, initSql: [`SET SESSION sql_mode='${SQL_MODE}', time_zone='+00:00'`] }),
});
const view = createViewClient({ ...conn, connectionLimit: 2 });

// Bench-only: the product withTenant keeps Prisma's 5 s default; a 200k-row tenant query needs longer.
const txIn = (tenantId, fn) =>
  view.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET @app_tenant_id = ${tenantId}`;
    return fn(tx);
  }, { timeout: 180000, maxWait: 10000 });

const TA = 'bench_tenant_a';
const TB = 'bench_tenant_b';
const TE = 'bench_tenant_none';

/** Median wall time of RUNS calls after one warm-up. */
async function median(label, fn) {
  const samples = [];
  let last;
  for (let i = 0; i <= RUNS; i++) {
    const t0 = performance.now();
    last = await fn();
    const dt = performance.now() - t0;
    if (i > 0) samples.push(dt);
  }
  samples.sort((a, b) => a - b);
  return { label, ms: samples[Math.floor(samples.length / 2)], last };
}

const rows = [];
const add = async (query, label, fn) => {
  const r = await median(label, fn);
  rows.push({ query, variant: label, ms: Number(r.ms.toFixed(1)) });
  return r.last;
};

// Q1: count of one tenant's rows (about 100k rows match).
await add('Q1 tenant count', 'base table', () => base.document.count({ where: { tenantId: TA } }));
await add('Q1 tenant count', 'view (product, NOT DETERMINISTIC)', () =>
  txIn(TA, (tx) => tx.document.count()));
await add('Q1 tenant count', 'view (bench, DETERMINISTIC fn)', () =>
  txIn(TA, (tx) => tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM bench_det_Document')));

// Q2: first 20 rows for a tenant that has none.
await add('Q2 empty tenant list', 'base table', () => base.document.findMany({ where: { tenantId: TE }, take: 20 }));
await add('Q2 empty tenant list', 'view (product, NOT DETERMINISTIC)', () =>
  txIn(TE, (tx) => tx.document.findMany({ take: 20 })));
await add('Q2 empty tenant list', 'view (bench, DETERMINISTIC fn)', () =>
  txIn(TE, (tx) => tx.$queryRawUnsafe('SELECT * FROM bench_det_Document LIMIT 20')));

// Q3: platform list, ORDER BY id LIMIT 20.
await add('Q3 platform ORDER BY LIMIT 20', 'base table', () =>
  base.cordisProject.findMany({ orderBy: { id: 'asc' }, take: 20 }));
await add('Q3 platform ORDER BY LIMIT 20', 'view (product, TEMPTABLE)', () =>
  view.prisma.cordisProject.findMany({ orderBy: { id: 'asc' }, take: 20 }));
await add('Q3 platform ORDER BY LIMIT 20', 'view (bench, MERGE + OR 1=1)', () =>
  view.prisma.$queryRawUnsafe('SELECT * FROM bench_alt_CordisProject ORDER BY id LIMIT 20'));

// Q4: platform count with a filter on a plain column.
await add('Q4 platform count', 'base table', () => base.cordisProject.count({ where: { framework: 'HORIZON' } }));
await add('Q4 platform count', 'view (product, TEMPTABLE)', () =>
  view.prisma.cordisProject.count({ where: { framework: 'HORIZON' } }));
await add('Q4 platform count', 'view (bench, MERGE + OR 1=1)', () =>
  view.prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM bench_alt_CordisProject WHERE framework = 'HORIZON'"));

// Q5: join a tenant's documents to platform projects.
await add('Q5 tenant x platform join', 'base table', () =>
  base.$queryRawUnsafe(
    'SELECT COUNT(*) AS n FROM Document d JOIN CordisProject p ON p.id = d.title WHERE d.tenantId = ?',
    TA,
  ));
await add('Q5 tenant x platform join', 'views (product: TEMPTABLE)', () =>
  txIn(TA, (tx) =>
    tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM v_Document d JOIN v_CordisProject p ON p.id = d.title')));
await add('Q5 tenant x platform join', 'views (bench: DETERMINISTIC + MERGE)', () =>
  txIn(TA, (tx) =>
    tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM bench_det_Document d JOIN bench_alt_CordisProject p ON p.id = d.title')));

// DETERMINISTIC claim: the same cached statement must follow the session tenant (A then B, A again).
const detCount = (t) =>
  txIn(t, (tx) => tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM bench_det_Document'));
const productCount = (t) => txIn(t, (tx) => tx.document.count());
const det = [await detCount(TA), await detCount(TB), await detCount(TA)].map((r) => Number(r[0].n));
const prod = [await productCount(TA), await productCount(TB), await productCount(TA)];
const detFollowsContext = JSON.stringify(det) === JSON.stringify(prod);

// Write rejection must survive the alternatives (B5: 1288 / 1471 kept).
const writeCode = async (sql) => {
  try {
    await view.prisma.$executeRawUnsafe(sql);
    return 'accepted';
  } catch (e) {
    return String(e.message).match(/Code: `(\d+)`/)?.[1] ?? String(e.message).slice(0, 60);
  }
};
const writes = {
  'MERGE+OR1=1 UPDATE (expect 1288)': await writeCode("UPDATE bench_alt_CordisProject SET title='x' WHERE id='bench_p1'"),
  'MERGE+OR1=1 INSERT (expect 1471)': await writeCode(
    "INSERT INTO bench_alt_CordisProject (id, title, framework) VALUES ('bench_w1', 'w', 'HORIZON')",
  ),
  'DETERMINISTIC view, tenant B row in tenant A context (expect 1369)': await txIn(TA, (tx) =>
    tx.$executeRawUnsafe("INSERT INTO bench_det_Document (id, tenantId, kind, title) VALUES ('bench_w2', 'bench_tenant_b', 'topic', 'w')")
      .then(() => 'accepted')
      .catch((e) => String(e.message).match(/Code: `(\d+)`/)?.[1] ?? String(e.message).slice(0, 60))),
};

console.log(JSON.stringify({ rows, detFollowsContext, det, prod, writes }, null, 2));
await base.$disconnect();
await view.disconnect();
