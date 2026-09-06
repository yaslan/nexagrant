/**
 * Beta workspace seed (E11.1) — the 10 design-partner seats used to exercise the
 * app before real partners are onboarded by `scripts/beta-onboarding.ts`.
 *
 * Idempotent: every write is an upsert on a natural key, so re-running converges
 * instead of duplicating. Safe to call from `pnpm db:seed` or standalone:
 *
 *   pnpm beta:seed-users              # create / converge the 10 seats
 *   pnpm beta:seed-users --rollback   # remove the seats this file owns
 *
 * ADDRESSES — the seats deliberately use the RFC 6761 reserved TLD `.test`, not
 * `.beta`. `.test` can never resolve, and `isPlaceholderEmail()` in
 * src/lib/beta/roster.ts treats it as a placeholder, so the onboarding CLI's
 * `--send` gate refuses to mail these seats. `.beta` is an undelegated but not
 * reserved TLD: the gate would let it through and a live send could be attempted.
 */

import 'dotenv/config'; // tsx does not load .env on its own (standalone runs)
import { prisma } from '../src/lib/db';

const TENANT_ID = 'demo-tenant';
const WORKSPACE_ID = 'demo-workspace';

/**
 * Written as a local union rather than the Prisma `Role` enum: the repo ships
 * src/types/prisma-override.d.ts, which redeclares `Role` as a TS `enum`, so the
 * string literals the client actually stores are not assignable to it.
 */
type SeatRole = 'PIPELINE_MANAGER' | 'WRITER' | 'MEMBER';

interface BetaSeat {
  id: string;
  email: string;
  name: string;
  role: SeatRole;
}

/**
 * 10 design-partner seats. alice drives the pipeline, bob writes, the rest read.
 * Ids are deterministic so a re-run rebinds the same membership rows.
 */
export const BETA_SEATS: BetaSeat[] = [
  { id: 'demo-user-alice', email: 'alice@fabrika.test', name: 'Alice', role: 'PIPELINE_MANAGER' },
  { id: 'demo-user-bob', email: 'bob@fabrika.test', name: 'Bob', role: 'WRITER' },
  { id: 'demo-user-charlie', email: 'charlie@fabrika.test', name: 'Charlie', role: 'MEMBER' },
  { id: 'demo-user-dave', email: 'dave@fabrika.test', name: 'Dave', role: 'MEMBER' },
  { id: 'demo-user-eve', email: 'eve@fabrika.test', name: 'Eve', role: 'MEMBER' },
  { id: 'demo-user-frank', email: 'frank@fabrika.test', name: 'Frank', role: 'MEMBER' },
  { id: 'demo-user-grace', email: 'grace@fabrika.test', name: 'Grace', role: 'MEMBER' },
  { id: 'demo-user-heidi', email: 'heidi@fabrika.test', name: 'Heidi', role: 'MEMBER' },
  { id: 'demo-user-ivan', email: 'ivan@fabrika.test', name: 'Ivan', role: 'MEMBER' },
  { id: 'demo-user-judy', email: 'judy@fabrika.test', name: 'Judy', role: 'MEMBER' },
];

/**
 * The demo superadmin. Without a membership the auth callback falls back to a
 * hard-coded tenant id that no row matches, so every tenant-scoped page renders
 * empty for the quick-demo login. Seeding the seat binds it to the demo tenant.
 */
export const DEMO_ADMIN_SEAT = {
  id: 'demo-user-superadmin',
  email: 'admin@yasinaslan.com.tr',
  name: 'Yasin Aslan (Süperadmin)',
  role: 'TENANT_OWNER' as SeatRole,
};

export default async function seedTenantWorkspace() {
  // 1. Tenant
  const tenant = {
    name: 'Fabrika Beta',
    slug: 'fabrika-beta',
    country: 'TR',
    orgType: 'SME' as const,
    locale: 'tr',
    timezone: 'Europe/Istanbul',
  };
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: tenant,
    create: { id: TENANT_ID, ...tenant },
  });

  // 2. Workspace
  await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: { name: 'Ana Çalışma Alanı' },
    create: { id: WORKSPACE_ID, tenantId: TENANT_ID, name: 'Ana Çalışma Alanı', slug: 'main' },
  });

  // 3. The 10 beta seats.
  for (const seat of BETA_SEATS) {
    // Upsert on email (the unique key a human types); bind the membership to the
    // id the database actually holds — a seat created by another seeder keeps its
    // own id, and using `seat.id` blindly would create an orphan membership.
    const user = await prisma.user.upsert({
      where: { email: seat.email },
      update: { name: seat.name, locale: 'tr' },
      create: { id: seat.id, email: seat.email, name: seat.name, locale: 'tr' },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: TENANT_ID, userId: user.id } },
      update: { role: seat.role },
      create: { tenantId: TENANT_ID, userId: user.id, role: seat.role },
    });
  }

  // 4. Demo superadmin seat — same upsert shape, plus the platform-admin flag.
  const adminUser = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_SEAT.email },
    update: { name: DEMO_ADMIN_SEAT.name, locale: 'tr', isPlatformAdmin: true },
    create: {
      id: DEMO_ADMIN_SEAT.id,
      email: DEMO_ADMIN_SEAT.email,
      name: DEMO_ADMIN_SEAT.name,
      locale: 'tr',
      isPlatformAdmin: true,
    },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: TENANT_ID, userId: adminUser.id } },
    update: { role: DEMO_ADMIN_SEAT.role },
    create: { tenantId: TENANT_ID, userId: adminUser.id, role: DEMO_ADMIN_SEAT.role },
  });

  // 5. Subscription (Team plan, ACTIVE)
  await prisma.subscription.upsert({
    where: { tenantId: TENANT_ID },
    update: { planId: 'team', status: 'ACTIVE' },
    create: { tenantId: TENANT_ID, planId: 'team', status: 'ACTIVE', billingInterval: 'month' },
  });

  console.log(
    `Tenant and users seeded (Fabrika Beta, ${BETA_SEATS.length} seats + superadmin).`
  );
}

/**
 * Undo — deletes exactly the seats this file owns. Memberships cascade from User.
 * The tenant, workspace and subscription are left in place: other seeders and the
 * demo data hang off them.
 */
export async function rollbackTenantWorkspace() {
  const { count } = await prisma.user.deleteMany({
    where: { email: { in: [...BETA_SEATS.map((s) => s.email), DEMO_ADMIN_SEAT.email] } },
  });
  console.log(`Rolled back ${count} beta seat(s).`);
}

if (require.main === module) {
  const undo = process.argv.includes('--rollback');
  (undo ? rollbackTenantWorkspace() : seedTenantWorkspace())
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
