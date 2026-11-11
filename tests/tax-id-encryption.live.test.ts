import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { TAX_ID_PREFIX } from '@/lib/billing/tax-id-crypto';

/**
 * NG-40 (§18.3): the buyer tax number is encrypted at the field level.
 *
 * `prisma` is the application client (encrypting extension on). The raw
 * `$queryRaw` below reads what Postgres actually holds, which is the claim:
 * "no plain number in the database, and the application still reads it".
 * The key comes from the environment (TAX_ID_ENCRYPTION_KEY); the test never
 * names it.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const dbHost = new URL(process.env.DATABASE_URL ?? 'postgresql://x@nowhere/none').hostname;
const RUN = HAS_DB && ['localhost', '127.0.0.1', '::1'].includes(dbHost);

const RUNID = `ng40tax${Date.now().toString(36)}`;
const T1 = `${RUNID}-1`;
const T2 = `${RUNID}-2`;
const VKN = '2840958172';
const TCKN = '10000000146';

const identity = (tenantId: string, buyerVknTckn: string) => ({
  tenantId,
  buyerName: 'NG40 Test A.Ş.',
  buyerVknTckn,
  buyerTaxOffice: 'Test V.D.',
  buyerAddress: 'Test Cad. 1',
  buyerCity: 'Ankara',
});

async function rawIdentity(tenantId: string): Promise<string | undefined> {
  const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT "buyerVknTckn" AS v FROM "TenantBillingIdentity" WHERE "tenantId" = ${tenantId}`;
  return rows[0]?.v;
}
async function rawInvoice(id: string): Promise<string | undefined> {
  const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT "buyerVknTckn" AS v FROM "Invoice" WHERE id = ${id}`;
  return rows[0]?.v;
}

async function cleanup() {
  await prisma.invoice.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
}

function runScript(...args: string[]): string {
  return execFileSync('npx', ['tsx', 'scripts/encrypt-tax-ids.ts', ...args, '--tenant', T2], {
    encoding: 'utf8',
    env: process.env,
  });
}

describe.skipIf(!RUN)('buyerVknTckn is encrypted at rest (live database)', () => {
  beforeAll(async () => {
    await cleanup();
    for (const id of [T1, T2]) await prisma.tenant.create({ data: { id, name: id, slug: id, country: 'TR' } });
  });
  afterAll(cleanup);

  it('TenantBillingIdentity: Postgres holds an envelope, the application reads the digits', async () => {
    await prisma.tenantBillingIdentity.create({ data: identity(T1, VKN) });
    const stored = await rawIdentity(T1);
    expect(stored?.startsWith(TAX_ID_PREFIX)).toBe(true);
    expect(stored).not.toContain(VKN);
    const read = await prisma.tenantBillingIdentity.findUniqueOrThrow({ where: { tenantId: T1 } });
    expect(read.buyerVknTckn).toBe(VKN);
  });

  it('upsert/update keep it encrypted and round-trip', async () => {
    await prisma.tenantBillingIdentity.upsert({
      where: { tenantId: T1 },
      create: identity(T1, TCKN),
      update: { buyerVknTckn: TCKN },
    });
    const stored = await rawIdentity(T1);
    expect(stored?.startsWith(TAX_ID_PREFIX)).toBe(true);
    expect(stored).not.toContain(TCKN);
    expect((await prisma.tenantBillingIdentity.findUniqueOrThrow({ where: { tenantId: T1 } })).buyerVknTckn).toBe(TCKN);
  });

  it('Invoice: encrypted at rest, plain through the application', async () => {
    const created = await prisma.invoice.create({
      data: {
        tenantId: T1,
        number: `${RUNID}-INV`,
        issuedAt: new Date('2026-09-01T09:00:00.000Z'),
        currency: 'TRY',
        buyerName: 'NG40 Test A.Ş.',
        buyerVknTckn: VKN,
        buyerTaxOffice: 'Test V.D.',
        buyerAddress: 'Test Cad. 1',
        buyerCity: 'Ankara',
        lines: [{ name: 'x', quantity: 1, unitCode: 'MON', unitPriceMinor: 100, vatRate: 20 }],
        ettn: randomUUID(),
      },
    });
    expect(created.buyerVknTckn).toBe(VKN);
    const stored = await rawInvoice(created.id);
    expect(stored?.startsWith(TAX_ID_PREFIX)).toBe(true);
    expect(stored).not.toContain(VKN);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } })).buyerVknTckn).toBe(VKN);
    expect((await prisma.invoice.findMany({ where: { tenantId: T1 } }))[0]?.buyerVknTckn).toBe(VKN);
  });

  it('a nested write or include through another model is refused, nothing is stored (F1)', async () => {
    await expect(
      prisma.tenant.update({
        where: { id: T2 },
        data: { billingIdentity: { create: { buyerName: 'x', buyerVknTckn: VKN, buyerTaxOffice: 'v', buyerAddress: 'a', buyerCity: 'c' } } },
      })
    ).rejects.toThrow(/reaches the encrypted tax number/);
    expect(await rawIdentity(T2)).toBeUndefined();
    await expect(prisma.tenant.findUnique({ where: { id: T1 }, include: { billingIdentity: true } })).rejects.toThrow(
      /reaches the encrypted tax number/
    );
    await expect(prisma.tenant.findUnique({ where: { id: T1 }, include: { invoices: true } })).rejects.toThrow(
      /reaches the encrypted tax number/
    );
    // a plain tenant read and a count are untouched
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: T1 } })).id).toBe(T1);
  });

  // NG-40 sec round 3 / F1: the same field reached FROM the two covered models, through `tenant`.
  it('a nested write or include starting at Invoice / TenantBillingIdentity is refused, nothing is stored (F1, round 3)', async () => {
    const T3 = `${RUNID}-3`;
    const T4 = `${RUNID}-4`;
    await prisma.tenant.create({ data: { id: T3, name: T3, slug: T3, country: 'TR' } });
    try {
      const invoiceData = (n: string) => ({
        number: `${RUNID}-${n}`,
        issuedAt: new Date('2026-09-01T09:00:00.000Z'),
        currency: 'TRY',
        buyerName: 'NG40 Test A.Ş.',
        buyerVknTckn: VKN,
        buyerTaxOffice: 'Test V.D.',
        buyerAddress: 'Test Cad. 1',
        buyerCity: 'Ankara',
        lines: [{ name: 'x', quantity: 1, unitCode: 'MON', unitPriceMinor: 100, vatRate: 20 }],
        ettn: randomUUID(),
      });
      const refused = /reaches the encrypted tax number/;
      const invoiceCount = async () => (await prisma.invoice.count({ where: { tenantId: { in: [T1, T3] } } }));
      const before = await invoiceCount();

      // (a) invoice.create -> tenant -> billingIdentity.create(buyerVknTckn)
      await expect(
        prisma.invoice.create({
          data: {
            ...invoiceData('A'),
            tenant: {
              create: {
                id: T4,
                name: T4,
                slug: T4,
                country: 'TR',
                billingIdentity: { create: { buyerName: 'x', buyerVknTckn: VKN, buyerTaxOffice: 'v', buyerAddress: 'a', buyerCity: 'c' } },
              },
            },
          },
        })
      ).rejects.toThrow(refused);
      expect(await rawIdentity(T4)).toBeUndefined();
      expect(await prisma.tenant.count({ where: { id: T4 } })).toBe(0);
      expect(await invoiceCount()).toBe(before);

      // (b) tenantBillingIdentity.update -> tenant.update -> invoices.create(buyerVknTckn)
      await prisma.tenantBillingIdentity.create({ data: identity(T3, VKN) });
      await expect(
        prisma.tenantBillingIdentity.update({
          where: { tenantId: T3 },
          data: { tenant: { update: { invoices: { create: invoiceData('B') } } } },
        })
      ).rejects.toThrow(refused);
      expect(await invoiceCount()).toBe(before);

      // (c) tenantBillingIdentity.findUnique include tenant.include.invoices
      await expect(
        prisma.tenantBillingIdentity.findUnique({ where: { tenantId: T3 }, include: { tenant: { include: { invoices: true } } } })
      ).rejects.toThrow(refused);

      // the top-level field of the covered model itself still works (encrypted at rest, read as digits)
      const stored = await rawIdentity(T3);
      expect(stored?.startsWith(TAX_ID_PREFIX)).toBe(true);
      expect((await prisma.tenantBillingIdentity.findUniqueOrThrow({ where: { tenantId: T3 }, include: { tenant: true } })).buyerVknTckn).toBe(VKN);
    } finally {
      await prisma.invoice.deleteMany({ where: { tenantId: { in: [T3, T4] } } });
      await prisma.tenantBillingIdentity.deleteMany({ where: { tenantId: { in: [T3, T4] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [T3, T4] } } });
    }
  });

  it('a legacy plaintext row is still readable, and the migration script converts it both ways', async () => {
    await prisma.$executeRaw`INSERT INTO "TenantBillingIdentity" ("tenantId","buyerName","buyerVknTckn","buyerTaxOffice","buyerAddress","buyerCity","buyerCountry","createdAt","updatedAt")
      VALUES (${T2}, 'Legacy', ${VKN}, 'V.D.', 'Adres', 'Ankara', 'Türkiye', now(), now())`;
    expect(await rawIdentity(T2)).toBe(VKN); // plaintext in the database ...
    expect((await prisma.tenantBillingIdentity.findUniqueOrThrow({ where: { tenantId: T2 } })).buyerVknTckn).toBe(VKN); // ... still read

    const dry = runScript();
    expect(dry).toContain('plain=1');
    expect(await rawIdentity(T2)).toBe(VKN); // dry run writes nothing

    runScript('--apply');
    const enc = await rawIdentity(T2);
    expect(enc?.startsWith(TAX_ID_PREFIX)).toBe(true);
    expect(enc).not.toContain(VKN);
    expect((await prisma.tenantBillingIdentity.findUniqueOrThrow({ where: { tenantId: T2 } })).buyerVknTckn).toBe(VKN);

    expect(runScript('--apply')).toContain('encrypted 0 row(s)'); // idempotent

    runScript('--rollback');
    expect(await rawIdentity(T2)).toBe(VKN);
    expect(runScript('--rollback')).toContain('decrypted 0 row(s)');
  }, 120_000);
});
