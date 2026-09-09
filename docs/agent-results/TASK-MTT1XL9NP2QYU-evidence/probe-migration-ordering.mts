/**
 * QA probe — TASK-MTT1XL9NP2QYU (blok-zincir-denet-i), finding F-1.
 *
 * `relationship-owner-nullable.sql` is a loose file: no script in this repo
 * applies it, so a deploy that ships the code without running it by hand leaves
 * `ownerUserId` NOT NULL under a purge that now writes NULL into it. This probe
 * recreates exactly that ordering on the local database and measures what the
 * erasure job does — then puts the column back the way it found it.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';
import { purgeDueUsers } from '../../../src/lib/inngest/jobs/users-scheduled-deletion';

const RUN = Date.now().toString(36);
const id = { tenant: `qa-ord-t-${RUN}`, subject: `qa-ord-s-${RUN}`, rel: `qa-ord-r-${RUN}` };

async function nullability() {
  const [row] = (await prisma.$queryRawUnsafe(
    `select is_nullable from information_schema.columns
      where table_name='Relationship' and column_name='ownerUserId'`)) as Array<{ is_nullable: string }>;
  return row?.is_nullable;
}

async function cleanup() {
  // The purge writes a `user.erased` AuditEvent keyed by a hash of the subject,
  // so the probe has to clear it by the reason it wrote — otherwise the run
  // leaves audit residue behind in the database it measured.
  await prisma.auditEvent.deleteMany({ where: { type: 'user.erased', data: { path: ['reason'], equals: 'qa probe' } } });
  await prisma.relationship.deleteMany({ where: { tenantId: id.tenant } });
  await prisma.membership.deleteMany({ where: { tenantId: id.tenant } });
  await prisma.tenant.deleteMany({ where: { id: id.tenant } });
  await prisma.user.deleteMany({ where: { id: id.subject } });
}

async function main() {
  const nulls = (await prisma.relationship.count({ where: { ownerUserId: null } }));
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
    console.log('AuditEvent user.erased written?', await prisma.auditEvent.count({ where: { type: 'user.erased', data: { path: ['reason'], equals: 'qa probe' } } }));
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Relationship" ALTER COLUMN "ownerUserId" DROP NOT NULL`);
    console.log('\ncolumn restored, is_nullable:', await nullability());
    await cleanup();
    console.log('(fixture removed)');
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
