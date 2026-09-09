/**
 * QA — TASK-MTSWLWDONWA3W, round 4 (blok-zincir-denet-i).
 *
 * Round 3 left `Invoice_fx_required_for_foreign_currency` NOT VALID because two
 * rows an earlier QA round wrote were still in the database, one of them a
 * rate-less USD invoice the constraint cannot accept. Those rows are probe
 * residue, not tenant data: same fixture tenant `qa-fx-…`, written 2026-09-08
 * 17:20 by the round-2 probe. This removes them and then validates the
 * constraint, which is what a production deploy has to do too.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { prisma } from '../../../src/lib/db';

const FIXTURE_TENANT = 'cmtsxqkuo00009axkyn3suia7'; // slug qa-fx-1788888018115

async function state() {
  return JSON.stringify(await prisma.$queryRawUnsafe(
    `select conname, convalidated from pg_constraint
      where conrelid='"Invoice"'::regclass and conname='Invoice_fx_required_for_foreign_currency'`));
}

const tenant = await prisma.tenant.findUnique({ where: { id: FIXTURE_TENANT }, select: { slug: true, name: true } });
console.log('fixture tenant:', JSON.stringify(tenant));
console.log('invoices on it:', JSON.stringify(await prisma.invoice.findMany({ where: { tenantId: FIXTURE_TENANT }, select: { number: true, currency: true, fxRate: true } })));
console.log('invoices on any OTHER tenant:', await prisma.invoice.count({ where: { tenantId: { not: FIXTURE_TENANT } } }));
console.log('constraint before:', await state());

console.log('\n--- removing the QA fixture ---');
console.log('invoices deleted:', (await prisma.invoice.deleteMany({ where: { tenantId: FIXTURE_TENANT } })).count);
console.log('billing identities deleted:', (await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: FIXTURE_TENANT } })).count);
console.log('memberships deleted:', (await prisma.membership.deleteMany({ where: { tenantId: FIXTURE_TENANT } })).count);
console.log('tenant deleted:', (await prisma.tenant.deleteMany({ where: { id: FIXTURE_TENANT } })).count);

console.log('\n--- ALTER TABLE "Invoice" VALIDATE CONSTRAINT ... ---');
await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_fx_required_for_foreign_currency"`);
console.log('constraint after:', await state());
console.log('invoice rows left in the database:', await prisma.invoice.count());
await prisma.$disconnect();
