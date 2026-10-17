// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import ExpertPreregForm, { maskOrcid } from '@/components/expert-prereg/ExpertPreregForm';
import { parseKvkkMarkdown } from '@/components/expert-prereg/kvkk-text';
import { parseFounderNumber } from '@/components/expert-prereg/paths';

/**
 * FO-20 (TASK-MVBIYE9O6JCQ7) — the public expert pre-registration form. The
 * schema and error codes are FO-19's; what is pinned here is the form's side:
 * every code reaches the right field as translated text, focus moves to the
 * first error, consents start unticked, and nothing is sent until the shared
 * schema passes.
 */

const messages = { tr: trMessages, en: enMessages };
const tr = trMessages.ExpertPrereg;

function renderForm(locale: 'tr' | 'en' = 'tr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ExpertPreregForm
        locale={locale}
        kvkkBlocks={[{ kind: 'title', text: 'Aydınlatma' }, { kind: 'paragraph', text: 'Metin' }]}
        pageUrl="https://example.test/tr/uzman"
      />
    </NextIntlClientProvider>,
  );
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Ad Soyad/), { target: { value: 'Ayşe Yılmaz' } });
  fireEvent.change(screen.getByLabelText(/^E-posta/), { target: { value: 'ayse@example.org' } });
  const province = screen.getByRole('combobox');
  fireEvent.change(province, { target: { value: 'izmir' } });
  fireEvent.keyDown(province, { key: 'Enter' });
  fireEvent.change(screen.getByLabelText(/^Unvan/), { target: { value: 'Proje Koordinatörü' } });
  fireEvent.change(screen.getByLabelText(/^Kurum/), { target: { value: 'Ankara Üniversitesi' } });
  fireEvent.click(screen.getByLabelText(tr.options.areas.energy));
  fireEvent.click(screen.getByLabelText(tr.options.roles.coordinator));
  fireEvent.click(screen.getByLabelText(tr.options.programmes['erasmus-plus']));
  fireEvent.click(screen.getByLabelText(/Profilimin uzman rehberinde/));
  fireEvent.click(document.getElementById('ep-kvkkAccepted') as HTMLInputElement);
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ExpertPreregForm', () => {
  test('all three consent boxes start unticked', () => {
    renderForm();
    for (const id of ['ep-kvkkAccepted', 'ep-visibilityConsent', 'ep-marketingConsent']) {
      expect((document.getElementById(id) as HTMLInputElement).checked).toBe(false);
    }
  });

  test('empty submit: field-level errors, linked by aria-describedby, focus on the first', async () => {
    renderForm();
    fireEvent.submit(screen.getByTestId('ep-form'));
    const name = screen.getByLabelText(/Ad Soyad/);
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    const err = document.getElementById('ep-fullName-error');
    expect(err?.textContent).toBe(tr.errors.required);
    expect(name.getAttribute('aria-describedby')).toContain('ep-fullName-error');
    expect(document.getElementById('ep-email-error')?.textContent).toBe(tr.errors.invalid_email);
    expect(document.getElementById('ep-province-error')?.textContent).toBe(tr.errors.unknown_slug);
    expect(document.getElementById('expertiseAreas-error')?.textContent).toBe(tr.errors.required);
    expect(document.getElementById('ep-title-error')?.textContent).toBe(tr.errors.required);
    expect(document.getElementById('ep-organization-error')?.textContent).toBe(tr.errors.required);
    expect(document.getElementById('languages-error')).toBeNull();
    expect(document.getElementById('ep-kvkkAccepted-error')?.textContent).toBe(tr.errors.consent_required);
    expect(document.getElementById('ep-visibilityConsent-error')?.textContent).toBe(tr.errors.consent_required);
    expect(document.getElementById('ep-marketingConsent-error')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a valid form posts the schema body plus honeypot and locale', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    renderForm();
    fillRequired();
    fireEvent.submit(screen.getByTestId('ep-form'));
    await screen.findByText(tr.success.title);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/expert-preregistration');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      fullName: 'Ayşe Yılmaz',
      email: 'ayse@example.org',
      province: '35',
      title: 'Proje Koordinatörü',
      organization: 'Ankara Üniversitesi',
      expertiseAreas: ['energy'],
      roles: ['coordinator'],
      programmes: ['erasmus-plus'],
      languages: [],
      kvkkAccepted: true,
      visibilityConsent: true,
      marketingConsent: false,
      website: '',
      locale: 'tr',
    });
    const share = screen.getByTestId('ep-share-linkedin');
    expect(share.getAttribute('href')).toContain('linkedin.com');
    expect(decodeURIComponent(share.getAttribute('href') ?? '')).toContain('https://example.test/tr/uzman');
  });

  // FO-25 (K-516717): Unvan and Kurum are required, Diller is optional.
  test('no organisation: the error lands on Kurum with focus, nothing is sent', async () => {
    renderForm();
    fillRequired();
    const org = screen.getByLabelText(/^Kurum/);
    fireEvent.change(org, { target: { value: '' } });
    fireEvent.submit(screen.getByTestId('ep-form'));
    await waitFor(() => expect(document.activeElement).toBe(org));
    expect(document.getElementById('ep-organization-error')?.textContent).toBe(tr.errors.required);
    expect(org.getAttribute('aria-invalid')).toBe('true');
    expect(org.getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText(/^Unvan/).getAttribute('aria-required')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a picked language is sent; the languages group carries no required mark', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    renderForm();
    fillRequired();
    const legend = screen.getByText(tr.form.languages_legend);
    expect(legend.closest('legend')?.textContent).not.toContain('*');
    fireEvent.click(screen.getByLabelText(tr.options.languages.en));
    fireEvent.submit(screen.getByTestId('ep-form'));
    await screen.findByText(tr.success.title);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).languages).toEqual(['en']);
  });

  test('409 already_registered lands on the e-mail field', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ errors: { email: 'already_registered' } }), { status: 409 }));
    renderForm();
    fillRequired();
    fireEvent.submit(screen.getByTestId('ep-form'));
    const email = screen.getByLabelText(/^E-posta/);
    await waitFor(() => expect(document.getElementById('ep-email-error')?.textContent).toBe(tr.errors.already_registered));
    expect(document.activeElement).toBe(email);
  });

  test('400 from the server maps each code; an unknown code falls back to "invalid"', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errors: { orcid: 'invalid_orcid', linkedinUrl: 'weird_code' } }), { status: 400 }),
    );
    renderForm();
    fillRequired();
    fireEvent.submit(screen.getByTestId('ep-form'));
    await waitFor(() => expect(document.getElementById('ep-orcid-error')?.textContent).toBe(tr.errors.invalid_orcid));
    expect(document.getElementById('ep-linkedinUrl-error')?.textContent).toBe(tr.errors.invalid);
  });

  test('429 shows the rate-limit message', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
    renderForm();
    fillRequired();
    fireEvent.submit(screen.getByTestId('ep-form'));
    expect(await screen.findByText(tr.form.error_rate)).toBeTruthy();
  });

  test('the KVKK link opens the dialog and does not tick the box', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'KVKK Aydınlatma Metni' }));
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect((document.getElementById('ep-kvkkAccepted') as HTMLInputElement).checked).toBe(false);
  });

  test('province combobox: type, arrow, Enter picks; Escape closes', () => {
    renderForm();
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'an' } });
    expect(box.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    // "an" → names starting with it first (Ankara, Antalya), then the rest (Adana …);
    // ArrowDown moved to the second match.
    expect((box as HTMLInputElement).value).toBe('Antalya');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  // FO-28 (TASK-MVC30JGOJTXJW): nothing is active until an arrow key moves, so
  // Enter on a fresh focus neither picks a province nor swallows the submit.
  test('province combobox: focus + Enter on an empty field picks nothing', () => {
    renderForm();
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(box.hasAttribute('aria-activedescendant')).toBe(false);
    expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0);
    const enter = fireEvent.keyDown(box, { key: 'Enter' });
    expect(enter).toBe(true); // not preventDefault-ed: the form keeps its Enter
    expect((box as HTMLInputElement).value).toBe('');
  });

  test('province combobox: refocus + Enter keeps the chosen province', () => {
    renderForm();
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'izmir' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((box as HTMLInputElement).value).toBe('İzmir');
    fireEvent.blur(box);
    fireEvent.focus(box);
    // The saved value is the active option on reopen, so Enter re-picks İzmir.
    expect(box.getAttribute('aria-activedescendant')).toMatch(/-35$/);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((box as HTMLInputElement).value).toBe('İzmir');
  });

  test('province combobox: focus + ArrowDown + Enter picks the first option', () => {
    renderForm();
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    const [first] = screen.getAllByRole('option', { selected: true });
    expect(box.getAttribute('aria-activedescendant')).toBe(first?.id);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((box as HTMLInputElement).value).toBe('Adana');
  });

  test('the honeypot is out of the tab order and hidden from assistive tech', () => {
    renderForm();
    const hp = document.getElementById('ep-website') as HTMLInputElement;
    expect(hp.tabIndex).toBe(-1);
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('helpers', () => {
  test('maskOrcid', () => {
    expect(maskOrcid('0000000218250097')).toBe('0000-0002-1825-0097');
    expect(maskOrcid('0000-0002-1694-233x')).toBe('0000-0002-1694-233X');
    expect(maskOrcid('12ab34')).toBe('1234');
    expect(maskOrcid('X123')).toBe('123');
    expect(maskOrcid('00000002182500971234')).toBe('0000-0002-1825-0097');
  });

  test('parseFounderNumber', () => {
    expect(parseFounderNumber('1')).toBe(1);
    expect(parseFounderNumber('100')).toBe(100);
    expect(parseFounderNumber('0')).toBeNull();
    expect(parseFounderNumber('101')).toBeNull();
    expect(parseFounderNumber('yok')).toBeNull();
    expect(parseFounderNumber(['3'])).toBeNull();
  });

  test('parseKvkkMarkdown reads the shipped notice', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const f of ['content/kvkk-uzman-v1.md', 'content/kvkk-uzman-v1.en.md']) {
      const blocks = parseKvkkMarkdown(await readFile(f, 'utf8'));
      expect(blocks[0]?.kind).toBe('title');
      expect(blocks.filter((b) => b.kind === 'heading')).toHaveLength(7);
      expect(blocks.some((b) => b.kind === 'list')).toBe(true);
      expect(JSON.stringify(blocks)).toContain('[FonBridge tüzel kişi unvanı]');
    }
    expect(parseKvkkMarkdown('# T\n\na\nb\n- x\n- y\nc')).toEqual([
      { kind: 'title', text: 'T' },
      { kind: 'paragraph', text: 'a b' },
      { kind: 'list', items: ['x', 'y'] },
      { kind: 'paragraph', text: 'c' },
    ]);
  });
});
