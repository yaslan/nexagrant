// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

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

  test('saving an existing note shows a status band, no dialog', async () => {
    actions.saveConceptNoteDraft.mockResolvedValue(undefined);
    renderEditor('en', 'note-1');
    fireEvent.click(screen.getByRole('button', { name: enMessages.ConceptNote.editor.save }));

    const band = await screen.findByRole('status');
    expect(band.textContent).toBe(enMessages.ConceptNote.editor.saved);
    expect(actions.saveConceptNoteDraft).toHaveBeenCalledWith('note-1', {});
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
