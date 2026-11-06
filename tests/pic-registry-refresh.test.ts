/**
 * FO-396 step 2. The stored EU register answer, on a real database:
 *   • Ö-A: a lookup that finishes after the tenant changed its PIC does not store its answer;
 *   • Ö-B: removing a PIC clears the stored answer, and a PIC changed on the profile form does not
 *     keep the old FOUND;
 *   • retry: a transient failure queues the next attempt after its wait, the last one raises
 *     `retry_exhausted`, and the job skips a PIC the tenant no longer holds;
 *   • a final answer from a retry triggers the G0 rescore (the no-history grant follows FOUND).
 * The register is never called for real: `checkPicRegistry` is replaced by a stub, and the
 * queue is replaced by a recorder.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  impl: null as null | ((...args: unknown[]) => Promise<unknown>),
  scope: null as Record<string, unknown> | null,
  enqueue: vi.fn(async (..._args: unknown[]) => ({ added: true })),
  rescore: vi.fn(async (..._args: unknown[]) => ({})),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ requireTenantAction: vi.fn(async () => h.scope) }));
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (...args: unknown[]) => h.enqueue(...args) }));
vi.mock('@/lib/scoring/g0-rescore-tenant', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/scoring/g0-rescore-tenant')>();
  return { ...actual, rescoreTenantG0AfterPicChange: (...args: unknown[]) => h.rescore(...args) };
});
vi.mock('@/lib/pic-registry', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/pic-registry')>();
  return {
    ...actual,
    checkPicRegistry: (...args: Parameters<typeof actual.checkPicRegistry>) =>
      h.impl ? h.impl(...args) : actual.checkPicRegistry(...args),
  };
});

import { prisma } from '@/lib/db';
import { updateTenantProfile } from '@/app/[locale]/(app)/[workspace]/settings/profile/actions';
import { refreshTenantPicRegistry } from '@/lib/pic-registry-refresh';
import { picRegistryRetryTask } from '@/lib/jobs/tasks/pic-registry-retry';
import { removeTenantPic } from '@/lib/tenant-pic-removal';
import { deletePicRegistryAlerts } from './helpers/pic-registry-alerts';
import { requireId } from './helpers/teardown-guard';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const newPic = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999));
const key = `fo396s2-${suffix()}`;
const tenantId = `${key}-t`;
const userId = `${key}-u`;
const auditEventId = `${key}-audit`;
const pics: string[] = [];
const picA = newPic();
const picB = newPic();
pics.push(picA, picB);

/** The job runs in the worker; its helpers are only read for logging and the last-attempt alert. */
const helpers = {
  job: { id: '1', attempts: 1, max_attempts: 5 },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
} as unknown as Parameters<typeof picRegistryRetryTask>[1];

const stored = async () =>
  prisma.tenant.findUnique({ where: { id: tenantId }, select: { pic: true, picRegistryStatus: true, picRegistryCheckedAt: true } });

const found = async () => ({ status: 'FOUND', reason: 'found' });
const networkDown = async () => ({ status: 'UNKNOWN', reason: 'network' });

