import type { Page, BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import type { $Enums } from '@prisma/client';
import { withSystemScope } from '@/lib/system-scope';
import { e2eAuthSecret } from './auth-secret';

const COOKIE_NAME = 'authjs.session-token';
const SECRET = e2eAuthSecret();
// Same default as playwright.config.ts, so the cookie lands on the server under test.
const DEFAULT_BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3000}`;

/*
 * How the two halves fit together
 *
 * seedIdentity() writes database rows (User + Membership [+ Workspace]). It needs no
 * browser, so call it in `test.beforeAll`, once per user. The JWT callback reads
 * these rows on every request; without them the session is routed to /no-workspace.
 *
 * signInAs() puts a session cookie into ONE browser context. A context exists only
 * inside a test (`{ page }`), so call it in the test body or in `test.beforeEach` —
 * never in `beforeAll`. Its claims (id, email, tenantId, role) must name a user you
 * seeded; the cookie does not create anybody.
 *
 * Several users in one spec: seed each of them in the same beforeAll. To put them in
 * the same workspace, pass the workspace object to each user, or pass `workspace` only
 * to the first and `workspaceIds: [workspace.id]` to the others. The upsert is keyed
 * on tenant + slug, so sharing the object across calls is safe. Then, in each test, sign in
 * as exactly one of them:
 *
 *   const ws = { id: 'my-ws', slug: 'my-ws', name: 'My WS' };
 *   test.beforeAll(async () => {
 *     await seedIdentity({ userId: 'e2e-a', email: 'a@e2e.test', role: 'TENANT_OWNER', tenantId: 'demo-tenant' }, ws);
 *     await seedIdentity({ userId: 'e2e-b', email: 'b@e2e.test', role: 'PIPELINE_MANAGER', tenantId: 'demo-tenant', workspaceIds: [ws.id] });
 *   });
 *   test.afterAll(() => cleanupIdentity(['e2e-a', 'e2e-b']));
 *
 *   test('owner sees X', async ({ page }) => {
 *     await signInAs(page, { id: 'e2e-a', email: 'a@e2e.test', tenantId: 'demo-tenant', role: 'TENANT_OWNER' });
 *     await page.goto('/tr/my-ws/panel');
 *   });
 *
 * Two users in ONE test need two contexts (`browser.newContext()`), one signInAs each:
 * a second signInAs on the same context overwrites the first cookie.
 */

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
    // Not the seed's admin@yasinaslan.com.tr: that address already belongs to
    // `demo-user-superadmin`, and User.email is unique, so seeding it under this id fails.
    email: 'platform.admin@e2e.fabrika.test',
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
 * If neither workspaceIds nor workspace is given, creates a default demo workspace
 * and assigns the user to it. `workspaceIds: []` given explicitly means every
 * workspace of the tenant (schema: "empty = all"), which is what the demo seats
 * hold. If workspaceIds refers to non-existent workspaces, this will fail (the test
 * must create them first via workspace parameter if needed).
 *
 * `isPlatformAdmin` sets User.isPlatformAdmin. The jwt callback reads the platform-admin
 * right from that column on every request (a claim in the cookie is ignored), so an
 * /admin spec needs it here, not in signInAs.
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
    isPlatformAdmin?: boolean;
  },
  workspace?: { id: string; slug: string; name: string },
): Promise<void> {
  const isPlatformAdmin = identity.isPlatformAdmin === true;
  await withSystemScope('platform-admin', 'e2e.session.seed', async (tx) => {
    let workspaceIds = identity.workspaceIds ?? [];

    // Create workspace if provided
    if (workspace) {
      // Use the id the row actually has: when the slug already exists (seeded by
      // another spec or the demo seed) under another id, `workspace.id` names nothing.
      const row = await tx.workspace.upsert({
        where: { tenantId_slug: { tenantId: identity.tenantId, slug: workspace.slug } },
        create: {
          id: workspace.id,
          tenantId: identity.tenantId,
          slug: workspace.slug,
          name: workspace.name,
        },
        update: { name: workspace.name },
      });
      workspaceIds = [row.id];
    }

    // Nothing asked for at all: create a default one. An explicit [] stays [] (all).
    if (!workspace && identity.workspaceIds === undefined) {
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
        isPlatformAdmin,
      },
      update: {
        email: identity.email,
        name: identity.name,
        isPlatformAdmin,
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
    for (const userId of userIds) {
      if (!userId) continue;
      // Delete memberships first (they have a FK to users)
      await tx.membership.deleteMany({
        where: { userId },
      });
      // Then delete the user
      await tx.user.deleteMany({
        where: { id: userId },
      });
    }
  });
}

/**
 * Sign in as a user by minting a JWT session cookie with the e2e auth secret.
 * Adds the cookie to the browser context and sets up localStorage for cookie consent.
 *
 * @param contextOrPage Playwright BrowserContext or Page (if Page, uses its context)
 * @param token Token claims to encode (sub/id, email, name, tenantId, role, etc.)
 * @param baseURL Base URL for the cookie (defaults to E2E_BASE_URL, else localhost:E2E_PORT)
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
  baseURL = DEFAULT_BASE_URL,
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
  const page = 'context' in contextOrPage ? contextOrPage.context() : contextOrPage;
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}
