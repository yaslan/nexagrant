// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * TASK-MUOF85BU7BV3X (İNCELEME-103 G-1) — under load the application pool gave
 * the pilot check of `requireTenantAction` no connection within its 1 s, and
 * the action rejected with pg-pool's "timeout exceeded when trying to connect"
 * (D7: 9 of 150 confirms; with the pool held, 150 of 150). The check now
 * throws `ServiceBusyError` (`digest = 'SERVICE_BUSY'`, a fixed message), the
 * driver's text goes to the server log, and `useActionErrorText` says
 * `Common.serviceBusy`. Any other failure of the check leaves unchanged.
 *
 * The pool itself is exercised by tests/service-busy-pool.live.test.ts.
 */

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const pilot = vi.hoisted(() => ({ fail: null as null | (() => unknown) }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/billing/pilot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/pilot')>();
  return {
    ...actual,
    assertTenantWritable: vi.fn(async () => {
      if (pilot.fail) throw pilot.fail();
    }),
  };
});
vi.mock('@/lib/db', () => {
  const unreachable = () => {
    throw new Error('the database must not be reached for a refused write');
  };
  return {
    prisma: new Proxy({}, { get: unreachable }),
    withTenant: vi.fn(async () => unreachable()),
    withTenantLockPool: vi.fn(async () => unreachable()),
  };
});

import { PilotExpiredError } from '@/lib/billing/pilot';
import { PILOT_EXPIRED_DIGEST } from '@/lib/pilot-expired';
import { isServiceBusy, SERVICE_BUSY_CODE, SERVICE_BUSY_DIGEST } from '@/lib/service-busy';
import { assertTenantActionWritable, requireTenantAction, ServiceBusyError } from '@/lib/tenant';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { confirmEvidenceUploadAction } from '@/app/[locale]/(app)/[workspace]/evidence/actions';

const POOL_TEXT = 'timeout exceeded when trying to connect';
const poolTimeout = () => new Error(POOL_TEXT);

let logged: string[];
beforeEach(() => {
  pilot.fail = null;
  session.current = { user: { id: 'u-1' }, tenantId: 't-1', role: 'TENANT_OWNER' };
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(' '));
  });
});
afterEach(() => vi.restoreAllMocks());

/** Whatever `run` rejected with. Fails the test if it resolved. */
async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('requireTenantAction — pilot check without a database connection', () => {
  test('pg-pool timeout → ServiceBusyError: SERVICE_BUSY digest, fixed message, driver text only in the log', async () => {
    pilot.fail = poolTimeout;
    const error = await rejection(() => requireTenantAction({ can: 'edit_proposal' }));

    expect(error).toBeInstanceOf(ServiceBusyError);
    expect(error).toMatchObject({ code: SERVICE_BUSY_DIGEST, digest: SERVICE_BUSY_DIGEST });
    expect(isServiceBusy(error)).toBe(true);
    // Nothing of what the driver said is on the error the browser gets.
    const e = error as Error & { cause?: unknown };
    expect(e.message).toBe('Service busy: the database had no connection for this request. Try again.');
    expect(e.cause).toBeUndefined();
    expect(JSON.stringify(Object.entries(e))).not.toContain(POOL_TEXT);
    // It is on the server log.
    expect(logged.some((l) => l.includes(POOL_TEXT))).toBe(true);
  });

  test.each([
    ['Prisma wrapper with the pool error as cause', () => Object.assign(new Error('Invalid `tx.subscription.findUnique()` invocation'), { cause: poolTimeout() })],
    ['AggregateError around it', () => new AggregateError([poolTimeout()], 'transaction failed')],
    ['connection terminated by connectionTimeoutMillis', () => new Error('Connection terminated due to connection timeout')],
    ['ECONNREFUSED', () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
  ])('%s → SERVICE_BUSY', async (_name, make) => {
    pilot.fail = make;
    const error = await rejection(() => assertTenantActionWritable('t-1'));
    expect(error).toBeInstanceOf(ServiceBusyError);
    expect((error as Error).message).toBe(new ServiceBusyError().message);
  });

  test('an ended pilot still leaves as PILOT_EXPIRED, not SERVICE_BUSY', async () => {
    pilot.fail = () => new PilotExpiredError('t-1', new Date('2026-09-29T09:00:00Z'));
    const error = await rejection(() => requireTenantAction());
    expect(error).toBeInstanceOf(PilotExpiredError);
    expect(error).toMatchObject({ digest: PILOT_EXPIRED_DIGEST });
    expect(isServiceBusy(error)).toBe(false);
    expect(logged).toEqual([]);
  });

  test.each([
    ['a query the database refused (P2002)', () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })],
    ['a programming error', () => new TypeError("Cannot read properties of undefined (reading 'status')")],
    ['a thrown string', () => 'boom'],
  ])('%s leaves unchanged: the same value, no digest', async (_name, make) => {
    const thrown = make();
    pilot.fail = () => thrown;
    const error = await rejection(() => requireTenantAction());
    expect(error).toBe(thrown);
    expect(isServiceBusy(error)).toBe(false);
    expect(logged).toEqual([]);
  });

  test('the real evidence confirm (İNCELEME-103 D7) answers service_busy rather than rejecting, never with the driver text (TASK-MUOGR5FDKLH22)', async () => {
    pilot.fail = poolTimeout;
    const result = await confirmEvidenceUploadAction({
      title: 'belge',
      category: 'CAT-03',
      objectKey: 't-1/incoming/00000001_belge.pdf',
      fileName: 'belge.pdf',
      fileSizeBytes: 10,
      mimeType: 'application/pdf',
    });
    expect(result).toStrictEqual({ success: false, error: 'service_busy' });
    expect(JSON.stringify(result)).not.toContain(POOL_TEXT);
    expect(logged.some((l) => l.includes(POOL_TEXT))).toBe(true);
  });
});

describe('useActionErrorText — SERVICE_BUSY', () => {
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
    ['tr', trMessages.Common.serviceBusy],
    ['en', enMessages.Common.serviceBusy],
  ] as const)('%s: the error the browser gets in production, the server error and the code all read Common.serviceBusy', (locale, text) => {
    const { result } = renderHook(() => useActionErrorText(), { wrapper: wrap(locale) });
    const production = Object.assign(new Error('An error occurred in the Server Components render.'), { digest: SERVICE_BUSY_DIGEST });
    expect(result.current(production, 'fallback')).toBe(text);
    expect(result.current(new ServiceBusyError(), 'fallback')).toBe(text);
    expect(result.current(SERVICE_BUSY_CODE, 'fallback')).toBe(text);
    // Anything else keeps the call site's own text.
    expect(result.current(new Error(POOL_TEXT), 'fallback')).toBe('fallback');
    expect(text.length).toBeGreaterThan(0);
  });
});
