import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import type { OrgType, Role } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { errorMessage } from '@/lib/errors';
import { PRODUCT_NAME } from './brand';

/**
 * TASK-MTRNQHC3IV2BE — the demo sign-in seeds an ORGANISATION, never a person.
 *
 * These entries used to carry a `name` too ("Dr. Mehmet Yılmaz", "Prof. Dr. Ayşe
 * Kaya", "Dr. Can Demir") and the jwt callback re-applied it on every token
 * refresh. Two things followed. A real account registered on one of these
 * addresses was renamed to an invented person with an invented academic title
 * whatever the User row said, and every screenshot of the product named somebody
 * who does not exist. src/lib/user-display.ts already states the rule: fall back
 * only onto data the session actually carries.
 *
 * What survives is the tenant scaffolding a first sign-in needs — org name, org
 * type, seat role, the platform-admin flag. The display name is derived from the
 * address the user actually signed in with, and after that it is whatever the
 * User row holds.
 */
const DEMO_PROFILES: Record<string, { orgName: string; orgType: OrgType; role: Role; isPlatformAdmin?: boolean }> = {
  "admin@yasinaslan.com.tr": {
    orgName: `${PRODUCT_NAME} HQ`,
    orgType: "CONSULTANCY",
    role: "TENANT_OWNER",
    isPlatformAdmin: true,
  },
  "mehmet@fonbridge.app": {
    orgName: `${PRODUCT_NAME} SME Ar-Ge Ltd.`,
    orgType: "SME",
    role: "TENANT_OWNER",
  },
  "ayse@tto.edu.tr": {
    orgName: "İstanbul Teknik Üniversitesi TTO",
    orgType: "UNIVERSITY",
    role: "TENANT_OWNER",
  },
  "can@arge-lab.com": {
    orgName: "Biyo-Teknoloji Araştırma Merkezi",
    orgType: "RESEARCH",
    role: "PIPELINE_MANAGER",
  },
};

const baseAdapter = PrismaAdapter(prisma);

/**
 * The Prisma adapter with every call wrapped so a database outage degrades to a
 * signed-in session instead of a 500. Typed as `Adapter` rather than `any` so a
 * method whose signature drifts from Auth.js is a build error.
 */
