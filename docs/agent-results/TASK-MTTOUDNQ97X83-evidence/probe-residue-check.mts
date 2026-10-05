/** QA probe — TASK-MTTOUDNQ97X83: did the evidence runs leave anything behind? */
import 'dotenv/config';
import { prisma } from '../../../src/lib/db';

const [col] = (await prisma.$queryRawUnsafe(
  `select is_nullable from information_schema.columns
    where table_name='Relationship' and column_name='ownerUserId'`
)) as Array<{ is_nullable: string }>;

console.log('Relationship.ownerUserId is_nullable :', col?.is_nullable);
console.log('SystemAlert rows, source=users-scheduled-deletion:',
  await prisma.systemAlert.count({ where: { source: 'users-scheduled-deletion' } }));
console.log('leftover qa tenants  :', await prisma.tenant.count({ where: { OR: [
  { id: { startsWith: 'qa-ord-' } }, { id: { startsWith: 'purge-alert-' } },
  { id: { startsWith: 'rel-owner-e2e' } }, { id: { startsWith: 'rel-e2e-' } },
  { id: { startsWith: 'rel-t-' } } ] } }));
console.log('leftover qa users    :', await prisma.user.count({ where: { OR: [
  { id: { startsWith: 'qa-ord-' } }, { id: { startsWith: 'purge-alert-' } },
  { id: { startsWith: 'rel-owner-e2e' } }, { id: { startsWith: 'rel-e2e-' } },
  { id: { startsWith: 'rel-u-' } } ] } }));
console.log('unassigned relationships in db:',
  await prisma.relationship.count({ where: { ownerUserId: null } }));
console.log('user.erased audit rows with reason "qa probe":',
  await prisma.auditEvent.count({ where: { type: 'user.erased', data: { path: ['reason'], equals: 'qa probe' } } }));

await prisma.$disconnect();