describe('FO-396 step 2: stored register answer', () => {
  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: key, slug: key, country: 'TR', orgType: 'SME', pic: picA, picRegistryStatus: 'FOUND', picRegistryCheckedAt: new Date() },
    });
    await prisma.user.create({ data: { id: userId, email: `${key}@test.local`, name: 'Owner' } });
    await prisma.membership.create({ data: { tenantId, userId, role: 'TENANT_OWNER' } });
    await prisma.subscription.create({ data: { tenantId, planId: 'public-team', status: 'ACTIVE', provider: 'pilot' } });
    h.scope = { tenantId, userId, role: 'TENANT_OWNER' };
  });

  afterEach(async () => {
    h.impl = null;
    h.enqueue.mockClear();
    h.rescore.mockClear();
  });

  afterAll(async () => {
    await deletePicRegistryAlerts(tenantId);
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.membership.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
    await prisma.user.deleteMany({ where: { id: requireId(userId, 'userId') } });
  });

  describe('Ö-A: a lookup that finishes after a PIC change', () => {
    it('does not store the answer for the old PIC, and says so', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: null, picRegistryCheckedAt: null } });
      // The save of picB lands while the lookup of picA is still waiting on the register.
      h.impl = async () => {
        await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picB } });
        return { status: 'FOUND', reason: 'found' };
      };
      const outcome = await refreshTenantPicRegistry(tenantId, picA, {});
      expect(outcome).toMatchObject({ status: 'FOUND', stored: false });
      expect(await stored()).toMatchObject({ pic: picB, picRegistryStatus: null, picRegistryCheckedAt: null });
    });

    it('stores the answer when the PIC is still the one asked about', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: null, picRegistryCheckedAt: null } });
      h.impl = async () => ({ status: 'NOT_FOUND', reason: 'not_registered' });
      const outcome = await refreshTenantPicRegistry(tenantId, picA, {});
      expect(outcome).toMatchObject({ status: 'NOT_FOUND', stored: true });
      expect(await stored()).toMatchObject({ pic: picA, picRegistryStatus: 'NOT_FOUND' });
    });
  });

  describe('Ö-B: a PIC change resets the stored answer', () => {
    it('removing the PIC clears the stored answer (null, not FOUND)', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: 'FOUND', picRegistryCheckedAt: new Date() } });
      await removeTenantPic(tenantId, picA, userId, 'FO-396 test');
      expect(await stored()).toMatchObject({ pic: null, picRegistryStatus: null, picRegistryCheckedAt: null });
    });

    it('a PIC changed on the profile form does not keep the old FOUND', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: 'FOUND', picRegistryCheckedAt: new Date() } });
      const outcome = await updateTenantProfile({ pic: picB });
      expect(outcome).toMatchObject({ ok: true });
      // The save's lookup runs in this test environment, where no address is set: UNKNOWN, never the old FOUND.
      const row = await stored();
      expect(row).toMatchObject({ pic: picB, picRegistryStatus: 'UNKNOWN' });
      expect(row?.picRegistryCheckedAt).not.toBeNull();
    });

    it('when the lookup fails after the save, the old FOUND is not left on the new PIC', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: 'FOUND', picRegistryCheckedAt: new Date() } });
      // The lookup throws (a database error while storing it): the PIC is already saved, and the save reports it.
      h.impl = async () => {
        throw new Error('database unavailable');
      };
      const outcome = await updateTenantProfile({ pic: picB });
      expect(outcome).toMatchObject({ ok: true });
      expect(await stored()).toMatchObject({ pic: picB, picRegistryStatus: null, picRegistryCheckedAt: null });
      const alerts = await prisma.systemAlert.findMany({ where: { source: 'pic-registry', meta: { path: ['tenantId'], equals: tenantId } } });
      expect(alerts.map((a) => (a.meta as Record<string, unknown>).reason)).toContain('refresh_failed');
    });
  });

  describe('retry of a transient failure', () => {
    beforeEach(async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: null, picRegistryCheckedAt: null } });
    });

    it('queues the next attempt after the first wait, keyed by change and attempt', async () => {
      h.impl = networkDown;
      const before = Date.now();
      await refreshTenantPicRegistry(tenantId, picA, {}, { auditEventId, attempt: 0 });
      expect(h.enqueue).toHaveBeenCalledTimes(1);
      const [name, payload, opts] = h.enqueue.mock.calls[0] as [string, Record<string, unknown>, { runAt: Date }];
      expect(name).toBe('pic-registry-retry');
      expect(payload).toEqual({ tenantId, pic: picA, auditEventId, attempt: 1 });
      expect(opts.runAt.getTime() - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
      expect(opts.runAt.getTime() - before).toBeLessThanOrEqual(10 * 60_000 + 60_000);
      expect(await stored()).toMatchObject({ picRegistryStatus: 'UNKNOWN' });
    });

    it('does not queue a retry for a answer that is not transient', async () => {
      h.impl = async () => ({ status: 'UNKNOWN', reason: 'schema_changed' });
      await refreshTenantPicRegistry(tenantId, picA, {}, { auditEventId, attempt: 0 });
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it('after the last retry raises retry_exhausted and queues nothing more', async () => {
      h.impl = networkDown;
      await refreshTenantPicRegistry(tenantId, picA, {}, { auditEventId, attempt: 3 });
      expect(h.enqueue).not.toHaveBeenCalled();
      const alerts = await prisma.systemAlert.findMany({ where: { source: 'pic-registry', meta: { path: ['tenantId'], equals: tenantId } } });
      expect(alerts.map((a) => (a.meta as Record<string, unknown>).reason)).toContain('retry_exhausted');
    });

    it('the job skips a PIC the tenant no longer holds, without a lookup', async () => {
      h.impl = async () => {
        throw new Error('the register must not be asked');
      };
      // The stub throws if asked: a resolved job proves the register was not called.
      await expect(picRegistryRetryTask({ tenantId, pic: picB, auditEventId, attempt: 1 }, helpers)).resolves.toBeUndefined();
      expect(h.rescore).not.toHaveBeenCalled();
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it('the job skips a stored answer that is already final', async () => {
      await prisma.tenant.update({ where: { id: tenantId }, data: { pic: picA, picRegistryStatus: 'FOUND' } });
      h.impl = async () => {
        throw new Error('the register must not be asked');
      };
      await expect(picRegistryRetryTask({ tenantId, pic: picA, auditEventId, attempt: 1 }, helpers)).resolves.toBeUndefined();
      expect(await stored()).toMatchObject({ picRegistryStatus: 'FOUND' });
    });

    it('a retry that finds the PIC registered stores FOUND and rescores the tenant once', async () => {
      h.impl = found;
      await picRegistryRetryTask({ tenantId, pic: picA, auditEventId, attempt: 2 }, helpers);
      expect(await stored()).toMatchObject({ pic: picA, picRegistryStatus: 'FOUND' });
      expect(h.rescore).toHaveBeenCalledTimes(1);
      expect(h.rescore).toHaveBeenCalledWith(tenantId, { trigger: 'tenant_saved', auditEventId });
    });

    it('a retry that still cannot reach the register rescores nothing and queues the next attempt', async () => {
      h.impl = networkDown;
      await picRegistryRetryTask({ tenantId, pic: picA, auditEventId, attempt: 1 }, helpers);
      expect(h.rescore).not.toHaveBeenCalled();
      expect(h.enqueue).toHaveBeenCalledWith('pic-registry-retry', { tenantId, pic: picA, auditEventId, attempt: 2 }, expect.anything());
    });
  });
});
