#!/usr/bin/env node
// FO-375 — CRUD smoke test: Prisma MySQL client over @prisma/adapter-mariadb against a scratch DB.
//
//   MYSQL_PASSWORD=... node scripts/mysql-schema/smoke.mjs
// Env: MYSQL_HOST (127.0.0.1) MYSQL_PORT (3306) MYSQL_USER (root) MYSQL_DATABASE (fabrika_faz1)
// Refuses any host other than 127.0.0.1 / localhost. The password is read from env only, never printed.
// Creates one tenant row, reads/updates/searches it, deletes it. Pool tuning is out of scope (Faz 2).
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../node_modules/.prisma/client-mysql/index.js';
import { createViewClient } from './tenant-client.mjs';

const HOST = process.env.MYSQL_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MYSQL_PORT ?? 3306);
const USER = process.env.MYSQL_USER ?? 'root';
const DATABASE = process.env.MYSQL_DATABASE ?? 'fabrika_faz1';
const PASSWORD = process.env.MYSQL_PASSWORD ?? '';

if (!['127.0.0.1', 'localhost'].includes(HOST)) {
  console.error(`refusing smoke test on non-local host: ${HOST}`);
  process.exit(1);
}

const SQL_MODE = 'STRICT_ALL_TABLES,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';
const adapter = new PrismaMariaDb({
  host: HOST,
  port: PORT,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  connectionLimit: 2,
  initSql: [`SET SESSION sql_mode='${SQL_MODE}', time_zone='+00:00'`],
});
const prisma = new PrismaClient({ adapter });

const id = `smoke_${Date.now()}`;
const docId = `${id}_doc`;
const view = createViewClient({
  host: HOST,
  port: PORT,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  connectionLimit: 2,
});
const results = [];
const step = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

try {
  const created = await prisma.tenant.create({
    data: { id, name: 'Istanbul Ajans', slug: `${id}-slug`, country: 'TR' },
  });
  step('create tenant', created.id === id);

  const read = await prisma.tenant.findUnique({ where: { id } });
  step('read by primary key', read?.name === 'Istanbul Ajans');

  const updated = await prisma.tenant.update({ where: { id }, data: { name: 'Ankara Ajans' } });
  step('update', updated.name === 'Ankara Ajans');

  const hit = await prisma.tenant.findMany({ where: { id, name: { contains: 'ankara' } } });
  step('contains on ci column (name) is case-insensitive', hit.length === 1, `hits=${hit.length}`);

  const miss = await prisma.tenant.findMany({ where: { id, slug: { contains: 'SMOKE' } } });
  step('contains on binary column (slug) is case-sensitive', miss.length === 0, `hits=${miss.length}`);

  const [mode] = await prisma.$queryRawUnsafe('SELECT @@SESSION.sql_mode AS m');
  step('session sql_mode is strict (initSql applied)', String(mode.m).includes('STRICT_ALL_TABLES'), String(mode.m));

  // View client (FO-381 B1): reads through the tenant transaction only.
  await prisma.document.create({ data: { id: docId, tenantId: id, kind: 'topic', title: 'smoke view row' } });
  const inTenant = await view.tenant(id, (tx) => tx.document.count({ where: { id: docId } }));
  step('view client sees own row inside tenant tx', inTenant === 1, `count=${inTenant}`);

  const otherTenant = await view.tenant(`${id}_other`, (tx) => tx.document.count({ where: { id: docId } }));
  step('view client hides another tenant row', otherTenant === 0, `count=${otherTenant}`);

  const outside = await view.prisma.document.count({ where: { id: docId } });
  step('view client without tenant sees nothing (no leaked context)', outside === 0, `count=${outside}`);
} catch (err) {
  step('unexpected error', false, String(err.message ?? err).split('\n')[0]);
} finally {
  try {
    await prisma.document.deleteMany({ where: { id: docId } });
    await prisma.tenant.deleteMany({ where: { id } });
    const left = await prisma.tenant.count({ where: { id } });
    step('cleanup: scratch row removed', left === 0);
  } catch (err) {
    step('cleanup', false, String(err.message ?? err).split('\n')[0]);
  }
  await prisma.$disconnect();
  await view.disconnect();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`smoke: ${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
