/**
 * QA probe — TASK-MTTOUDNQ97X83, F-1 (the alarm half).
 *
 * Re-runs the measurement from TASK-MTT1XL9NP2QYU: put `Relationship.ownerUserId`
 * back to the pre-migration shape (NOT NULL), let the erasure job fail on it,
 * and look at what the failure left behind. Last time the answer was
 * "failedCount: 1, SystemAlert rows written: 0". This run is the same probe
 * against the fix, so the two numbers can be compared directly.
 *
 * It also asks the second question that number does not answer: can the
 * *production* role write that row at all? `AiUsageLog` looked writable in
 * exactly this way and was refused by RLS under `fabrika_app`
 * (TASK-MTSYH8LDGV5YU), so the alert path is measured under that role too.
 *
 * LOCAL DEV DATABASE ONLY — it alters a column and puts it back. Never prod.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { prisma } from '../../../src/lib/db';
import { purgeDueUsers } from '../../../src/lib/inngest/jobs/users-scheduled-deletion';

const RUN = Date.now().toString(36);
const id = { tenant: `qa-ord-t-${RUN}`, subject: `qa-ord-s-${RUN}`, rel: `qa-ord-r-${RUN}` };
const ALERT_SOURCE = 'users-scheduled-deletion';

async function nullability() {
  const [row] = (await prisma.$queryRawUnsafe(
    `select is_nullable from information_schema.columns
      where table_name='Relationship' and column_name='ownerUserId'`)) as Array<{ is_nullable: string }>;
  return row?.is_nullable;
}

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { type: 'user.erased', data: { path: ['reason'], equals: 'qa probe' } } });
  await prisma.relationship.deleteMany({ where: { tenantId: id.tenant } });
  await prisma.membership.deleteMany({ where: { tenantId: id.tenant } });
  await prisma.tenant.deleteMany({ where: { id: id.tenant } });
  await prisma.user.deleteMany({ where: { id: id.subject } });
  // The alert this probe provoked names the probe's own subject id, so it can
  // be removed by that id alone — no alert an operator cares about matches.
  await prisma.systemAlert.deleteMany({
    where: { source: ALERT_SOURCE, meta: { path: ['failedUserIds'], array_contains: [id.subject] } },
  });
}

/** Can the role the application actually runs as insert a SystemAlert row? */
async function alertWriteUnderAppRole() {
  const url = process.env.DATABASE_URL_RLS_TEST;
  if (!url) return 'DATABASE_URL_RLS_TEST not set — role not measured';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const probeId = `qa-alert-${RUN}`;
    await client.query(
      `insert into "SystemAlert" (id, level, source, message, meta) values ($1,'error',$2,$3,$4)`,
      [probeId, ALERT_SOURCE, 'probe: can fabrika_app write an alert', JSON.stringify({ probe: RUN })]
    );
    const { rowCount } = await client.query(`select 1 from "SystemAlert" where id = $1`, [probeId]);
    await client.query(`delete from "SystemAlert" where id = $1`, [probeId]);
    return `INSERT accepted and row read back (${rowCount} row), then removed`;
  } catch (e) {
    return `REFUSED: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await client.end();
  }
}

async function main() {
  const nulls = await prisma.relationship.count({ where: { ownerUserId: null } });
  console.log(`rows already unassigned in this database: ${nulls}`);
  if (nulls > 0) {
    console.log('SKIPPED: SET NOT NULL would fail on existing NULL rows — nothing was changed.');
    return;
  }

  await cleanup();
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 60);
  await prisma.tenant.create({ data: { id: id.tenant, name: `QA Ord ${RUN}`, slug: `qa-ord-${RUN}`, country: 'TR' } });
  await prisma.user.create({ data: { id: id.subject, email: `ord-${RUN}@qa.invalid`, name: 'QA Subject', deletionRequestedAt: past, deletionReason: 'qa probe' } });
  await prisma.relationship.create({ data: { id: id.rel, tenantId: id.tenant, kind: 'partner', ownerUserId: id.subject, counterpartName: `Partner ${RUN}`, warmth: 'warm' } });

  try {
    console.log('\n--- Rolling the column back to the pre-migration shape (NOT NULL) ---');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" SET NOT NULL`);
    console.log('is_nullable now:', await nullability());

    const alertsBefore = await prisma.systemAlert.count();
    console.log('\n--- The erasure job runs against the un-migrated column ---');
    const out = await purgeDueUsers();
    console.log('purgeDueUsers ->', JSON.stringify(out));
    console.log('subject user row still present?', (await prisma.user.count({ where: { id: id.subject } })) > 0);
    console.log('subject id still in Relationship?', await prisma.relationship.count({ where: { ownerUserId: id.subject } }));
    console.log('SystemAlert rows written by the failure:', (await prisma.systemAlert.count()) - alertsBefore);

    const alert = await prisma.systemAlert.findFirst({
      where: { source: ALERT_SOURCE, meta: { path: ['failedUserIds'], array_contains: [id.subject] } },
      select: { level: true, source: true, message: true, meta: true, resolvedAt: true },
    });
    console.log('the alert row:', JSON.stringify(alert));
    console.log('alert body mentions the subject e-mail?', JSON.stringify(alert).includes('@qa.invalid'));

    console.log('\n--- The same failure a second night ---');
    const out2 = await purgeDueUsers();
    console.log('purgeDueUsers ->', JSON.stringify(out2));
    console.log('SystemAlert rows after the second run:', (await prisma.systemAlert.count()) - alertsBefore);
    const folded = await prisma.systemAlert.findFirst({
      where: { source: ALERT_SOURCE, meta: { path: ['failedUserIds'], array_contains: [id.subject] } },
      select: { meta: true },
    });
    console.log('repeat counter on the open row:', JSON.stringify(folded?.meta));

    console.log('\n--- Can the production role (fabrika_app) write that row? ---');
    console.log(await alertWriteUnderAppRole());
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" DROP NOT NULL`);
    console.log('\ncolumn restored, is_nullable:', await nullability());
    await cleanup();
    console.log('(fixture and probe alert removed)');
    console.log('SystemAlert rows left by this probe:', await prisma.systemAlert.count({
      where: { source: ALERT_SOURCE, meta: { path: ['failedUserIds'], array_contains: [id.subject] } },
    }));
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" DROP NOT NULL`).catch(() => {});
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
