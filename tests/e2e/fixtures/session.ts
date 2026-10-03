import type { Page, BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import type { $Enums } from '@prisma/client';
import { withSystemScope } from '@/lib/system-scope';
import { e2eAuthSecret } from './auth-secret';

const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();

/**
 * Demo seat identities for E2E tests. Each carries a realistic set of claims
 * that the JWT callback and layout can consume. The `e2e-` prefix prevents
 * collision with production or other test users.
 */
export const E2E_IDENTITIES = {
  /** Workspace member with PIPELINE_MANAGER role (no name → OAuth-like token) */
  pipelineManager: {
    userId: 'e2e-pipeline-manager',
    email: 'pipeline.manager@e2e.fabrika.test',
    name: undefined as string | undefined,
    role: 'PIPELINE_MANAGER' as const,
    tenantId: 'demo-tenant',
  },
  /** Workspace member with a full name claim */
  namedMember: {
    userId: 'e2e-named-member',
    email: 'named.member@e2e.fabrika.test',
    name: 'Zeynep Aydın',
    role: 'PIPELINE_MANAGER' as const,
    tenantId: 'demo-tenant',
  },
  /** Platform admin with super-admin role */
  platformAdmin: {
    userId: 'e2e-platform-admin',
    email: 'admin@yasinaslan.com.tr',
    name: 'Platform Admin',
    role: 'SUPER_ADMIN' as const,
    tenantId: 'demo-tenant',
    isPlatformAdmin: true,
  },
  /** Tenant owner role */
  tenantOwner: {
    userId: 'e2e-tenant-owner',
    email: 'owner@e2e.fabrika.test',
    name: 'Müdür',
    role: 'TENANT_OWNER' as const,
    tenantId: 'demo-tenant',
  },
} as const;

export type Identity = Partial<typeof E2E_IDENTITIES[keyof typeof E2E_IDENTITIES]> & {
  userId: string;
  email: string;
  role: $Enums.Role;
  tenantId: string;
};

/**
 * Seed a User, Workspace (if needed), and Membership into the database for an
 * E2E test. Uses withSystemScope to bypass RLS.
 *
 * If workspaceIds is not provided, creates a default demo workspace and assigns
 * the user to it. If workspaceIds is provided but refers to non-existent workspaces,
 * this will fail (the test must create them first via workspace parameter if needed).
 *
 * @param identity Object with userId, email, name (optional), role, tenantId, workspaceIds
 * @param workspace Optional { id, slug, name } to create alongside the user (one workspace)
 * @example
 *   await seedIdentity({
 *     userId: 'my-user',
 *     email: 'test@example.com',
 *     name: 'Test User',
 *     role: 'TENANT_OWNER',
 *     tenantId: 'my-tenant',
 *     workspaceIds: ['workspace-1'],
 *   });
 *
 *   // Or create a workspace at the same time:
 *   await seedIdentity(
 *     {
 *       userId: 'my-user',
 *       email: 'test@example.com',
 *       role: 'TENANT_OWNER',
 *       tenantId: 'my-tenant',
 *     },
 *     { id: 'ws-1', slug: 'my-workspace', name: 'My Workspace' },
 *   );
 */
export async function seedIdentity(
  identity: {
    userId: string;
    email: string;
    name?: string;
    role: $Enums.Role;
    tenantId: string;
    workspaceIds?: string[];
  },
  workspace?: { id: string; slug: string; name: string },
): Promise<void> {
  await withSystemScope('platform-admin', 'e2e.session.seed', async (tx) => {
    let workspaceIds = identity.workspaceIds ?? [];

    // Create workspace if provided
    if (workspace) {
      await tx.workspace.upsert({
        where: { tenantId_slug: { tenantId: identity.tenantId, slug: workspace.slug } },
        create: {
          id: workspace.id,
          tenantId: identity.tenantId,
          slug: workspace.slug,
          name: workspace.name,
        },
        update: { name: workspace.name },
      });
      workspaceIds = [workspace.id];
    }

    // If still no workspaces, create a default one
    if (workspaceIds.length === 0) {
      const defaultWorkspace = await tx.workspace.upsert({
        where: { tenantId_slug: { tenantId: identity.tenantId, slug: 'e2e-default' } },
        create: {
          tenantId: identity.tenantId,
          slug: 'e2e-default',
          name: 'E2E Default Workspace',
        },
        update: {},
      });
      workspaceIds = [defaultWorkspace.id];
    }

    // Upsert the user
    await tx.user.upsert({
      where: { id: identity.userId },
      create: {
        id: identity.userId,
        email: identity.email,
        name: identity.name,
        locale: 'tr',
      },
      update: {
        email: identity.email,
        name: identity.name,
      },
    });

    // Upsert the membership
    await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: identity.tenantId, userId: identity.userId } },
      create: {
        tenantId: identity.tenantId,
        userId: identity.userId,
        role: identity.role as $Enums.Role,
        workspaceIds,
      },
      update: {
        role: identity.role as $Enums.Role,
        workspaceIds,
      },
    });
  });
}

/**
 * Delete a seeded identity (User and Membership rows) in reverse FK order.
 * Uses withSystemScope to bypass RLS.
 *
 * @param userIds Array of user IDs to delete
 * @example
 *   await cleanupIdentity(['my-user', 'another-user']);
 */
export async function cleanupIdentity(userIds: string[]): Promise<void> {
  await withSystemScope('platform-admin', 'e2e.session.cleanup', async (tx) => {
    // Delete memberships first (they have a FK to users)
    await tx.membership.deleteMany({
      where: { userId: { in: userIds } },
    });
    // Then delete the users
    await tx.user.deleteMany({
      where: { id: { in: userIds } },
    });
  });
}

/**
 * Sign in as a user by minting a JWT session cookie with the e2e auth secret.
 * Adds the cookie to the browser context and sets up localStorage for cookie consent.
 *
 * @param contextOrPage Playwright BrowserContext or Page (if Page, uses its context)
 * @param token Token claims to encode (sub/id, email, name, tenantId, role, etc.)
 * @param baseURL Base URL for cookie domain (defaults to 'http://localhost:3000')
 * @example
 *   await signInAs(page, {
 *     id: 'my-user',
 *     email: 'user@example.com',
 *     name: 'Test User',
 *     tenantId: 'my-tenant',
 *     role: 'TENANT_OWNER',
 *   });
 */
export async function signInAs(
  contextOrPage: BrowserContext | Page,
  token: Record<string, unknown>,
  baseURL = 'http://localhost:3000',
): Promise<void> {
  const context = 'context' in contextOrPage ? contextOrPage.context() : contextOrPage;

  // Ensure token has an id/sub claim for NextAuth
  const tokenWithId = {
    sub: (token.id as string) ?? token.sub,
    ...token,
  };

  const value = await encode({
    token: tokenWithId,
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });

  await context.addCookies([
    { name: COOKIE_NAME, value, url: baseURL },
  ]);

  // Set cookie consent in localStorage so the banner doesn't block the test
  const page = 'context' in contextOrPage ? contextOrPage : contextOrPage;
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}
