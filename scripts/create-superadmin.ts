import 'dotenv/config';

import { prisma } from '../src/lib/db';
import { errorMessage } from '../src/lib/errors';

async function main() {
  const email = 'admin@yasinaslan.com.tr';
  const name = 'Yasin Aslan';

  console.log(`[Superadmin Seed] Creating/updating superadmin account: ${email}...`);

  try {
    // No membership include: this script never reads them, and the include is
    // what typed `user` as `User & { memberships }` while the transaction below
    // returns a plain `User`.
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            name,
            locale: 'tr',
            isPlatformAdmin: true,
          },
        });

        const tenant = await tx.tenant.create({
          data: {
            name: 'Avrupa Proje Fabrikası HQ',
            slug: 'fabrika-hq',
            country: 'TR',
            orgType: 'CONSULTANCY',
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            tenantId: tenant.id,
            name: 'Ana Yönetim Paneli',
            slug: 'default',
          },
        });

        await tx.membership.create({
          data: {
            userId: newUser.id,
            tenantId: tenant.id,
            role: 'TENANT_OWNER',
            workspaceIds: [workspace.id],
          },
        });

        return newUser;
      });

      // `user` is `User | null` here — the assignment above does not narrow the
      // declared type, and prisma-override.d.ts hid the TS18047. Reading `.id`
      // off null would abort the seed with a TypeError instead of a message
      // that says what went wrong.
      if (!user) throw new Error('Superadmin transaction returned no user row.');

      console.log(`✓ Superadmin user successfully created in database with ID: ${user.id}`);
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isPlatformAdmin: true,
          name,
        },
      });
      console.log(`✓ Existing user updated to Superadmin (isPlatformAdmin = true) with ID: ${user.id}`);
    }
  } catch (err) {
    console.warn(`! DB seed note: Database connection skipped (${errorMessage(err)}). In-memory superadmin auth rules applied.`);
  }
}

main().catch(console.error);
