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
import { acknowledgementMatchesCurrent } from './legal/consent-documents';
import { readRegistrationAcknowledgement } from './legal/registration-ack-cookie';
import { recordAlert } from './observability/system-alert';
import {
  bindTransactionToTenant,
  writeRegistrationConsent,
} from './legal/registration-consent';
import { InviteCodeRejectedError, noteInviteRejection, redeemInviteCode } from './agency/codes';
import { InvalidInviteCodeSignin } from './agency/invite-signin-error';

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
  // The rule this seat has to satisfy is unchanged: a demo address printed on
  // the public login page must never look like a real mailbox at a company we
  // do not control. It was parked on the domain RFC 2606 reserves for
  // documentation while the brand domain was in flux (TASK-MTV5ESBVAHUEV);
  // usfinbridge.com is our own domain, so a seat on it names nobody else's
  // mailbox and reads as ours rather than as a placeholder (owner's decision,
  // 2026-09-10, TASK-MTV69TO4K8NVZ). If this ever has to move off a domain the
  // company owns, move it back to that reserved domain — never invent a
  // plausible third-party one.
  "demo@usfinbridge.com": {
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
  // No fallback: a literal here was a signing key anyone with the repository
  // could use to mint a session for any user, and it silenced Auth.js's own
  // MissingSecret check. Startup refuses to run without it (src/instrumentation.ts).
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  basePath: "/api/auth",
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
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
        // The versions of the privacy notice and terms that were on screen when
        // the box was ticked — not a bare "true". A stale tab that showed an
        // older notice sends an older stamp and is refused, because accepting
        // it would record agreement to a text the person never read.
        // See src/lib/legal/consent-documents.ts.
        acknowledgement: { label: "Acknowledgement", type: "text" },
        // FB KAMU B1 (TASK-MULRQJQYM0NAM): an agency invite code from
        // /kayit?kod=…. Only the registration branch reads it; signing in to an
        // existing account ignores it (linking an existing tenant is not B1).
        inviteCode: { label: "Invite code", type: "text" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.trim()?.toLowerCase();
        if (!email) return null;

        const acknowledgement = credentials?.acknowledgement;
        const inviteCode =
          typeof credentials?.inviteCode === "string" && credentials.inviteCode.trim()
            ? credentials.inviteCode
            : null;

        const demoProfile = DEMO_PROFILES[email];
        // Derived from the address the user typed, never from a profile table.
        // `email` is non-empty (checked above) and `String.split` always yields at
        // least one element, so the local part is never undefined; `?? email` is the
        // type checker's fallback, not a behaviour change.
        const computedName = (email.split("@")[0] ?? email)
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
            // TASK-MTSWLANXSU0IG (A3) — this branch is the registration. Signing
            // in with an address nobody has used before does not authenticate
            // anyone; it CREATES an account, a tenant and an owner membership.
            // Until now it did that without ever telling the person what would
            // be done with their data, and without leaving a trace that it had.
            //
            // The check sits here, before the transaction, because refusing is
            // only meaningful while there is still nothing to undo. An existing
            // user signing in is untouched: they acknowledged the notice when
            // they registered, and demanding it again on every sign-in would
            // teach people to tick past it.
            if (!acknowledgementMatchesCurrent(acknowledgement)) {
              console.warn(
                '[Auth.authorize] registration refused: privacy notice and terms were not acknowledged, or the version acknowledged is no longer current'
              );
              return null;
            }

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

              // FB KAMU B1 — the code is used in THIS transaction, so a
              // registration that fails later gives the use back. Every kind
              // of unusable code comes back as null and ends the registration
              // the same way: no account, one uniform message.
              let agencyId: string | null = null;
              if (inviteCode) {
                agencyId = await redeemInviteCode(tx, inviteCode);
                if (!agencyId) throw new InviteCodeRejectedError();
              }

              const tenant = await tx.tenant.create({
                data: {
                  name: demoProfile?.orgName || `${computedName} Kuruluşu`,
                  slug: `org-${newUser.id.slice(-6)}`,
                  country: "TR",
                  orgType: demoProfile?.orgType || "SME",
                  // No plan is written: a tenant without a subscription is on
                  // Discover (FALLBACK_PLAN_ID), which is what a code grants.
                  agencyId,
                },
              });

              // Everything below this line writes a tenant-scoped table, so the
              // transaction has to carry a tenant from here on. See
              // bindTransactionToTenant for why registration cannot use
              // `withTenant` and what was silently relying on a superuser
              // connection before this call existed.
              await bindTransactionToTenant(tx, tenant.id);

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

              // In the SAME transaction as the account it is about. If this
              // write fails, the user, tenant, workspace and membership all
              // roll back with it — an account whose disclosure cannot be
              // proven is exactly the state this card exists to remove, so it
              // must not be reachable by a partial failure either.
              await writeRegistrationConsent(tx, {
                tenantId: tenant.id,
                userId: newUser.id,
                locale: "tr",
              });

              if (agencyId) {
                await tx.auditEvent.create({
                  data: {
                    tenantId: tenant.id,
                    actorId: newUser.id,
                    type: "agency.invite.redeemed",
                    data: { agencyId },
                  },
                });
              }

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
          // FB KAMU B1 — the transaction has rolled back (no user, no tenant,
          // no use of the code). Count the refusal on its own connection, then
          // refuse with the one message every unusable code gets. This must
          // come before the demo fallback below, which would otherwise sign
          // the person in as a demo user.
          if (error instanceof InviteCodeRejectedError) {
            await noteInviteRejection(prisma, inviteCode).catch((e) =>
              console.warn(`[Auth.authorize] could not record a refused invite code: ${errorMessage(e)}`)
            );
            throw new InvalidInviteCodeSignin();
          }
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
            // Narrowed off the element itself rather than off `.length`: an absent
            // first membership must leave the token tenantless, which is the same
            // safe outcome the catch below documents.
            const activeMembership = dbUser.memberships[0];
            if (activeMembership) {
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

      // TASK-MTSWLANXSU0IG (A3) — the OAuth half of registration. Read before
      // the transaction opens: `cookies()` wants the request context, and
      // holding a transaction open across it buys nothing.
      const acknowledged = await readRegistrationAcknowledgement();

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

          // As in `authorize` above: tenant-scoped writes need the tenant bound
          // to the transaction, or RLS refuses them off a superuser connection.
          await bindTransactionToTenant(tx, tenant.id);

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

          // Only when the acknowledgement really travelled with this sign-up.
          // Writing the row unconditionally would be the worst outcome
          // available here: a record asserting that someone was shown a notice
          // when nothing knows whether they were. A missing record is a known
          // gap; a fabricated one is a false answer to an audit.
          if (acknowledged) {
            await writeRegistrationConsent(tx, {
              tenantId: tenant.id,
              userId,
              // The OAuth round trip does not carry the locale the person was
              // reading in, and guessing it from an e-mail domain would be a
              // guess recorded as a fact. `tr` is the app's default locale
              // (src/i18n/routing.ts) and is what the registration page serves
              // unless a locale prefix says otherwise.
              locale: "tr",
            });
          }
        });
      } catch (err) {
        console.warn(`[Auth.createUser] DB error: ${errorMessage(err)}`);
      }

      // Outside the transaction: an account that exists without a disclosure
      // record is a compliance defect, not a reason to undo the registration.
      // The alert is what makes it visible — silence here is what let the gap
      // live unmeasured until this card.
      if (!acknowledged) {
        await recordAlert({
          level: 'warn',
          source: 'auth-registration-consent',
          message: 'Account created without a disclosure acknowledgement record',
          meta: { userId, path: 'oauth-createUser' },
          // A new `userId` every registration meant one alert per affected
          // account and a console that grew with signup volume. The
          // registration path is the problem an operator fixes, so it is the
          // key. Folding costs nothing recoverable: the affected accounts are
          // exactly the `User` rows with no matching `Consent` row, which is a
          // query, not something the alert trail has to carry.
          dedupeKey: 'auth-registration-consent:oauth-createUser',
        });
      }
    },
  },
});
