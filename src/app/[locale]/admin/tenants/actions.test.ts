/**
 * TASK-MVCH26OXNVLKR — what a failed tenant-console action hands the browser:
 * exactly `{ ok: false, code }` with `code` from TENANT_FAILURE_CODES, and every
 * code has a sentence in both languages. The source guard
 * (tests/api/action-leak-scan.ts) trusts `tenantFailureCode` by import, so this
 * file is what holds its output to the listed codes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import tr from '../../../../../messages/tr.json';
import en from '../../../../../messages/en.json';

const h = vi.hoisted(() => ({ thrown: null as unknown, admin: vi.fn(), assign: vi.fn(), removePic: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/tenant', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tenant')>()),
  requirePlatformAdmin: h.admin,
}));
vi.mock('@/lib/billing/internal-plan', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/billing/internal-plan')>()),
  assignInternalPlan: h.assign,
}));
vi.mock('@/lib/tenant-pic-removal', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tenant-pic-removal')>()),
  removeTenantPic: h.removePic,
}));

import { logger } from '@/lib/logger';
import { LiveProviderSubscriptionError } from '@/lib/billing/plan-repository';
import { InternalPlanNoteRequiredError } from '@/lib/billing/internal-plan';
import { PlatformAdminRequiredError } from '@/lib/tenant';
import { TenantPicChangedError } from '@/lib/tenant-pic-removal';
import { assignInternalPlanAction, removeTenantPicAction } from './actions';
import { TENANT_FAILURE_CODES } from './failure-codes';

const call = (over: Partial<{ tenantId: string; planId: string; note: string }> = {}) =>
  assignInternalPlanAction({ tenantId: 't-1', planId: 'pro', note: 'why', ...over });

beforeEach(() => {
  vi.restoreAllMocks();
  h.admin.mockReset().mockResolvedValue({ userId: 'admin-1' });
  h.assign.mockReset().mockImplementation(async () => {
    throw h.thrown;
  });
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
});

describe('assignInternalPlanAction', () => {
  it('passes the validated input and the admin id through', async () => {
    h.assign.mockResolvedValue({ outcome: 'assigned', before: 'free', after: 'pro' });
    expect(await call({ note: '  a note  ' })).toStrictEqual({
      ok: true,
      data: { outcome: 'assigned', before: 'free', after: 'pro' },
    });
    expect(h.assign).toHaveBeenCalledWith('t-1', 'pro', 'admin-1', 'a note');
  });

  it('an empty note is NOTE_REQUIRED and a plan off the list is INVALID_INPUT, before the write', async () => {
    expect(await call({ note: '   ' })).toStrictEqual({ ok: false, code: 'NOTE_REQUIRED' });
    expect(await call({ planId: 'public-team' })).toStrictEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await call({ tenantId: '' })).toStrictEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(h.assign).not.toHaveBeenCalled();
  });

  it('a non-admin gets PLATFORM_ADMIN_REQUIRED and nothing is written', async () => {
    h.admin.mockRejectedValue(new PlatformAdminRequiredError());
    expect(await call()).toStrictEqual({ ok: false, code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(h.assign).not.toHaveBeenCalled();
  });

  it('each domain refusal answers its own listed code, without its message', async () => {
    for (const e of [new LiveProviderSubscriptionError('t-secret', 'stripe'), new InternalPlanNoteRequiredError()]) {
      h.thrown = e;
      expect(await call(), e.name).toStrictEqual({ ok: false, code: e.code });
      expect(TENANT_FAILURE_CODES).toContain(e.code);
    }
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('a database error or a foreign code is UNKNOWN; the text goes to the log', async () => {
    const e = Object.assign(new Error('Unique constraint failed on (`secret_col`)'), { code: 'P2002' });
    for (const thrown of [e, 'boom', { code: 'ECONNREFUSED' }, null]) {
      h.thrown = thrown;
      const res = await call();
      expect(res).toStrictEqual({ ok: false, code: 'UNKNOWN' });
      expect(JSON.stringify(res)).not.toMatch(/P2002|secret_col/);
    }
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[admin/tenants]'), e);
  });
});

describe('removeTenantPicAction (FO-383)', () => {
  const remove = (over: Partial<{ tenantId: string; pic: string; note: string }> = {}) =>
    removeTenantPicAction({ tenantId: 't-1', pic: '987654321', note: 'owner disputed', ...over });

  beforeEach(() => {
    h.removePic.mockReset().mockResolvedValue(undefined);
  });

  it('passes the validated input and the admin id through', async () => {
    expect(await remove({ note: '  owner disputed  ' })).toStrictEqual({ ok: true, data: null });
    expect(h.removePic).toHaveBeenCalledWith('t-1', '987654321', 'admin-1', 'owner disputed');
  });

  it('a non-admin gets PLATFORM_ADMIN_REQUIRED and nothing is written', async () => {
    h.admin.mockRejectedValue(new PlatformAdminRequiredError());
    expect(await remove()).toStrictEqual({ ok: false, code: 'PLATFORM_ADMIN_REQUIRED' });
    expect(h.removePic).not.toHaveBeenCalled();
  });

  it('a non-admin learns nothing about the input: the gate comes before validation', async () => {
    h.admin.mockRejectedValue(new PlatformAdminRequiredError());
    expect(await remove({ note: '' })).toStrictEqual({ ok: false, code: 'PLATFORM_ADMIN_REQUIRED' });
  });

  it('an empty note is NOTE_REQUIRED and a bad id or PIC is INVALID_INPUT, before the write', async () => {
    expect(await remove({ note: '   ' })).toStrictEqual({ ok: false, code: 'NOTE_REQUIRED' });
    expect(await remove({ note: 'x'.repeat(501) })).toStrictEqual({ ok: false, code: 'NOTE_REQUIRED' });
    expect(await remove({ tenantId: '' })).toStrictEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await remove({ tenantId: 'x'.repeat(65) })).toStrictEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await remove({ pic: '' })).toStrictEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(h.removePic).not.toHaveBeenCalled();
  });

  it('a stored value older than the nine-digit rule can still be removed', async () => {
    expect(await remove({ pic: 'LEGACY-1' })).toStrictEqual({ ok: true, data: null });
    expect(h.removePic).toHaveBeenCalledWith('t-1', 'LEGACY-1', 'admin-1', 'owner disputed');
  });

  it('a PIC that changed meanwhile answers PIC_CHANGED; a database error stays UNKNOWN', async () => {
    h.removePic.mockRejectedValueOnce(new TenantPicChangedError());
    expect(await remove()).toStrictEqual({ ok: false, code: 'PIC_CHANGED' });
    h.removePic.mockRejectedValueOnce(Object.assign(new Error('secret_col'), { code: 'P2002' }));
    expect(await remove()).toStrictEqual({ ok: false, code: 'UNKNOWN' });
  });
});

describe('tenant console failure codes — translations', () => {
  const errors = (m: unknown) => (m as { adminTenants: { errors: Record<string, string> } }).adminTenants.errors;

  it.each([
    ['tr', tr],
    ['en', en],
  ])('%s: every code has a sentence, and no sentence takes a detail', (_, messages) => {
    for (const code of TENANT_FAILURE_CODES) {
      expect(errors(messages)[code], code).toEqual(expect.any(String));
      expect(errors(messages)[code], code).not.toMatch(/\{/);
    }
  });
});
