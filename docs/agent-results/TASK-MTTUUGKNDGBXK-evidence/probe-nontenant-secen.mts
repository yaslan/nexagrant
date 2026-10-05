/** TASK-MTTUUGKNDGBXK (sec-en). READ-ONLY. The open alerts that carry no meta.tenantId
 *  - i.e. the ones the tenant-gone sweep would NOT clear - listed in full for triage. */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
async function main() {
  const before = await prisma.systemAlert.count();
  const rows = await prisma.systemAlert.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: 'desc' } });
  const noTenant = rows.filter((r) => typeof asObj(r.meta).tenantId !== 'string');
  console.log(`open rows with NO meta.tenantId: ${noTenant.length}\n`);
  let occ = 0;
  for (const r of noTenant) {
    const m = asObj(r.meta);
    const rep = typeof m.alertRepeatCount === 'number' ? (m.alertRepeatCount as number) : 1;
    occ += rep;
    console.log(`${r.createdAt.toISOString()}  ${r.level.padEnd(5)} ${r.source.padEnd(32)} x${String(rep).padStart(3)}  ${r.message.slice(0, 100)}`);
    console.log(`    meta: ${JSON.stringify(m).slice(0, 160)}`);
  }
  console.log(`\ntotal occurrences these ${noTenant.length} rows stand for: ${occ}`);
  const after = await prisma.systemAlert.count();
  console.log(`[self-check] before=${before} after=${after} -> wrote nothing: ${before === after ? 'YES' : 'NO'}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
