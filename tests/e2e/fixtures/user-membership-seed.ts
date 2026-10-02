import { withSystemScope } from '../../../src/lib/system-scope';

/**
 * Fixture to seed a user and membership for E2E tests that create JWT tokens.
 *
 * The JWT callback reads membership from the database to populate tenantId/role.
 * If the user or membership doesn't exist, the session becomes tenantless (403).
 * This helper creates both rows so tests with hardcoded tokens work correctly.
 */
export async function seedUserMembership(
  tenantId: string,
  userId: string,
  email: string,
  name: string = 'E2E Test User',
  role: 'TENANT_OWNER' | 'TENANT_ADMIN' | 'MEMBER' | 'PIPELINE_MANAGER' | null = 'TENANT_OWNER',
  workspaceIds: string[] = []
) {
  return withSystemScope('platform-admin', 'e2e-test-user-seed', async (tx) => {
    // Create user if it doesn't exist
    await tx.user.upsert({
      where: { id: userId },
      create: { id: userId, email, name, locale: 'tr' },
      update: { email, name },
    });

    // Create membership if it doesn't exist. When role is null, it must be explicitly
    // set to null in both create and update, otherwise Prisma's @default(MEMBER) applies.
    const roleValue = role === null ? { role: null } : { role };
    await tx.membership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, ...roleValue, workspaceIds },
      update: { ...roleValue, workspaceIds },
    });
  });
}

/**
 * Clean up user and membership after test.
 */
export async function cleanupUserMembership(
  tenantId: string,
  userId: string,
) {
  return withSystemScope('platform-admin', 'e2e-test-user-cleanup', async (tx) => {
    await tx.membership.deleteMany({
      where: { tenantId, userId },
    });
    await tx.user.deleteMany({
      where: { id: userId },
    });
  });
}
