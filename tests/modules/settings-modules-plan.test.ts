import { suiteHasDatabase } from '../helpers/database-availability';
/**
 * TASK-MUMH6W5I1W9WC — the modules settings page and its action read plan and
 * module state from real entitlements, against the real database with only the
 * session faked. Three tenants:
 *
 *   - no subscription → Discover (free), nothing active, Pro modules refused;
 *   - free pilot      → Belediye Ekip + pilot end date, Pro grant;
 *   - paying Pro      → Pro, as before.
 *
 * Before the fix the first tenant was shown `pro` with M1–M5/M8 active, and the
 * action wrote `ON` for M1 under the same `'pro'` fallback.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prisma, withTenant } from '@/lib/db';
import { grantPilot } from '@/lib/billing/pilot';
import { upsertPublicSectorPlans } from '@/lib/billing/public-sector-plans';
import { canEnableEntitled } from '@/lib/modules/state-machine';
import { readModulesPlanView } from '@/app/[locale]/(app)/[workspace]/settings/modules/plan-view';
import { toggleModuleState } from '@/app/[locale]/(app)/[workspace]/settings/modules/actions';
import { requireId } from '../helpers/teardown-guard';
import { PUBLIC_SECTOR_PLANS_LOCK, withTestDbLock } from '../helpers/test-db-lock';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DAY = 86_400_000;

const view = (tenantId: string) => withTenant(tenantId, (tx) => readModulesPlanView(tenantId, tx, 'tr'));
const moduleRow = (tenantId: string, moduleId: string) =>
  prisma.moduleState.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId } } });

const HAS_DB = await suiteHasDatabase('modules/settings-modules-plan');

describe('canEnableEntitled', () => {
  it('refuses a module outside the entitlement list and checks dependencies inside it', () => {
    expect(canEnableEntitled('M1', [], ['M3', 'M5'])).toMatchObject({ allowed: false, reason: 'Plan upgrade required.' });
    expect(canEnableEntitled('M3', [], ['M3', 'M5']).allowed).toBe(true);
    expect(canEnableEntitled('M4', [], ['M1', 'M4'])).toMatchObject({ allowed: false, missingDependencies: ['M1'] });
    expect(canEnableEntitled('M4', ['M1'], ['M1', 'M4']).allowed).toBe(true);
  });
});

describe.skipIf(!HAS_DB)('modules settings — plan and state from entitlements', () => {
  let tenantId: string;

  beforeAll(async () => {
    await withTestDbLock(process.env.DATABASE_URL!, PUBLIC_SECTOR_PLANS_LOCK, () => upsertPublicSectorPlans(prisma));
  });

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'Modules Plan Test', slug: `modules-plan-${suffix()}`, country: 'TR', orgType: 'MUNICIPALITY' },
    });
    tenantId = tenant.id;
    session.current = { user: { id: 'modules-plan-user' }, tenantId, role: 'TENANT_OWNER' };
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.moduleState.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  });

  it('no subscription: Discover, nothing active, Pro module refused and not written', async () => {
    const v = await view(tenantId);
    expect(v).toMatchObject({ planId: 'free', planName: 'Discover', badgeTier: null, pilot: null, activeModules: [] });
    expect([...v.entitledModules].sort()).toEqual(['M1', 'M5']);

    await expect(toggleModuleState('M3', 'ON')).rejects.toThrow(/Plan upgrade required/);
    expect(await moduleRow(tenantId, 'M3')).toBeNull();

    await expect(toggleModuleState('M1', 'ON')).resolves.toEqual({ success: true });
    expect((await view(tenantId)).activeModules).toEqual(['M1']);
  });

  it('a row switched on outside the plan is not shown active and does not satisfy a dependency', async () => {
    await prisma.moduleState.create({ data: { tenantId, moduleId: 'M3', status: 'ON' } });
    const v = await view(tenantId);
    expect(v.activeModules).toEqual([]);
    expect(v.switchedOnOutsidePlan).toEqual(['M3']);

    // The page offers "Kapat" for it; the action switches it off.
    await expect(toggleModuleState('M3', 'OFF')).resolves.toEqual({ success: true });
    expect((await moduleRow(tenantId, 'M3'))?.status).toBe('OFF');
    expect((await view(tenantId)).switchedOnOutsidePlan).toEqual([]);
  });

  it('running pilot: Belediye Ekip with its last day, Pro grant, M1 can be switched on', async () => {
    await grantPilot(tenantId, 'admin-1');
    const v = await view(tenantId);
    expect(v).toMatchObject({ planId: 'public-team', planName: 'Belediye Ekip', badgeTier: 'pro' });
    expect(v.pilot).toMatchObject({ expired: false });
    expect(v.pilot?.lastDay).toMatch(/\d{4}$/);
    expect(v.entitledModules).toEqual(expect.arrayContaining(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8']));

    await expect(toggleModuleState('M1', 'ON')).resolves.toEqual({ success: true });
    expect((await moduleRow(tenantId, 'M1'))?.status).toBe('ON');
    await expect(toggleModuleState('M11', 'ON')).rejects.toThrow(/Plan upgrade required/);
  });

  it('expired pilot: shown as ended, and the action refuses to write', async () => {
    await grantPilot(tenantId, 'admin-1', { now: new Date(Date.now() - 91 * DAY) });
    expect((await view(tenantId)).pilot).toMatchObject({ expired: true });
    await expect(toggleModuleState('M1', 'ON')).rejects.toThrow();
    expect(await moduleRow(tenantId, 'M1')).toBeNull();
  });

  it('paying Pro: Pro plan, no pilot', async () => {
    await prisma.subscription.create({
      data: { tenantId, planId: 'pro', status: 'ACTIVE', provider: 'stripe', providerSubId: `sub_${suffix()}` },
    });
    const v = await view(tenantId);
    expect(v).toMatchObject({ planId: 'pro', planName: 'Pro', badgeTier: 'pro', pilot: null });
    await expect(toggleModuleState('M1', 'ON')).resolves.toEqual({ success: true });
  });
});
