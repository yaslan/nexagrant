// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * TASK-MV15MNI79MSWO (CE-693) — a TTO action called after the session had
 * expired was refused by the module gate first: `checkModuleAccess` answered
 * `NO_TENANT`, `assertModuleAccess` threw `ModuleAccessError`, and the form
 * said the module was switched off or outside the plan. No session is now the
 * same `TenantScopeError` that `requireTenantAction` throws, with a digest, and
 * the hook says `Common.sessionExpired`. A module that is really off still says
 * `Common.moduleUnavailable`.
 *
 * TASK-MVNI0HJ9PMZ62 (CE-704) — `tenantScopeOf` also answers null for a
 * signed-in user with no tenant (membership removed, tab still open), so that
 * user gets the same refusal. Signing in again does not fix it, so the one
 * sentence now covers both cases and points to the workspace administrator.
 *
 * The gate is the real one; only the session, the database and the plan are faked.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  moduleStateFindMany: vi.fn(),
  getEntitlements: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: h.auth }));
vi.mock('@/lib/db', () => ({
  prisma: {},
  withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
    cb({ moduleState: { findMany: h.moduleStateFindMany } } as never),
}));
vi.mock('@/lib/billing', () => ({ getEntitlements: h.getEntitlements }));

import { assertModuleAccess, ModuleAccessError } from '@/lib/modules/access';
import { TenantScopeError } from '@/lib/tenant';
import { isModuleUnavailable } from '@/lib/module-unavailable';
import { isSessionRequired, SESSION_REQUIRED_DIGEST } from '@/lib/session-required';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

/** Signed in, but no tenant: e.g. the membership was removed while the tab stayed open. */
const NO_TENANT_SESSION = { user: { id: 'user-1' }, role: 'MEMBER', workspaceIds: [], isPlatformAdmin: false };

const SESSION = {
  user: { id: 'user-1' },
  tenantId: 'tenant-1',
  role: 'PIPELINE_MANAGER',
  workspaceIds: ['ws-1'],
  isPlatformAdmin: false,
};

/** What the gate threw, or null when it let the call through. */
async function gateError(): Promise<unknown> {
  try {
    await assertModuleAccess('M7');
    return null;
  } catch (error) {
    return error;
  }
}

/** The error as a production browser receives it: a generic message and the digest. */
function asBrowserSees(error: unknown): Error {
  const digest = (error as { digest?: unknown }).digest;
  return Object.assign(new Error('An error occurred in the Server Components render.'), { digest });
}

function wrap(locale: 'tr' | 'en') {
  function Intl({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
        {children}
      </NextIntlClientProvider>
    );
  }
  return Intl;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getEntitlements.mockResolvedValue({ allowedModules: ['M7'], seats: 6, workspaces: 1, aiCreditsMonthly: 500 });
});

describe('assertModuleAccess — no session is not a module refusal', () => {
  test('no session throws TenantScopeError with the session digest, not ModuleAccessError', async () => {
    h.auth.mockResolvedValue(null);

    const error = await gateError();

    expect(error).toBeInstanceOf(TenantScopeError);
    expect(error).not.toBeInstanceOf(ModuleAccessError);
    expect((error as TenantScopeError).digest).toBe(SESSION_REQUIRED_DIGEST);
    expect(isSessionRequired(error)).toBe(true);
    expect(isModuleUnavailable(error)).toBe(false);
    // Refused before reading the tenant's plan or modules.
    expect(h.getEntitlements).not.toHaveBeenCalled();
  });

  test('signed in without a tenant throws the same TenantScopeError', async () => {
    h.auth.mockResolvedValue(NO_TENANT_SESSION);

    const error = await gateError();

    expect(error).toBeInstanceOf(TenantScopeError);
    expect(isSessionRequired(error)).toBe(true);
    expect(isModuleUnavailable(error)).toBe(false);
    expect(h.getEntitlements).not.toHaveBeenCalled();
  });

  test('M7 off still throws ModuleAccessError', async () => {
    h.auth.mockResolvedValue(SESSION);
    h.moduleStateFindMany.mockResolvedValue([{ moduleId: 'M7', status: 'OFF' }]);

    const error = await gateError();

    expect(error).toBeInstanceOf(ModuleAccessError);
    expect(isModuleUnavailable(error)).toBe(true);
    expect(isSessionRequired(error)).toBe(false);
  });
});

describe('useActionErrorText — what the TTO form says', () => {
  test.each(['tr', 'en'] as const)('%s: no session → Common.sessionExpired', async (locale) => {
    h.auth.mockResolvedValue(null);
    const error = await gateError();
    const { result } = renderHook(() => useActionErrorText(), { wrapper: wrap(locale) });
    const text = (locale === 'tr' ? trMessages : enMessages).Common.sessionExpired;

    expect(result.current(error, null)).toBe(text);
    expect(result.current(asBrowserSees(error), null)).toBe(text);
    expect(text).not.toBe((locale === 'tr' ? trMessages : enMessages).Common.moduleUnavailable);
  });

  // Not only "sign in again": a user with no workspace is also sent to the administrator.
  test.each([
    ['tr', /çalışma alanına bağlı değil/, /yöneticinize başvurun/],
    ['en', /not linked to a workspace/, /workspace administrator/],
  ] as const)('%s: signed in without a tenant → the sentence names the workspace case', async (locale, noWorkspace, admin) => {
    h.auth.mockResolvedValue(NO_TENANT_SESSION);
    const error = await gateError();
    const { result } = renderHook(() => useActionErrorText(), { wrapper: wrap(locale) });
    const messages = locale === 'tr' ? trMessages : enMessages;

    const text = result.current(asBrowserSees(error), null);
    expect(text).toBe(messages.Common.sessionExpired);
    expect(text).toMatch(noWorkspace);
    expect(text).toMatch(admin);
    expect(text).not.toBe(messages.Common.moduleUnavailable);
  });

  test.each(['tr', 'en'] as const)('%s: M7 off → Common.moduleUnavailable', async (locale) => {
    h.auth.mockResolvedValue(SESSION);
    h.moduleStateFindMany.mockResolvedValue([{ moduleId: 'M7', status: 'OFF' }]);
    const error = await gateError();
    const { result } = renderHook(() => useActionErrorText(), { wrapper: wrap(locale) });
    const text = (locale === 'tr' ? trMessages : enMessages).Common.moduleUnavailable;

    expect(result.current(error, null)).toBe(text);
    expect(result.current(asBrowserSees(error), null)).toBe(text);
  });

  test('other errors keep the call site fallback', () => {
    const { result } = renderHook(() => useActionErrorText(), { wrapper: wrap('en') });
    expect(result.current(new Error('boom'), null)).toBeNull();
    expect(isSessionRequired(SESSION_REQUIRED_DIGEST)).toBe(false);
  });
});
