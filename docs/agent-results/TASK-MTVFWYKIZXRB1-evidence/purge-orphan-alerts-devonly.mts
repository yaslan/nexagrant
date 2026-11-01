/**
 * TASK-MTVFWYKIZXRB1 — one-off purge of the ORPHAN alert backlog.
 * DEV DATABASE ONLY. Refuses to run against a non-local host.
 *
 * Deletes only rows that are open AND name a `meta.tenantId` that no longer
 * exists. Alerts naming a live tenant, and alerts naming no tenant at all
 * (K1/K2/CORDIS — the well-behaved, deduped ones), are never touched.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';

const LOCAL = new Set(['localhost', '127.0.0.1', '::1']);

function metaOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!LOCAL.has(host)) {
    console.error(`REFUSED: DATABASE_URL host is "${host}", not a local dev database.`);
    process.exit(1);
  }
  console.log(`target host: ${host}  (local dev)`);

  const before = await prisma.systemAlert.count();
  const open = await prisma.systemAlert.findMany({
    where: { resolvedAt: null },
    select: { id: true, meta: true },
  });
  const named = open.filter((r) => typeof metaOf(r.meta).tenantId === 'string');
  const ids = [...new Set(named.map((r) => String(metaOf(r.meta).tenantId)))];
  const alive = new Set(
    (await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
      (t) => t.id
    )
  );
  const orphanIds = named
    .filter((r) => !alive.has(String(metaOf(r.meta).tenantId)))
    .map((r) => r.id);

  console.log(`rows before      : ${before}`);
  console.log(`orphans to delete: ${orphanIds.length}`);

  const res = await prisma.systemAlert.deleteMany({ where: { id: { in: orphanIds } } });
  const after = await prisma.systemAlert.count();
  console.log(`deleted          : ${res.count}`);
  console.log(`rows after       : ${after}`);
  console.log(`kept             : ${after} (3 live-tenant + 31 tenant-agnostic, plus anything newer)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
