/**
 * TASK-MTS9CEDCWKQQK — delete the two unregistered `demo-tenant` opportunities.
 *
 * Destructive, so it is narrow on purpose: two literal ids, and the identity of
 * each (tenant + title + creation day) is re-checked INSIDE the transaction, not
 * only by the audit script that ran before it. Any mismatch, any count other than
 * exactly two, and the transaction rolls back having changed nothing.
 *
 * The backup taken by `task-mts9cedcwkqqk-audit.ts` is the way back.
 * Run with --confirm; without it the script only reports what it would do.
 */
import { prisma } from '../src/lib/db';

const IDS = ['cmtrmwgmy001493xkt7gyg4mm', 'cmtrmxtin0002d9xk0cif5ky6'];
const EXPECTED_TITLE = 'İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri';
const EXPECTED_TENANT = 'demo-tenant';
const EXPECTED_DAY = '2026-09-07';

async function main() {
  const confirmed = process.argv.includes('--confirm');

  await prisma.$transaction(async (tx) => {
    const rows = await tx.opportunity.findMany({ where: { id: { in: IDS } } });
    if (rows.length !== IDS.length) {
      throw new Error(`expected ${IDS.length} rows, found ${rows.length} — refusing`);
    }
    for (const row of rows) {
      if (row.tenantId !== EXPECTED_TENANT) throw new Error(`${row.id}: tenantId ${row.tenantId} — refusing`);
      if (row.title !== EXPECTED_TITLE) throw new Error(`${row.id}: title mismatch — refusing`);
      if (row.createdAt.toISOString().slice(0, 10) !== EXPECTED_DAY) {
        throw new Error(`${row.id}: createdAt ${row.createdAt.toISOString()} — refusing`);
      }
    }
    console.log('identity re-checked inside the transaction: 2/2 match');

    const before = await tx.opportunity.count({ where: { tenantId: EXPECTED_TENANT } });
    console.log(`demo-tenant opportunities before: ${before}`);

    if (!confirmed) {
      console.log('DRY RUN — pass --confirm to delete. Rolling back.');
      throw new Error('__dry_run__');
    }

    const { count } = await tx.opportunity.deleteMany({ where: { id: { in: IDS } } });
    if (count !== IDS.length) throw new Error(`deleted ${count} rows, expected ${IDS.length} — rolling back`);

    const after = await tx.opportunity.count({ where: { tenantId: EXPECTED_TENANT } });
    console.log(`deleted ${count} rows; demo-tenant opportunities after: ${after}`);
    if (after !== before - IDS.length) throw new Error(`count went ${before} → ${after} — rolling back`);
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  if (e instanceof Error && e.message === '__dry_run__') {
    await prisma.$disconnect();
    return;
  }
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
