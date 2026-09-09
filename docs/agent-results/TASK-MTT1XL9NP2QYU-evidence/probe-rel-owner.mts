/**
 * QA probe — TASK-MTT1XL9NP2QYU (blok-zincir-denet-i).
 * Asks the LIVE database whether Relationship.ownerUserId is really nullable,
 * then runs the REAL purge (purgeDueUsers) over a fixture subject and measures
 * what survives. Everything it writes it deletes again.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';
import { purgeDueUsers } from '../../../src/lib/inngest/jobs/users-scheduled-deletion';

const RUN = Date.now().toString(36);
const id = {
  tenant: `qa-rel-t-${RUN}`,
  subject: `qa-rel-subj-${RUN}`,
  other: `qa-rel-other-${RUN}`,
  relSubject: `qa-rel-r1-${RUN}`,
  relOther: `qa-rel-r2-${RUN}`,
};

async function cleanup() {
  // The purge writes a `user.erased` AuditEvent keyed by a hash of the subject,
  // so the probe has to clear it by the reason it wrote — otherwise the run
  // leaves audit residue behind in the database it measured.
  await prisma.auditEvent.deleteMany({ where: { type: 'user.erased', data: { path: ['reason'], equals: 'qa probe' } } });
  await prisma.relationship.deleteMany({ where: { tenantId: id.tenant } });
  await prisma.membership.deleteMany({ where: { tenantId: id.tenant } });
  await prisma.tenant.deleteMany({ where: { id: id.tenant } });
  await prisma.user.deleteMany({ where: { id: { in: [id.subject, id.other] } } });
}

async function main() {
  console.log('--- A. Does the LIVE database carry a nullable column? ---');
  console.log(JSON.stringify(await prisma.$queryRawUnsafe(
    `select column_name, is_nullable, data_type from information_schema.columns
     where table_name='Relationship' and column_name in ('ownerUserId','counterpartName','counterpartEmail')
     order by column_name`)));
  console.log('column comment:', JSON.stringify(await prisma.$queryRawUnsafe(
    `select d.description from pg_description d
       join pg_attribute a on a.attrelid = d.objoid and a.attnum = d.objsubid
      where d.objoid = '"Relationship"'::regclass and a.attname = 'ownerUserId'`)));

  await cleanup();

  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 60);

  await prisma.tenant.create({ data: { id: id.tenant, name: `QA Rel ${RUN}`, slug: `qa-rel-${RUN}`, country: 'TR' } });
  await prisma.user.create({ data: { id: id.subject, email: `subj-${RUN}@qa.invalid`, name: 'QA Subject', deletionRequestedAt: past, deletionReason: 'qa probe' } });
  await prisma.user.create({ data: { id: id.other, email: `other-${RUN}@qa.invalid`, name: 'QA Other' } });
  await prisma.relationship.createMany({
    data: [
      { id: id.relSubject, tenantId: id.tenant, kind: 'partner', ownerUserId: id.subject, counterpartName: `Partner ${RUN}`, counterpartEmail: `partner-${RUN}@x.invalid`, warmth: 'warm' },
      { id: id.relOther, tenantId: id.tenant, kind: 'ncp', ownerUserId: id.other, counterpartName: `NCP ${RUN}`, counterpartEmail: `ncp-${RUN}@x.invalid`, warmth: 'cold' },
    ],
  });

  console.log('\n--- B. Before the purge ---');
  console.log(JSON.stringify(await prisma.relationship.findMany({
    where: { tenantId: id.tenant }, orderBy: { id: 'asc' },
    select: { id: true, ownerUserId: true, counterpartName: true, counterpartEmail: true },
  })));

  console.log('\n--- C. Real purgeDueUsers() ---');
  const out = await purgeDueUsers();
  console.log(JSON.stringify(out));

  console.log('\n--- D. After the purge ---');
  const after = await prisma.relationship.findMany({
    where: { tenantId: id.tenant }, orderBy: { id: 'asc' },
    select: { id: true, ownerUserId: true, counterpartName: true, counterpartEmail: true },
  });
  console.log(JSON.stringify(after));
  console.log('subject user row still present?', (await prisma.user.count({ where: { id: id.subject } })) > 0);
  console.log('subject id left in ANY Relationship row?',
    await prisma.relationship.count({ where: { ownerUserId: id.subject } }));
  console.log('untouched colleague still assigned?',
    after.find((r) => r.id === id.relOther)?.ownerUserId === id.other);
  console.log("tenant's partner record survived (row + counterpart)?",
    after.length === 2 && after.every((r) => Boolean(r.counterpartName && r.counterpartEmail)));

  console.log('\n--- E. Raw scan: does the erased id survive anywhere in Relationship? ---');
  console.log(JSON.stringify(await prisma.$queryRawUnsafe(
    `select count(*)::int as hits from "Relationship" where "ownerUserId" = $1
       or "counterpartName" = $1 or "counterpartEmail" = $1 or "notes" ilike '%' || $1 || '%'`, id.subject)));

  await cleanup();
  console.log('\n(fixture removed)');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await cleanup(); await prisma.$disconnect(); process.exit(1); });
