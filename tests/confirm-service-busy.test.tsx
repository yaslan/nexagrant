// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * TASK-MUOGR5FDKLH22 (İNCELEME-103 G-1, Ö-1 option B) — with the application
 * pool full, the pilot check of `requireTenantAction` leaves as
 * `ServiceBusyError` (src/lib/tenant.ts). The evidence confirm no longer lets
 * it reject the action: it answers `{ success: false, error: 'service_busy' }`,
 * and the upload screen says `Evidence.upload.error.service_busy`. Every other
 * refusal of the check still leaves the action as it was thrown.
 *
 * The real `requireTenantAction` / `assertTenantActionWritable` run here; only
 * the pilot query under them fails. The pool itself is held in the live S2
 * measurement of this task's report.
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
// The upload screen imports the actions: the presign is stubbed (no store
// here), the confirm is the real one, wrapped so its answer can be read.
vi.mock('@/app/[locale]/(app)/[workspace]/evidence/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/[locale]/(app)/[workspace]/evidence/actions')>();
  return {
    ...actual,
    getPresignedUploadUrlAction: vi.fn(async () => ({
      success: true as const,
      uploadUrl: 'http://store.test/put',
      objectKey: 't-1/incoming/00000001_belge.pdf',
      contentType: 'application/pdf',
    })),
    confirmEvidenceUploadAction: vi.fn(actual.confirmEvidenceUploadAction),
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
import { FORBIDDEN_ROLE_DIGEST } from '@/lib/forbidden-role';
import { confirmEvidenceUploadAction } from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import EvidenceClient from '@/app/[locale]/(app)/[workspace]/evidence/evidence-client';

const POOL_TEXT = 'timeout exceeded when trying to connect';
const confirmInput = {
  title: 'belge',
  category: 'CAT-03',
  objectKey: 't-1/incoming/00000001_belge.pdf',
  fileName: 'belge.pdf',
  fileSizeBytes: 10,
  mimeType: 'application/pdf',
};

beforeEach(() => {
  pilot.fail = null;
  session.current = { user: { id: 'u-1' }, tenantId: 't-1', role: 'TENANT_OWNER' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('confirmEvidenceUploadAction — application pool full', () => {
  test('returns { success: false, error: service_busy } instead of rejecting, with no driver text in it', async () => {
    pilot.fail = () => new Error(POOL_TEXT);
    const result = await confirmEvidenceUploadAction(confirmInput);
    expect(result).toStrictEqual({ success: false, error: 'service_busy' });
    expect(JSON.stringify(result)).not.toContain(POOL_TEXT);
  });

  test('an ended pilot still rejects with PILOT_EXPIRED', async () => {
    pilot.fail = () => new PilotExpiredError('t-1', new Date('2026-09-29T09:00:00Z'));
    const error = await rejection(() => confirmEvidenceUploadAction(confirmInput));
    expect(error).toBeInstanceOf(PilotExpiredError);
    expect(error).toMatchObject({ digest: PILOT_EXPIRED_DIGEST });
  });

  test('a role that may not upload still rejects with FORBIDDEN_ROLE', async () => {
    session.current = { user: { id: 'u-1' }, tenantId: 't-1', role: 'GUEST_PARTNER' };
    const error = await rejection(() => confirmEvidenceUploadAction(confirmInput));
    expect(error).toMatchObject({ digest: FORBIDDEN_ROLE_DIGEST });
  });

  test.each([
    ['a query the database refused (P2002)', () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })],
    ['a programming error', () => new TypeError("Cannot read properties of undefined (reading 'status')")],
  ])('%s is not swallowed: the action rejects with the same error', async (_name, make) => {
    const thrown = make();
    pilot.fail = () => thrown;
    expect(await rejection(() => confirmEvidenceUploadAction(confirmInput))).toBe(thrown);
  });
});

describe('Evidence.upload.error.service_busy', () => {
  test('tr and en both have it, and it is not the generic save_failed text', () => {
    for (const m of [trMessages, enMessages]) {
      const errors = m.Evidence.upload.error as Record<string, string>;
      expect(errors.service_busy).toEqual(expect.any(String));
      expect(errors.service_busy?.length).toBeGreaterThan(10);
      expect(errors.service_busy).not.toBe(errors.save_failed);
    }
  });

  test.each([
    ['tr', trMessages],
    ['en', enMessages],
  ] as const)('%s: the upload screen shows the service_busy text the real confirm returned', async (locale, messages) => {
    pilot.fail = () => new Error(POOL_TEXT);
    const confirmSpy = vi.mocked(confirmEvidenceUploadAction);
    confirmSpy.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    // The failure is shown inside the modal now, not in a native alert()
    // (TASK-MUSFO7ELD7WYF); a stray alert() would still be caught here.
    const alerts: string[] = [];
    vi.stubGlobal('alert', (text: string) => alerts.push(text));

    const view = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <EvidenceClient initialData={[]} locale={locale} />
      </NextIntlClientProvider>
    );
    fireEvent.click(view.getByRole('button', { name: locale === 'tr' ? 'Yeni Belge Yükle (R2)' : 'Upload Evidence (R2)' }));
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'belge.pdf', { type: 'application/pdf' })] } });
    fireEvent.submit(input.closest('form')!);

    const banner = await view.findByTestId('evidence-upload-error');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(await confirmSpy.mock.results[0]!.value).toStrictEqual({ success: false, error: 'service_busy' });
    expect(banner.textContent).toContain(messages.Evidence.upload.error.service_busy);
    expect(banner.textContent).not.toContain(POOL_TEXT);
    expect(alerts).toHaveLength(0);
  });
});
