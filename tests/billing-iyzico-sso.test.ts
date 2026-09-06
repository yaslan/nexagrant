import { describe, test, expect, vi } from 'vitest';
import { configureEnterpriseSso, resolveSsoProviderForDomain } from '../src/lib/sso';

vi.mock('../src/lib/db', () => ({
  prisma: {
    tenant: {
      update: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'tenant-1',
        domain: data.domain,
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
    expect(res.ssoConfig.domain).toBe('itu.edu.tr');
  });

  test('resolveSsoProviderForDomain maps corporate domain to SAML IdP', async () => {
    const provider = await resolveSsoProviderForDomain('itu.edu.tr');
    expect(provider).not.toBeNull();
    expect(provider?.providerType).toBe('SAML_2_0');
  });
});
