// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import { PILOT_EXPIRED_DIGEST } from '@/lib/pilot-expired';

const actions = vi.hoisted(() => ({
  generateConceptNoteDraft: vi.fn(),
  saveConceptNoteDraft: vi.fn(),
  exportToDocx: vi.fn(),
}));
vi.mock('@/modules/m2/server/actions', () => actions);

import ConceptNoteEditor from '@/modules/m2/ui/ConceptNoteEditor';

/**
 * TASK-MVBE4DG89QJMS (FO-11) — the M2 editor reported every result with
 * `alert()`, in fixed English, on a Turkish screen. The result is now an
 * in-page band (`role="status"` for success, `role="alert"` for failure) in
 * the viewer's language, and no browser dialog opens.
 */

const schema = [{ key: 'summary', labelKey: 'Executive Summary', maxWords: 500 }];

function renderEditor(locale: 'tr' | 'en', noteId?: string) {
  const messages = locale === 'tr' ? trMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ConceptNoteEditor opportunityId="opp-1" templateId="tpl-1" schema={schema} noteId={noteId} />
    </NextIntlClientProvider>
  );
}

let alertSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  alertSpy = vi.fn();
  vi.stubGlobal('alert', alertSpy);
  Object.values(actions).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConceptNoteEditor — result band instead of alert()', () => {
  test('Turkish chrome: title, section label, word counter, generate button', () => {
    renderEditor('tr');
    const t = trMessages.ConceptNote.editor;
    expect(screen.getByRole('heading', { name: t.title })).toBeTruthy();
    expect(screen.getByText('Executive Summary (en fazla 500 kelime)')).toBeTruthy();
    expect(screen.getByText('Kelime: 0 / 500')).toBeTruthy();
    expect(screen.getByRole('button', { name: t.generate })).toBeTruthy();
    expect(screen.queryByText(/Concept Note Editor|AI Generate Draft|Words:/)).toBeNull();
  });

  test('a generated draft shows a status band, no dialog', async () => {
    actions.generateConceptNoteDraft.mockResolvedValue('note-1');
    renderEditor('tr');
    fireEvent.click(screen.getByRole('button', { name: trMessages.ConceptNote.editor.generate }));

    const band = await screen.findByRole('status');
    expect(band.textContent).toBe(trMessages.ConceptNote.editor.generated);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('a failed generation shows an alert band with the reason, no dialog', async () => {
    actions.generateConceptNoteDraft.mockRejectedValue(new Error('No API key'));
    renderEditor('en');
    fireEvent.click(screen.getByRole('button', { name: enMessages.ConceptNote.editor.generate }));

    const band = await screen.findByRole('alert');
    expect(band.textContent).toBe('Action failed: No API key');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['tr', trMessages.ConceptNote.editor.generate],
    ['en', enMessages.ConceptNote.editor.generate],
  ] as const)('a template section without a word limit is named in the band (%s)', async (locale, button) => {
    // In production the digest is all the browser receives: the message is withheld.
    actions.generateConceptNoteDraft.mockRejectedValue(
      Object.assign(new Error('withheld'), { digest: 'INVALID_TEMPLATE_SECTION:summary' })
    );
    renderEditor(locale);
    fireEvent.click(screen.getByRole('button', { name: button }));

    const band = await screen.findByRole('alert');
    expect(band.textContent).toContain('summary');
    expect(band.textContent).not.toContain('withheld');
  });

  test('saving an existing note shows a status band, no dialog', async () => {
    actions.saveConceptNoteDraft.mockResolvedValue(undefined);
    renderEditor('en', 'note-1');
    fireEvent.click(screen.getByRole('button', { name: enMessages.ConceptNote.editor.save }));

    const band = await screen.findByRole('status');
    expect(band.textContent).toBe(enMessages.ConceptNote.editor.saved);
    expect(actions.saveConceptNoteDraft).toHaveBeenCalledWith('note-1', {});
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('an export refused for an ended pilot says so, like generate and save', async () => {
    actions.exportToDocx.mockRejectedValue(Object.assign(new Error('x'), { digest: PILOT_EXPIRED_DIGEST }));
    renderEditor('tr', 'note-1');
    fireEvent.click(screen.getByRole('button', { name: trMessages.ConceptNote.editor.export }));

    const band = await screen.findByRole('alert');
    expect(band.textContent).toBe(trMessages.Common.pilotExpired);
  });

  test('any other export failure keeps the "action failed" text', async () => {
    actions.exportToDocx.mockRejectedValue(new Error('docx broke'));
    renderEditor('en', 'note-1');
    fireEvent.click(screen.getByRole('button', { name: enMessages.ConceptNote.editor.export }));

    const band = await screen.findByRole('alert');
    expect(band.textContent).toBe('Action failed: docx broke');
  });
});

/**
 * TASK-MVE19AQ06FF6J (FO-93) — the counter split on a literal "\s" instead of
 * whitespace, so four words read as "1".
 */
describe('ConceptNoteEditor — word counter', () => {
  const typeInto = (value: string) =>
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });

  test('counts whitespace-separated words', () => {
    renderEditor('tr');
    typeInto('dört kelimelik bir metin');
    expect(screen.getByText('Kelime: 4 / 500')).toBeTruthy();
  });

  test('tabs, newlines and repeated spaces separate words too', () => {
    renderEditor('en');
    typeInto('  one\ttwo\n\nthree    four five  ');
    expect(screen.getByText('Words: 5 / 500')).toBeTruthy();
  });

  test('empty or blank text counts 0', () => {
    renderEditor('en');
    typeInto('   \n ');
    expect(screen.getByText('Words: 0 / 500')).toBeTruthy();
    typeInto('');
    expect(screen.getByText('Words: 0 / 500')).toBeTruthy();
  });
});
