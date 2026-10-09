// @vitest-environment jsdom
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * TASK-MUUS5HE3OW0CT — a server action refused by the module gate
 * (`assertModuleAccess` → `ModuleAccessError`) reached the TTO form as nothing
 * at all: in production the browser gets only the error's digest, and the
 * error had none, so `useActionErrorText` fell through to the call site's
 * `null`. The error now carries `digest = 'MODULE_ACCESS_DENIED'` and the hook
 * says `Common.moduleUnavailable`.
 */

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/db', () => ({ prisma: {}, withTenant: vi.fn() }));

import { ModuleAccessError } from '@/lib/modules/access';
import { isModuleUnavailable, MODULE_UNAVAILABLE_DIGEST } from '@/lib/module-unavailable';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

describe('ModuleAccessError crosses the action boundary', () => {
  test('carries the digest Next.js keeps, and the same code as before', () => {
    const error = new ModuleAccessError('M7', 'OFF', 'MODULE_OFF');
    expect(error.digest).toBe(MODULE_UNAVAILABLE_DIGEST);
    expect(error.code).toBe('MODULE_ACCESS_DENIED');
    expect(isModuleUnavailable(error)).toBe(true);
  });

  test('other errors and non-objects are not a module refusal', () => {
    expect(isModuleUnavailable(new Error('boom'))).toBe(false);
    expect(isModuleUnavailable(MODULE_UNAVAILABLE_DIGEST)).toBe(false);
    expect(isModuleUnavailable(null)).toBe(false);
  });
});

describe('useActionErrorText — MODULE_ACCESS_DENIED', () => {
  const wrap = (locale: 'tr' | 'en') => {
    function Intl({ children }: { children: React.ReactNode }) {
      return (
        <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
          {children}
        </NextIntlClientProvider>
      );
    }
    return Intl;
  };

  test.each([
    ['tr', trMessages.Common.moduleUnavailable],
    ['en', enMessages.Common.moduleUnavailable],
  ] as const)('%s: the production error and the server error both read Common.moduleUnavailable', (locale, text) => {
    const { result } = renderHook(() => useActionErrorText(), { wrapper: wrap(locale) });
    const production = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: MODULE_UNAVAILABLE_DIGEST,
    });
    expect(result.current(production, null)).toBe(text);
    expect(result.current(new ModuleAccessError('M7', 'OFF', 'PLAN_UPGRADE_REQUIRED'), null)).toBe(text);
    // Anything else keeps the call site's own fallback.
    expect(result.current(new Error('boom'), null)).toBeNull();
    expect(text.length).toBeGreaterThan(0);
  });
});
