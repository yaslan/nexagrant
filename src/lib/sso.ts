import { prisma } from './db';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';

export interface EnterpriseSsoConfig {
  tenantId: string;
  domain: string; // e.g. "itu.edu.tr", "fraunhofer.de"
  idpEntityId: string;
  ssoAcsUrl: string;
  x509Certificate?: string;
  providerType: 'SAML_2_0' | 'AZURE_AD' | 'OKTA' | 'KEYCLOAK' | string;
  enabled: boolean;
}

/** What `Tenant.settings.sso` holds once an admin has configured a domain. */
export interface StoredSsoSettings {
  domain: string;
  idpEntityId: string;
  ssoAcsUrl: string;
  providerType: string;
  enabled: boolean;
  updatedAt: string;
}

export interface ConfigureSsoResult {
  success: boolean;
  /** Present only when the configuration was actually persisted. */
  ssoConfig?: StoredSsoSettings & { x509Certificate: string | null };
  reason?: string;
}

export function normalizeDomain(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Saves or updates tenant Enterprise SAML 2.0 / SSO Configuration.
 *
 * This used to write `prisma.tenant.update({ data: { domain } })`. `Tenant` has
 * no `domain` column (prisma/schema.prisma), so Prisma rejected every call with
 * a PrismaClientValidationError; the catch swallowed it into a `console.warn`
 * and the function returned `success: true` regardless. The admin screen showed
 * "saved" and nothing was ever stored — which is why domain matching was always
 * empty. The configuration now goes into `Tenant.settings`, the JSON column the
 * schema already documents for tenant configuration, and a failure reports
 * itself instead of being disguised as a success.
 */
export async function configureEnterpriseSso(
  config: EnterpriseSsoConfig
): Promise<ConfigureSsoResult> {
  const { tenantId, idpEntityId, ssoAcsUrl, x509Certificate, providerType, enabled } = config;
  const domain = normalizeDomain(config.domain);

  if (!domain) {
    return { success: false, reason: 'domain_required' };
  }

  const sso: StoredSsoSettings = {
    domain,
    idpEntityId,
    ssoAcsUrl,
    providerType,
    enabled,
    updatedAt: new Date().toISOString(),
  };

  try {
    // Read-then-merge: `settings` also carries scoringWeights, gateRules and
    // aiRegion. Writing the column wholesale would delete them.
    const current = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings =
      current.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
        ? (current.settings as Record<string, unknown>)
        : {};

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...settings, sso } },
    });
  } catch (e) {
    // No tenantId in the alert: `SystemAlert` has no RLS policy. See
    // src/lib/observability/system-alert.ts.
    await recordAlert({
      level: 'error',
      source: 'sso-configure',
      message: `Enterprise SSO configuration could not be saved: ${errorMessage(e)}`,
      meta: { providerType, enabled },
    });
    return { success: false, reason: 'not_persisted' };
  }

  return {
    success: true,
    ssoConfig: {
      ...sso,
      x509Certificate: x509Certificate ? '***CERTIFICATE LOADED***' : null,
    },
  };
}

/**
 * The answer to "does this email domain sign in through an IdP?".
 *
 * The provider fields are optional because an unconfigured domain gets only
 * `{ domain, ssoEnabled: false }` — callers must check `ssoEnabled` before
 * reading them.
 */
export interface SsoProviderLookup {
  domain: string;
  ssoEnabled: boolean;
  orgName?: string;
  providerType?: string;
  idpEndpoint?: string;
}

/**
 * Resolves an incoming e-mail domain to the tenant that configured it.
 *
 * The answer comes from what an administrator actually saved. A hard-coded
 * table of invented SAML endpoints for İTÜ, METU and Fraunhofer used to stand
 * in for this lookup; it had no callers, it ignored every tenant's real
 * configuration, and sending a user to a made-up IdP URL is worse than telling
 * the caller the domain is not configured.
 */
export async function resolveSsoProviderForDomain(
  emailOrDomain: string
): Promise<SsoProviderLookup | null> {
  const domain = normalizeDomain(
    (emailOrDomain.includes('@') ? emailOrDomain.split('@')[1] : emailOrDomain) ?? ''
  );
  if (!domain) return null;

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        settings: { path: ['sso', 'domain'], equals: domain },
      },
      select: { name: true, settings: true },
    });

    const stored = (tenant?.settings as { sso?: StoredSsoSettings } | null)?.sso;
    if (!tenant || !stored?.enabled) {
      return { domain, ssoEnabled: false };
    }

    return {
      domain,
      ssoEnabled: true,
      orgName: tenant.name,
      providerType: stored.providerType,
      idpEndpoint: stored.idpEntityId,
    };
  } catch (e) {
    await recordAlert({
      level: 'error',
      source: 'sso-resolve',
      message: `SSO domain lookup failed: ${errorMessage(e)}`,
    });
    // Fail closed: an unresolved domain signs in with a password, it does not
    // get sent to an identity provider we could not confirm.
    return { domain, ssoEnabled: false };
  }
}
