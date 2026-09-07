import { describe, test, expect, vi } from 'vitest';
import { configureEnterpriseSso, resolveSsoProviderForDomain } from '../src/lib/sso';

vi.mock('../src/lib/db', () => ({
  prisma: {
    tenant: {
      // This mock used to echo `data.domain` straight back, which is why the
      // assertion below passed for months while the real client rejected the
      // write: `Tenant` has no `domain` column. The SSO configuration lives in
      // the `settings` JSON column, so that is what the mock stores.
      findUniqueOrThrow: vi.fn().mockImplementation(async () => ({
        settings: { scoringWeights: { g0: 1 } },
      })),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'tenant-1',
        settings: data.settings,
      })),
      findFirst: vi.fn().mockImplementation(async () => ({
        name: 'İstanbul Teknik Üniversitesi',
        settings: {
          sso: {
            domain: 'itu.edu.tr',
            idpEntityId: 'https://sso.itu.edu.tr/idp/shibboleth',
            ssoAcsUrl: 'https://fabrika.app/api/auth/saml/acs',
            providerType: 'SAML_2_0',
            enabled: true,
          },
        },
      })),
    },
    subscription: {
      upsert: vi.fn().mockImplementation(async ({ create }) => ({
        tenantId: create.tenantId,
        planId: create.planId,
        status: create.status,
        provider: create.provider,
        providerSubId: create.providerSubId,
      })),
    },
  },
}));

describe('Stripe Unified Payment Gateway & Enterprise SAML SSO', () => {
  test('configureEnterpriseSso saves tenant SAML 2.0 configuration', async () => {
    const res = await configureEnterpriseSso({
      tenantId: 'tenant-1',
      domain: 'itu.edu.tr',
      idpEntityId: 'https://sso.itu.edu.tr/idp/shibboleth',
      ssoAcsUrl: 'https://fabrika.app/api/auth/saml/acs',
      providerType: 'SAML_2_0',
      enabled: true,
    });

    expect(res.success).toBe(true);
    expect(res.ssoConfig?.domain).toBe('itu.edu.tr');
  });

  // The domain now resolves from what a tenant administrator saved, not from a
  // hard-coded table of invented university IdP endpoints.
  test('resolveSsoProviderForDomain maps a configured corporate domain to its SAML IdP', async () => {
    const provider = await resolveSsoProviderForDomain('itu.edu.tr');
    expect(provider).not.toBeNull();
    expect(provider?.ssoEnabled).toBe(true);
    expect(provider?.providerType).toBe('SAML_2_0');
    expect(provider?.orgName).toBe('İstanbul Teknik Üniversitesi');
  });
});
