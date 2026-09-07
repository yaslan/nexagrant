/**
 * The tenant context the `jwt`/`session` callbacks in src/lib/auth.ts attach to
 * every session and token.
 *
 * NextAuth's own `Session` carries only `user` and `expires`, so before this
 * augmentation every reader wrote `(session).tenantId` — which dropped
 * type checking for the value that decides which tenant's rows a request may
 * touch. Declared here, a typo in a claim name is a build error.
 *
 * `role` is `string`, not the Prisma `Role` enum: a token minted before a role
 * was renamed still carries the old value, and `isPlatformAdminSession` in
 * src/lib/tenant.ts compares it against `SUPER_ADMIN`/`PLATFORM_ADMIN`, which
 * are not Role members. `TenantScope.role` types it the same way.
 */
declare module 'next-auth' {
  interface Session {
    /** Active membership's tenant, or `null` while the user has none. */
    tenantId: string | null;
    /** Role inside {@link Session.tenantId}, or `null` while there is none. */
    role: string | null;
    /** Workspaces of the active membership; empty when the user has none. */
    workspaceIds: string[];
    /** Platform staff flag — grants the `/admin` surface, never tenant data. */
    isPlatformAdmin: boolean;
  }

  interface User {
    isPlatformAdmin?: boolean;
  }
}

// Makes this file a module, so the `declare module` blocks above augment
// NextAuth rather than shadowing it with a fresh ambient declaration.
export {};