const safeAdapter: Adapter = {
  ...baseAdapter,
  async createUser(user: AdapterUser) {
    try {
      return await baseAdapter.createUser!(user);
    } catch (e) {
      console.warn(`[AuthAdapter.createUser] DB error/fallback: ${errorMessage(e)}`);
      return {
        id: `user-oauth-${Date.now()}`,
        email: user.email,
        name: user.name || user.email?.split("@")[0],
        image: user.image,
        emailVerified: new Date(),
      };
    }
  },
  async getUser(id: string) {
    try {
      return await baseAdapter.getUser!(id);
    } catch (e) {
      console.warn(`[AuthAdapter.getUser] DB error/fallback: ${errorMessage(e)}`);
      return null;
    }
  },
  async getUserByEmail(email: string) {
    try {
      return await baseAdapter.getUserByEmail!(email);
    } catch (e) {
      console.warn(`[AuthAdapter.getUserByEmail] DB error/fallback: ${errorMessage(e)}`);
      return null;
    }
  },
  async getUserByAccount(account: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
    try {
      return await baseAdapter.getUserByAccount!(account);
    } catch (e) {
      console.warn(`[AuthAdapter.getUserByAccount] DB error/fallback: ${errorMessage(e)}`);
      return null;
    }
  },
  // The Adapter contract lets these return either the row or nothing; the
  // wrappers normalise the adapter's `void` to `undefined` (the same value at
  // runtime) so one arm of the union covers both the success and the fallback.
  async linkAccount(account: AdapterAccount): Promise<AdapterAccount | undefined> {
    try {
      return (await baseAdapter.linkAccount!(account)) ?? undefined;
    } catch (e) {
      console.warn(`[AuthAdapter.linkAccount] DB error/fallback: ${errorMessage(e)}`);
      return account;
    }
  },
  async createSession(session: { sessionToken: string; userId: string; expires: Date }) {
    try {
      return await baseAdapter.createSession!(session);
    } catch (e) {
      console.warn(`[AuthAdapter.createSession] DB error/fallback: ${errorMessage(e)}`);
      return session;
    }
  },
  async getSessionAndUser(sessionToken: string) {
    try {
      return await baseAdapter.getSessionAndUser!(sessionToken);
    } catch (e) {
      console.warn(`[AuthAdapter.getSessionAndUser] DB error/fallback: ${errorMessage(e)}`);
      return null;
    }
  },
  async updateSession(
    session: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>
  ): Promise<AdapterSession | null | undefined> {
    try {
      return await baseAdapter.updateSession!(session);
    } catch (e) {
      console.warn(`[AuthAdapter.updateSession] DB error/fallback: ${errorMessage(e)}`);
      // The fallback echoes the patch it was given, which is a partial session
      // by construction — the database is what would have filled the rest in.
      // Sessions are JWT-backed here, so nothing reads this value.
      return session as AdapterSession;
    }
  },
  async deleteSession(sessionToken: string): Promise<AdapterSession | null | undefined> {
    try {
      return (await baseAdapter.deleteSession!(sessionToken)) ?? undefined;
    } catch (e) {
      console.warn(`[AuthAdapter.deleteSession] DB error/fallback: ${errorMessage(e)}`);
      return undefined;
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: safeAdapter,
  session: { strategy: "jwt" },
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fabrika-secret-key-horizon-europe-2026-super-secure",
  basePath: "/api/auth",
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "demo-google-id",
      clientSecret: process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "demo-google-secret",
      allowDangerousEmailAccountLinking: true,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID || "demo-entra-id",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET || "demo-entra-secret",
      // Directory (tenant) scoping belongs in `issuer`
      // (https://login.microsoftonline.com/<tenant>/v2.0). A `tenantId` option
      // used to be passed here behind an `as any`; the provider never read it,
      // so it did nothing and the multi-tenant "common" endpoint was always
      // used. Changing that is a deployment decision, not a lint fix.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email / Demo",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.trim()?.toLowerCase();
        if (!email) return null;

        const demoProfile = DEMO_PROFILES[email];
        // Derived from the address the user typed, never from a profile table.
        const computedName = email
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const isSuperadmin = email === "admin@yasinaslan.com.tr" || !!demoProfile?.isPlatformAdmin;

        try {
          // Find or create user. No `include: { memberships: true }`: nothing in
          // `authorize` reads them (the jwt callback does its own membership
          // lookup below), and the include is what made this variable
          // `User & { memberships }` while the create path a few lines down
          // returns a plain `User` — the type mismatch that
          // src/types/prisma-override.d.ts was hiding, and the reason `user`
          // read as possibly null all the way to the return.
          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            // Auto create user and organization
            user = await prisma.$transaction(async (tx) => {
              const newUser = await tx.user.create({
                data: {
                  email,
                  name: computedName,
                  locale: "tr",
                  isPlatformAdmin: isSuperadmin,
                },
              });

              const tenant = await tx.tenant.create({
                data: {
                  name: demoProfile?.orgName || `${computedName} Kuruluşu`,
                  slug: `org-${newUser.id.slice(-6)}`,
                  country: "TR",
                  orgType: demoProfile?.orgType || "SME",
                },
              });

              const workspace = await tx.workspace.create({
                data: {
                  tenantId: tenant.id,
                  name: "Ana Çalışma Alanı",
                  slug: "default",
                },
              });

              await tx.membership.create({
                data: {
                  userId: newUser.id,
                  tenantId: tenant.id,
                  role: demoProfile?.role || "TENANT_OWNER",
                  workspaceIds: [workspace.id],
                },
              });

              return newUser;
            });
          } else {
            // Ensure superadmin flag and name are updated
            if (isSuperadmin && !user.isPlatformAdmin) {
              // Only the flag. Writing `name` here overwrote the name the user
              // had chosen with one derived from their e-mail on every sign-in.
              user = await prisma.user.update({
                where: { id: user.id },
                data: { isPlatformAdmin: true },
              });
            }
          }

          // `user` is `User | null` all the way down this branch: the lookup can
          // miss and the create path is an assignment TypeScript does not carry
          // through the if/else. src/types/prisma-override.d.ts hid the four
          // TS18047 "possibly null" errors, so the only thing standing between a
          // null here and `Cannot read properties of null (reading 'id')` inside
          // `authorize` was luck. A sign-in with no user row is refused, not
          // dereferenced — returning null is NextAuth's "these credentials are
          // not valid", which is the truthful answer.
          if (!user) {
            console.error('[Auth.authorize] sign-in refused: no user row after lookup/create');
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || computedName,
            image: user.image,
          };
        } catch (error) {
          // Signing in against a fabricated user id is a development
          // convenience only: in production a database outage must fail the
          // sign-in, not mint a session for an account nobody verified.
          if (env.NODE_ENV === "production") {
            console.error(`[Auth.authorize] sign-in refused, database unavailable: ${errorMessage(error)}`);
            return null;
          }
          console.warn(`[Auth.authorize] DB fallback for demo: ${errorMessage(error)}`);
          // Deliberately tenantless — see the jwt callback below.
          return {
            id: email === "admin@yasinaslan.com.tr" ? "superadmin-yasin" : "demo-user-mehmet",
            email,
            name: computedName,
          };
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.image = user.image;
      }

      if (token.email) {
        const emailLower = token.email.toLowerCase();
        const demo = DEMO_PROFILES[emailLower];
        // The platform-admin grant only. `token.name = demo.name` used to run
        // here on every refresh, so the DB name lost to a hardcoded one.
        if ((demo?.isPlatformAdmin || emailLower === "admin@yasinaslan.com.tr")) {
          token.isPlatformAdmin = true;
        }
      }

      if (token.id && (!token.tenantId || trigger === "signIn")) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            include: { memberships: true },
          });
          if (dbUser) {
            if (dbUser.isPlatformAdmin) token.isPlatformAdmin = true;
            if (dbUser.memberships.length > 0) {
              const activeMembership = dbUser.memberships[0];
              token.tenantId = activeMembership.tenantId;
              token.role = activeMembership.role;
              token.workspaceIds = activeMembership.workspaceIds;
              if (dbUser.name) token.name = dbUser.name;
            }
          }
        } catch (e) {
          // No fallback tenant here on purpose. A hardcoded demo tenant id
          // used to be assigned when the membership lookup failed, which
          // handed the session a tenant it was never granted — and some of
          // those ids match real rows in the database. A tenantless token is
          // the safe outcome: the UI routes such a user to the "no workspace"
          // screen instead of into another tenant's data. See src/lib/tenant.ts.
          console.warn(`[Auth.jwt] membership lookup failed, session stays tenantless: ${errorMessage(e)}`);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string);
        session.user.name = (token.name as string) || session.user.name;
        session.user.email = (token.email as string) || session.user.email;
        session.user.image = (token.image as string) || session.user.image;
        // tenantId/role are only ever what the membership lookup produced.
        // Defaulting them (to a demo tenant, or to TENANT_OWNER) is how a user
        // with no membership silently gained another tenant's data and an
        // owner's permissions.
        // The token is a `Record<string, unknown>` (see src/types/next-auth.d.ts
        // for why it is not augmented), so each claim is narrowed on the way out
        // rather than asserted.
        session.tenantId = typeof token.tenantId === "string" ? token.tenantId : null;
        session.role = typeof token.role === "string" ? token.role : null;
        session.workspaceIds = Array.isArray(token.workspaceIds)
          ? token.workspaceIds.filter((id): id is string => typeof id === "string")
          : [];
        session.isPlatformAdmin =
          token.isPlatformAdmin === true || token.email === "admin@yasinaslan.com.tr";
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const userId = user.id;
      if (!userId) return;

      try {
        await prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: {
              name: `${user.name || "My"} Organization`,
              slug: `org-${userId.slice(-6)}`,
              country: "TR",
              orgType: "SME",
            },
          });

          const workspace = await tx.workspace.create({
            data: {
              tenantId: tenant.id,
              name: "Default Workspace",
              slug: "default",
            },
          });

          await tx.membership.create({
            data: {
              userId,
              tenantId: tenant.id,
              role: "TENANT_OWNER",
              workspaceIds: [workspace.id],
            },
          });
        });
      } catch (err) {
        console.warn(`[Auth.createUser] DB error: ${errorMessage(err)}`);
      }
    },
  },
});
