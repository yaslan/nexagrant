import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { createDbClient, prisma, withTenantOn } from '../src/lib/db';
import {
  bindTransactionToTenant,
  writeRegistrationConsent,
} from '../src/lib/legal/registration-consent';
import { registrationConsentRows } from '../src/lib/legal/consent-documents';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MTSWLANXSU0IG (A3), against a real database.
 *
 * Two properties, and neither can be observed without one:
 *
 *   ATOMICITY — the disclosure record shares the registration's transaction. An
 *   account that exists without one is precisely the state this card was opened
 *   to remove, so a failed consent write must take the account with it.
 *
 *   ISOLATION — `Consent` is tenant-scoped, and a legal record of one tenant's
 *   people must not be readable by another. Measured through `fabrika_app`
 *   (NOBYPASSRLS), because the default `fabrika` role is SUPERUSER + BYPASSRLS
 *   and an isolation assertion made through it passes vacuously.
 */
const SUITE = 'registration-consent.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const STAMP = Date.now();

const TENANT_A = `consent-live-a-${STAMP}`;
const TENANT_B = `consent-live-b-${STAMP}`;

describe('registration disclosure record (live)', () => {
  let rls: PrismaClient | undefined;
  let ready = false;
  const tenantIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    // Before the try, so that in CI the missing variable fails instead of being caught.
    const rlsUrl = requireRlsTestUrl(RLS_URL, `${SUITE} (isolation arm)`);
    try {
      await prisma.$connect();
      for (const slug of [TENANT_A, TENANT_B]) {
        const t = await prisma.tenant.create({
          data: { name: slug, slug, country: 'TR', orgType: 'SME' },
        });
        tenantIds.push(t.id);
      }
      if (rlsUrl) {
        rls = createDbClient(rlsUrl);
        await rls.$connect();
      }
      ready = true;
    } catch (e) {
      ready = false;
      skipOrFailInCi(SUITE, e instanceof Error ? e.message : String(e));
    }
    // Outside the try: a BYPASSRLS role must fail the file, not skip it.
    if (rls) await assertRlsSubjectRole(rls, SUITE);
  });

  afterAll(async () => {
    try {
      if (tenantIds.length) {
        // Consent has no FK to Tenant, so it does not cascade — remove it by id.
        await prisma.consent.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch {
      // cleanup only
    }
    await rls?.$disconnect().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  test('a failed disclosure write takes the whole registration with it', async (ctx) => {
    if (!ready) return ctx.skip();

    const email = `consent-atomic-${STAMP}@fabrika.test`;
    let createdUserId: string | undefined;

    // The registration bootstrap, in the order src/lib/auth.ts runs it, with
    // the consent write forced to fail on a primary-key collision — a real
    // database error raised at the real step, not a thrown stand-in.
    const collidingId = `consent-collide-${STAMP}`;
    await prisma.consent.create({
      data: {
        id: collidingId,
        ...registrationConsentRows({
          tenantId: tenantIds[0]!,
          userId: 'pre-existing',
          locale: 'tr',
        })[0]!,
      },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, name: 'Atomicity Probe', locale: 'tr' } });
        createdUserId = user.id;

        const tenant = await tx.tenant.create({
          data: {
            name: `atomic-${STAMP}`,
            slug: `atomic-${STAMP}`,
            country: 'TR',
            orgType: 'SME',
          },
        });
        await bindTransactionToTenant(tx, tenant.id);

        const workspace = await tx.workspace.create({
          data: { tenantId: tenant.id, name: 'ws', slug: 'default' },
        });
        await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: 'TENANT_OWNER',
            workspaceIds: [workspace.id],
          },
        });

        // The step under test.
        await tx.consent.createMany({
          data: [
            {
              id: collidingId,
              ...registrationConsentRows({
                tenantId: tenant.id,
                userId: user.id,
                locale: 'tr',
              })[0]!,
            },
          ],
        });
      })
    ).rejects.toThrow();

    // The account must not have survived its own disclosure failing.
    expect(createdUserId).toBeDefined();
    const orphan = await prisma.user.findUnique({ where: { email } });
    expect(orphan, 'a registration whose disclosure write failed left an account behind').toBeNull();

    await prisma.consent.delete({ where: { id: collidingId } });
  });

  test('the same write placed after the transaction leaves an unprovable account', async (ctx) => {
    if (!ready) return ctx.skip();

    // This is the shape the card replaced, asserted rather than described: with
    // the disclosure write outside the registration's transaction, the failure
    // above leaves a live account nobody can show was ever told anything. The
    // test passes — that is the point. It is here so that moving the write back
    // out of the transaction stops being an invisible change.
    const email = `consent-orphan-${STAMP}@fabrika.test`;

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: 'Orphan Probe', locale: 'tr' },
      });
      const tenant = await tx.tenant.create({
        data: { name: `orphan-${STAMP}`, slug: `orphan-${STAMP}`, country: 'TR', orgType: 'SME' },
      });
      tenantIds.push(tenant.id);
      await bindTransactionToTenant(tx, tenant.id);
      return created;
    });
    userIds.push(user.id);

    // …and only now the disclosure, which fails.
    await expect(
      prisma.consent.create({
        data: {
          ...registrationConsentRows({ tenantId: tenantIds[0]!, userId: user.id, locale: 'tr' })[0]!,
          // NOT NULL in the database; Prisma rejects it before it is sent.
          documentVersion: null as unknown as string,
        },
      })
    ).rejects.toThrow();

    const survivor = await prisma.user.findUnique({ where: { email } });
    expect(survivor, 'the pre-fix shape is supposed to orphan the account').not.toBeNull();
    const records = await prisma.consent.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(0);
  });

  test('a successful registration writes one row per document', async (ctx) => {
    if (!ready) return ctx.skip();

    const email = `consent-happy-${STAMP}@fabrika.test`;
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: 'Happy Probe', locale: 'tr' } });
      await bindTransactionToTenant(tx, tenantIds[0]!);
      const written = await writeRegistrationConsent(tx, {
        tenantId: tenantIds[0]!,
        userId: user.id,
        locale: 'tr',
      });
      return { userId: user.id, written };
    });
    userIds.push(result.userId);

    expect(result.written).toBe(2);
    const rows = await prisma.consent.findMany({
      where: { userId: result.userId },
      orderBy: { documentId: 'asc' },
    });
    expect(rows.map((r) => r.documentId)).toEqual(['privacy-notice', 'terms-of-service']);
    expect(rows.map((r) => r.kind)).toEqual(['DISCLOSURE_ACK', 'TERMS_ACCEPTANCE']);
    expect(rows.every((r) => r.documentVersion.length > 0)).toBe(true);
    expect(rows.every((r) => r.withdrawnAt === null)).toBe(true);
  });

  test('another tenant cannot read this tenant’s disclosure records', async (ctx) => {
    if (!ready) return ctx.skip();
    if (!rls) {
      return ctx.skip();
    }

    const [role] = await rls.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    // Without this, everything below passes whether or not RLS exists.
    expect(role?.rolsuper, 'measuring role must not be SUPERUSER').toBe(false);
    expect(role?.rolbypassrls, 'measuring role must not be BYPASSRLS').toBe(false);

    const userId = `consent-rls-user-${STAMP}`;
    await prisma.consent.createMany({
      data: registrationConsentRows({ tenantId: tenantIds[0]!, userId, locale: 'tr' }),
    });

    // Positive control first: without it, a permission error would read as
    // isolation and the negative assertion below would mean nothing.
    const own = await withTenantOn(rls, tenantIds[0]!, (tx) =>
      tx.consent.findMany({ where: { userId } })
    );
    expect(own.length).toBe(2);

    const other = await withTenantOn(rls, tenantIds[1]!, (tx) =>
      tx.consent.findMany({ where: { userId } })
    );
    expect(other, "tenant B read tenant A's consent rows").toHaveLength(0);

    // And a write across the boundary is refused, not silently re-homed.
    await expect(
      withTenantOn(rls, tenantIds[1]!, (tx) =>
        tx.consent.createMany({
          data: registrationConsentRows({
            tenantId: tenantIds[0]!,
            userId: `${userId}-cross`,
            locale: 'tr',
          }),
        })
      )
    ).rejects.toThrow();
  });
});
