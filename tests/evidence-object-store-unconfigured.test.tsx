// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * TASK-MUSFO7ELD7WYF — a production server without R2 handed the browser the
 * dev upload stand-in, `/api/evidence/mock-upload`, which does not exist in
 * production (it answers 404). The upload failed with a bare "HTTP 404" in a
 * native alert(), the modal stayed open and nothing said why.
 *
 * Pinned here: in production with no object store the presign refuses early
 * with `object_store_unconfigured`, no mock URL is ever produced, the browser
 * sends no PUT, and the modal shows the translated sentence.
 */

// No object store, whatever the developer's `.env` says: `s3` is built when
// src/lib/storage.ts is first imported.
vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = '';
});

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/billing/pilot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/pilot')>();
  return { ...actual, assertTenantWritable: vi.fn(async () => {}) };
});
vi.mock('@/lib/db', () => {
  const unreachable = () => {
    throw new Error('the presign must not reach the database');
  };
  return {
    prisma: new Proxy({}, { get: unreachable }),
    withTenant: vi.fn(async () => unreachable()),
    withTenantLockPool: vi.fn(async () => unreachable()),
  };
});

import { env } from '@/lib/env';
import {
  getPresignedUploadUrl,
  hasObjectStore,
  objectStoreMissingInProduction,
  ObjectStoreUnconfiguredError,
} from '@/lib/storage';
import { getPresignedUploadUrlAction } from '@/app/[locale]/(app)/[workspace]/evidence/actions';
import EvidenceClient from '@/app/[locale]/(app)/[workspace]/evidence/evidence-client';

const mutableEnv = env as { NODE_ENV: string };
const originalNodeEnv = mutableEnv.NODE_ENV;
const asProduction = () => {
  mutableEnv.NODE_ENV = 'production';
};

beforeEach(() => {
  session.current = { user: { id: 'u-1' }, tenantId: 't-1', role: 'TENANT_OWNER' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('objectStoreMissingInProduction', () => {
  test.each([
    ['production', false, true],
    ['production', true, false],
    ['development', false, false],
    ['test', false, false],
  ] as const)('NODE_ENV=%s, object store=%s → %s', (nodeEnv, store, expected) => {
    expect(objectStoreMissingInProduction({ NODE_ENV: nodeEnv }, store)).toBe(expected);
  });

  test('this suite really runs without an object store', () => {
    expect(hasObjectStore).toBe(false);
  });
});

describe('getPresignedUploadUrl without an object store', () => {
  test('production: throws instead of handing out the dev mock-upload URL', async () => {
    asProduction();
    const answer = await getPresignedUploadUrl('t-1', 'org-default', 'certificate', 'a.pdf', 'application/pdf', 10).then(
      (value) => value,
      (error: unknown) => error
    );
    expect(answer).toBeInstanceOf(ObjectStoreUnconfiguredError);
    expect(JSON.stringify(answer)).not.toContain('mock-upload');
  });

  test('outside production: still the same-origin dev stand-in', async () => {
    const { uploadUrl } = await getPresignedUploadUrl('t-1', 'org-default', 'certificate', 'a.pdf', 'application/pdf', 10);
    expect(uploadUrl.startsWith('/api/evidence/mock-upload?key=')).toBe(true);
  });
});

describe('getPresignedUploadUrlAction without an object store', () => {
  test('production: refuses early with object_store_unconfigured, and no URL', async () => {
    asProduction();
    const result = await getPresignedUploadUrlAction('certificate', 'a.pdf', 'application/pdf', 10);
    expect(result).toStrictEqual({ success: false, error: 'object_store_unconfigured' });
  });

  test('production: an unsupported file is still told it is unsupported, not that storage is missing', async () => {
    asProduction();
    const result = await getPresignedUploadUrlAction('certificate', 'a.exe', 'application/octet-stream', 10);
    expect(result).toStrictEqual({ success: false, error: 'unsupported_type' });
  });

  test('outside production: the dev stand-in URL is still handed out', async () => {
    const result = await getPresignedUploadUrlAction('certificate', 'a.pdf', 'application/pdf', 10);
    expect(result).toMatchObject({ success: true, uploadUrl: expect.stringContaining('/api/evidence/mock-upload?key=') });
  });
});

describe('Evidence.upload.error.object_store_unconfigured', () => {
  test('tr and en both have it, and it is not the retryable storage_unavailable text', () => {
    for (const m of [trMessages, enMessages]) {
      const errors = m.Evidence.upload.error as Record<string, string>;
      expect(errors.object_store_unconfigured?.length).toBeGreaterThan(20);
      expect(errors.object_store_unconfigured).not.toBe(errors.storage_unavailable);
    }
  });

  test.each([
    ['tr', trMessages],
    ['en', enMessages],
  ] as const)('%s: the modal shows the sentence, sends no PUT and raises no native alert', async (locale, messages) => {
    asProduction();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
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
    expect(banner.textContent).toContain(messages.Evidence.upload.error.object_store_unconfigured);
    expect(banner.textContent).not.toMatch(/404|mock-upload/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);
  });
});
