import { describe, expect, test, vi, beforeEach } from 'vitest';

/**
 * The write path for `TenantBillingIdentity`, exercised at the action boundary:
 * who may call it, what reaches the database, and what a failure says back.
 *
 * The table sat read-only until TASK-MTSY71BUMBLWM — `invoice-writer.ts` read
 * it, `vat-rate.ts` read it, and nothing wrote it — so these are the first tests
 * that a row can be created at all.
 */

const scope = { tenantId: 'tenant-1', userId: 'user-1', role: 'TENANT_OWNER', workspaceIds: [], isPlatformAdmin: false };
const currentScope = { value: { ...scope } };

// Typed with its argument: an untyped `vi.fn(async () => ...)` has an empty
// tuple for `mock.calls`, so reading `calls[0][0]` is a type error, and the
// assertions below exist precisely to inspect that argument.
const upsert = vi.fn(async (_args: {
  where: { tenantId: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}) => ({}));
const setConfig = vi.fn();

vi.mock('../src/lib/tenant', () => ({
  requireTenantAction: async () => currentScope.value,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('../src/lib/db', () => ({
  // Mirrors `withTenant`: the callback only ever sees a transaction that has
  // had `app.tenant_id` set, which is what the RLS policy keys off.
  withTenant: async (tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    setConfig(tenantId);
    return cb({ tenantBillingIdentity: { upsert } });
  },
}));

const { saveBillingIdentity } = await import(
  '../src/app/[locale]/(app)/[workspace]/settings/billing/identity-actions'
);

const complete = {
  buyerName: 'Örnek Teknoloji A.Ş.',
  buyerVknTckn: '1000000000',
  buyerTaxOffice: 'Maslak Vergi Dairesi',
  buyerAddress: 'Büyükdere Cad. No: 1',
  buyerCity: 'İstanbul',
  buyerCountry: 'TR',
};

beforeEach(() => {
  currentScope.value = { ...scope };
  upsert.mockClear();
  upsert.mockImplementation(async () => ({}));
  setConfig.mockClear();
});

describe('saveBillingIdentity — permission', () => {
  test('a TENANT_OWNER may write the identity', async () => {
    const result = await saveBillingIdentity(complete);
    expect(result).toEqual({ ok: true, country: 'TR', invoiceable: true });
    expect(upsert).toHaveBeenCalledOnce();
  });

  test.each(['TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'])(
    '%s is refused and nothing is written',
    async (role) => {
      currentScope.value = { ...scope, role };
      const result = await saveBillingIdentity(complete);
      expect(result).toEqual({ ok: false, error: 'forbidden' });
      expect(upsert).not.toHaveBeenCalled();
    }
  );

  test('a role outside the enum grants nothing', async () => {
    currentScope.value = { ...scope, role: 'SUPER_DUPER_OWNER' };
    const result = await saveBillingIdentity(complete);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('saveBillingIdentity — what reaches the database', () => {
  test('writes the session tenant, never one named by the caller', async () => {
    await saveBillingIdentity({ ...complete, tenantId: 'tenant-2' });
    expect(setConfig).toHaveBeenCalledWith('tenant-1');
    const args = upsert.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    if (!args) return;
    expect(args.where.tenantId).toBe('tenant-1');
    expect(args.create.tenantId).toBe('tenant-1');
    expect(args.update).not.toHaveProperty('tenantId');
  });

  test('stores normalised values, not the raw form input', async () => {
    await saveBillingIdentity({
      ...complete,
      buyerVknTckn: '100.000.000 0',
      buyerTaxOffice: '  Maslak   Vergi\nDairesi ',
      buyerCountry: 'Türkiye',
    });
    const args = upsert.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    if (!args) return;
    expect(args.create.buyerVknTckn).toBe('1000000000');
    expect(args.create.buyerTaxOffice).toBe('Maslak Vergi Dairesi');
    expect(args.create.buyerCountry).toBe('TR');
  });

  test('an invalid identity is refused before any write', async () => {
    const result = await saveBillingIdentity({ ...complete, buyerVknTckn: '1234567891' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('validation_failed');
    expect(result.issues).toEqual([{ field: 'buyerVknTckn', code: 'vkn_tckn_checksum' }]);
    expect(upsert).not.toHaveBeenCalled();
  });

  test('a validation failure never echoes the submitted number back', async () => {
    const secret = '12345678901';
    const result = await saveBillingIdentity({ ...complete, buyerVknTckn: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  test('a country awaiting a VAT ruling saves but reports itself uninvoiceable', async () => {
    const result = await saveBillingIdentity({ ...complete, buyerCountry: 'DE' });
    expect(result).toEqual({ ok: true, country: 'DE', invoiceable: false });
    expect(upsert).toHaveBeenCalledOnce();
  });

  test('a database failure is reported as a failure, not as a save', async () => {
    upsert.mockImplementation(async () => {
      throw new Error('connection refused');
    });
    const result = await saveBillingIdentity(complete);
    expect(result).toEqual({ ok: false, error: 'write_failed' });
  });
});
