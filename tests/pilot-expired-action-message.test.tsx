// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * İNCELEME-17 Ö-1 (TASK-MUMIIUEGJ6N8B) — a server action refused because the
 * free pilot ended used to show the action's own "… Lütfen tekrar deneyin."
 * The refusal now reaches the UI as one sentence, through one path:
 * `requireTenantAction` stamps `digest = 'PILOT_EXPIRED'` (what the browser
 * still gets in production), value-returning actions answer `'pilotExpired'`
 * via `failureCode`, and `useActionErrorText` turns either into
 * `Common.pilotExpired`.
 */

const session = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const writable = vi.hoisted(() => ({ expired: false }));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => session.current) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('@/lib/billing/pilot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/pilot')>();
  return {
    ...actual,
    assertTenantWritable: vi.fn(async (tenantId: string) => {
      if (writable.expired) throw new actual.PilotExpiredError(tenantId, new Date('2026-09-29T09:00:00Z'));
    }),
  };
});
// The real action, wrapped so the client tests can script its answer.
vi.mock('@/app/[locale]/(app)/[workspace]/settings/profile/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/[locale]/(app)/[workspace]/settings/profile/actions')>();
  return { ...actual, updateTenantProvince: vi.fn(actual.updateTenantProvince) };
});
// Only the name is needed; the real module pulls in the pipeline store.
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/actions', () => ({ createOpportunity: vi.fn() }));
vi.mock('@/lib/db', () => ({
  withTenant: vi.fn(async () => {
    throw new Error('the database must not be reached for a refused write');
  }),
}));

import { failureCode, isPilotExpired, PILOT_EXPIRED_CODE, PILOT_EXPIRED_DIGEST } from '@/lib/pilot-expired';
import { assertTenantActionWritable, requireTenantAction } from '@/lib/tenant';
import { PilotExpiredError } from '@/lib/billing/pilot';
import { updateTenantProvince } from '@/app/[locale]/(app)/[workspace]/settings/profile/actions';
import { createOpportunity } from '@/app/[locale]/(app)/[workspace]/pipeline/actions';
import ProvinceSetting from '@/app/[locale]/(app)/[workspace]/settings/profile/province-setting';
import AddToPipelineButton from '@/app/[locale]/(app)/[workspace]/calls/[id]/add-button';

const PILOT_TR = 'Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.';

beforeEach(() => {
  writable.expired = false;
  session.current = { user: { id: 'u-1' }, tenantId: 't-1', role: 'TENANT_OWNER' };
});
afterEach(cleanup);

describe('isPilotExpired / failureCode', () => {
  test('recognises every shape the refusal takes', () => {
    expect(isPilotExpired(new PilotExpiredError('t-1', new Date()))).toBe(true); // server side, by code
    expect(isPilotExpired(Object.assign(new Error('An error occurred in the Server Components render.'), { digest: PILOT_EXPIRED_DIGEST }))).toBe(true); // browser, production
    expect(isPilotExpired(PILOT_EXPIRED_CODE)).toBe(true); // value-returning action
  });

  test('leaves everything else alone', () => {
    expect(isPilotExpired(new Error('Pilot'))).toBe(false);
    expect(isPilotExpired(Object.assign(new Error('x'), { digest: '12345' }))).toBe(false);
    expect(isPilotExpired('failed')).toBe(false);
    expect(isPilotExpired(null)).toBe(false);
    expect(isPilotExpired(undefined)).toBe(false);
    expect(failureCode(new Error('db down'), 'failed')).toBe('failed');
    expect(failureCode(new PilotExpiredError('t-1', new Date()), 'failed')).toBe('pilotExpired');
  });

  test('the sentence exists once, in both languages', () => {
    expect(trMessages.Common.pilotExpired).toBe(PILOT_TR);
    expect(enMessages.Common.pilotExpired).toMatch(/pilot has ended/i);
  });
});

describe('server side: the refusal leaves an action carrying the digest', () => {
  test('requireTenantAction', async () => {
    writable.expired = true;
    const err = await requireTenantAction().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PilotExpiredError);
    expect((err as { digest?: string }).digest).toBe(PILOT_EXPIRED_DIGEST);
    // Reads stay open.
    await expect(requireTenantAction({ readOnly: true })).resolves.toMatchObject({ tenantId: 't-1' });
  });

  test('assertTenantActionWritable (actions that resolve the tenant themselves, e.g. pipeline)', async () => {
    writable.expired = true;
    const err = await assertTenantActionWritable('t-1').catch((e: unknown) => e);
    expect((err as { digest?: string }).digest).toBe(PILOT_EXPIRED_DIGEST);
    writable.expired = false;
    await expect(assertTenantActionWritable('t-1')).resolves.toBeUndefined();
  });

  test('a value-returning action answers pilotExpired, not failed', async () => {
    writable.expired = true;
    await expect(updateTenantProvince('İzmir')).resolves.toEqual({ ok: false, error: 'pilotExpired' });
  });
});

// ── client side ──────────────────────────────────────────────────────────────

function withIntl(node: React.ReactNode, locale: 'tr' | 'en' = 'tr') {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('client side: one sentence instead of "try again"', () => {
  test('value-returning action (province setting): pilotExpired → Common.pilotExpired; failed unchanged', async () => {
    const spy = vi.mocked(updateTenantProvince);

    spy.mockResolvedValueOnce({ ok: false, error: 'pilotExpired' });
    render(withIntl(<ProvinceSetting applies initialProvince="Ankara" canEdit />));
    fireEvent.change(screen.getByTestId('tenant-province-select'), { target: { value: 'İzmir' } });
    fireEvent.click(screen.getByTestId('tenant-province-save'));
    await waitFor(() => expect(screen.getByTestId('tenant-province-status').textContent).toBe(PILOT_TR));
    expect(screen.getByTestId('tenant-province-status').textContent).not.toMatch(/tekrar deneyin/);

    spy.mockResolvedValueOnce({ ok: false, error: 'failed' });
    await waitFor(() => expect((screen.getByTestId('tenant-province-save') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('tenant-province-save'));
    await waitFor(() =>
      expect(screen.getByTestId('tenant-province-status').textContent).toBe(trMessages.tenantProvince.errors.failed)
    );
  });

  test('throwing action (add to pipeline): the production-shaped rejection → Common.pilotExpired; other errors keep their label', async () => {
    const spy = vi.mocked(createOpportunity);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // What the browser receives in production: no message, only the digest.
    spy.mockRejectedValueOnce(
      Object.assign(new Error('An error occurred in the Server Components render.'), { digest: PILOT_EXPIRED_DIGEST })
    );
    const props = {
      workspace: 'default',
      locale: 'tr',
      title: 'Çağrı',
      topicId: 'HORIZON-X',
      buttonLabel: 'Ekle',
      addingLabel: 'Ekleniyor',
      errorLabel: 'Fırsat eklenemedi. Lütfen tekrar deneyin.',
    };
    render(withIntl(<AddToPipelineButton {...props} />));
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PILOT_TR));

    spy.mockRejectedValueOnce(Object.assign(new Error('x'), { digest: '4242' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Ekle' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(props.errorLabel));
  });

  test('English locale gets the English sentence', async () => {
    vi.mocked(createOpportunity).mockRejectedValueOnce(Object.assign(new Error(''), { digest: PILOT_EXPIRED_DIGEST }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      withIntl(
        <AddToPipelineButton workspace="default" locale="en" title="Call" topicId="X" buttonLabel="Add" addingLabel="Adding" errorLabel="Failed" />,
        'en'
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(enMessages.Common.pilotExpired));
  });
});
