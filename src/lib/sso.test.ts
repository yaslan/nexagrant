import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDbClient } from '@/lib/db';
import type { RecordAlertInput } from '@/lib/observability/system-alert';

const tenant = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
}));
const recordAlert = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({ status: 'recorded' as const, id: 'a1' }))
);

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  prisma: { tenant },
}));
vi.mock('@/lib/observability/system-alert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/system-alert')>()),
  recordAlert,
}));

const { configureEnterpriseSso, resolveSsoProviderForDomain } = await import('./sso');

const CONFIG = {
  tenantId: 'tenant:1',
  domain: '  ITU.edu.TR ',
  idpEntityId: 'https://sso.example.edu/idp/shibboleth',
  ssoAcsUrl: 'https://fabrika.app/api/auth/saml/acs',
  x509Certificate: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
  providerType: 'SAML_2_0' as const,
  enabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  tenant.findUniqueOrThrow.mockResolvedValue({ settings: { scoringWeights: { a: 1 } } });
  tenant.update.mockResolvedValue({ id: 'tenant:1' });
});

describe('configureEnterpriseSso', () => {
  it('persists the domain into Tenant.settings — a column that exists', async () => {
    const result = await configureEnterpriseSso(CONFIG);

    expect(result.success).toBe(true);
    expect(tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant:1' },
        data: {
          settings: expect.objectContaining({
            sso: expect.objectContaining({
              domain: 'itu.edu.tr',
              idpEntityId: CONFIG.idpEntityId,
              providerType: 'SAML_2_0',
              enabled: true,
            }),
          }),
        },
      })
    );
  });

  it('never writes a `domain` field — Tenant has no such column', async () => {
    await configureEnterpriseSso(CONFIG);

    const data = tenant.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('domain');
    expect(Object.keys(data)).toEqual(['settings']);
  });

  it('keeps the rest of settings intact', async () => {
    await configureEnterpriseSso(CONFIG);

    const { settings } = tenant.update.mock.calls[0]![0].data;
    expect(settings.scoringWeights).toEqual({ a: 1 });
  });

  /**
   * The regression. `prisma.tenant.update({ data: { domain } })` threw
   * PrismaClientValidationError on every call; the catch turned it into a
   * console.warn and the function still answered `success: true`, so the admin
   * screen confirmed a save that had not happened.
   */
  it('reports failure instead of a fake success, and raises an alert', async () => {
    tenant.update.mockRejectedValue(new Error('Unknown argument `domain`.'));

    const result = await configureEnterpriseSso(CONFIG);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_persisted');
    expect(result.ssoConfig).toBeUndefined();
    expect(recordAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', source: 'sso-configure' })
    );
  });

  it('does not put the tenant id in an alert on a table with no RLS policy', async () => {
    tenant.update.mockRejectedValue(new Error('boom'));

    await configureEnterpriseSso(CONFIG);

    const { meta } = recordAlert.mock.calls[0]![0] as RecordAlertInput;
    expect(JSON.stringify(meta ?? {})).not.toContain('tenant:1');
  });

  it('never echoes the certificate back', async () => {
    const result = await configureEnterpriseSso(CONFIG);

    expect(result.ssoConfig?.x509Certificate).toBe('***CERTIFICATE LOADED***');
    expect(JSON.stringify(result)).not.toContain('BEGIN CERTIFICATE');
  });

  it('rejects a blank domain without touching the database', async () => {
    const result = await configureEnterpriseSso({ ...CONFIG, domain: '   ' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('domain_required');
    expect(tenant.update).not.toHaveBeenCalled();
  });
});

describe('resolveSsoProviderForDomain', () => {
  it('matches the domain an administrator actually configured', async () => {
    tenant.findFirst.mockResolvedValue({
      name: 'İstanbul Teknik Üniversitesi',
      settings: { sso: { domain: 'itu.edu.tr', providerType: 'SAML_2_0', idpEntityId: 'https://idp', enabled: true } },
    });

    const found = await resolveSsoProviderForDomain('student@ITU.edu.tr');

    expect(found).toEqual({
      domain: 'itu.edu.tr',
      ssoEnabled: true,
      orgName: 'İstanbul Teknik Üniversitesi',
      providerType: 'SAML_2_0',
      idpEndpoint: 'https://idp',
    });
    expect(tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          settings: { path: ['sso', 'domain'], equals: 'itu.edu.tr' },
        }),
      })
    );
  });

  it('reports an unconfigured domain as disabled rather than inventing an endpoint', async () => {
    tenant.findFirst.mockResolvedValue(null);

    await expect(resolveSsoProviderForDomain('someone@itu.edu.tr')).resolves.toEqual({
      domain: 'itu.edu.tr',
      ssoEnabled: false,
    });
  });

  it('treats a configured-but-disabled domain as disabled', async () => {
    tenant.findFirst.mockResolvedValue({
      name: 'T',
      settings: { sso: { domain: 'itu.edu.tr', providerType: 'OKTA', idpEntityId: 'x', enabled: false } },
    });

    await expect(resolveSsoProviderForDomain('itu.edu.tr')).resolves.toMatchObject({ ssoEnabled: false });
  });

  it('fails closed and alerts when the lookup itself breaks', async () => {
    tenant.findFirst.mockRejectedValue(new Error('connection refused'));

    await expect(resolveSsoProviderForDomain('a@b.com')).resolves.toEqual({
      domain: 'b.com',
      ssoEnabled: false,
    });
    expect(recordAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', source: 'sso-resolve' })
    );
  });

  it('returns null for input with no domain part', async () => {
    await expect(resolveSsoProviderForDomain('  ')).resolves.toBeNull();
  });
});

/**
 * The mocks above prove the logic; only the real client proves the columns.
 * Prisma validates arguments before it uses the connection, so a closed port is
 * enough to tell "rejected by the schema" from "could not reach the database".
 */
describe('Tenant schema contract', () => {
  const db = createDbClient('postgresql://nobody:nobody@127.0.0.1:1/does-not-exist');

  async function rejectionKind(run: () => Promise<unknown>): Promise<string> {
    try {
      await run();
      return 'none';
    } catch (error) {
      return (error as object).constructor.name;
    }
  }

  it('accepts the settings write this module now performs', async () => {
    const kind = await rejectionKind(() =>
      db.tenant.update({ where: { id: 't1' }, data: { settings: { sso: { domain: 'x' } } } })
    );

    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('accepts the settings JSON-path lookup', async () => {
    const kind = await rejectionKind(() =>
      db.tenant.findFirst({
        where: { deletedAt: null, settings: { path: ['sso', 'domain'], equals: 'x' } },
        select: { name: true, settings: true },
      })
    );

    expect(kind).not.toBe('PrismaClientValidationError');
  });

  it('still rejects the `domain` write that silently failed', async () => {
    const kind = await rejectionKind(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.tenant.update({ where: { id: 't1' }, data: { domain: 'itu.edu.tr' } as any })
    );

    expect(kind).toBe('PrismaClientValidationError');
  });
});
