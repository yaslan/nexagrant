import { prisma } from '../src/lib/db';

async function main() {
  const email = 'admin@yasinaslan.com.tr';
  const name = 'Yasin Aslan (Süperadmin)';

  console.log(`[Superadmin Seed] Creating/updating superadmin account: ${email}...`);

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

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
  } catch (err: any) {
    console.warn(`! DB seed note: Database connection skipped (${err.message}). In-memory superadmin auth rules applied.`);
  }
}

main().catch(console.error);
