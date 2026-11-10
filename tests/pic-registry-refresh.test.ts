import { beforeEach, describe, expect, it, vi } from 'vitest';

// FO-396 B1: the register answer is written only if the tenant still holds the PIC that was asked
// about. The database is mocked here, so this checks the write shape and the count-0 path; the
// race itself is covered by the isolated-DB suite.
const tenantMock = vi.hoisted(() => ({
  update: vi.fn(async () => ({})),
  updateMany: vi.fn(async () => ({ count: 1 })),
}));
const checkMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/db', () => ({ prisma: { tenant: tenantMock } }));
vi.mock('@/lib/pic-registry', () => ({ checkPicRegistry: checkMock }));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: alertMock }));

import { refreshTenantPicRegistry } from '@/lib/pic-registry-refresh';

describe('FO-396 refreshTenantPicRegistry (B1 conditional write)', () => {
  beforeEach(() => {
    tenantMock.update.mockClear();
    tenantMock.updateMany.mockReset();
    tenantMock.updateMany.mockResolvedValue({ count: 1 });
    checkMock.mockReset();
    checkMock.mockResolvedValue({ status: 'FOUND', reason: 'found' });
    alertMock.mockClear();
  });

  it('writes only where the tenant still holds the asked PIC', async () => {
    const r = await refreshTenantPicRegistry('t1', '999999999');
    expect(tenantMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1', pic: '999999999' } }),
    );
    expect(r).toMatchObject({ status: 'FOUND', stored: true });
  });

  it('stores nothing and reports stored:false when the PIC changed during the lookup', async () => {
    tenantMock.updateMany.mockResolvedValue({ count: 0 });
    const r = await refreshTenantPicRegistry('t1', '999999999');
    expect(r).toMatchObject({ status: 'FOUND', stored: false });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('refuses a missing tenant id before any write (it would match every tenant)', async () => {
    await expect(refreshTenantPicRegistry('', '999999999')).rejects.toThrow();
    expect(tenantMock.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a missing PIC before any write', async () => {
    await expect(refreshTenantPicRegistry('t1', '')).rejects.toThrow();
    expect(tenantMock.updateMany).not.toHaveBeenCalled();
  });

  it('NG-85 F6: clears the stored answer only while the tenant still has no PIC (a PIC set meanwhile keeps its answer)', async () => {
    const r = await refreshTenantPicRegistry('t1', null);
    expect(r).toBeNull();
    expect(tenantMock.updateMany).toHaveBeenCalledTimes(1);
    expect(tenantMock.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', pic: null },
      data: { picRegistryStatus: null, picRegistryCheckedAt: null },
    });
    expect(tenantMock.update).not.toHaveBeenCalled();
  });

  it('NG-85 F1: the schema_changed alert carries no tenant id (SystemAlert has no tenantId and no RLS)', async () => {
    checkMock.mockResolvedValue({ status: 'UNKNOWN', reason: 'schema_changed' });
    await refreshTenantPicRegistry('t1', '999999999');
    expect(alertMock).toHaveBeenCalledTimes(1);
    const alert = (alertMock.mock.calls[0] as unknown[])[0] as { meta?: Record<string, unknown>; message: string };
    expect(alert.meta).toEqual({ reason: 'schema_changed' });
    expect(JSON.stringify(alert)).not.toContain('t1');
  });
});
