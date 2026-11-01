// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import { BlogMarkdownEditor } from '@/components/blog/BlogMarkdownEditor';

const t = trMessages.adminBlog.editor;

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <NextIntlClientProvider locale="tr" messages={trMessages}>
      <label htmlFor="blog-content">{t.label}</label>
      <BlogMarkdownEditor id="blog-content" required value={value} onChange={setValue} />
    </NextIntlClientProvider>
  );
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText(t.label) as HTMLTextAreaElement;
}

afterEach(cleanup);

describe('BlogMarkdownEditor', () => {
  test('toolbar buttons format selected text and lines', async () => {
    render(<Harness initial="Horizon çağrısı" />);
    const el = textarea();

    // Bold button
    el.setSelectionRange(0, 7);
    fireEvent.click(screen.getByRole('button', { name: t.toolbar.bold }));
    expect(el.value).toBe('**Horizon** çağrısı');

    // Italic button
    el.setSelectionRange(12, 19);
    fireEvent.click(screen.getByRole('button', { name: t.toolbar.italic }));
    expect(el.value).toBe('**Horizon** *çağrısı*');

    // Heading 2
    el.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: t.toolbar.h2 }));
    expect(el.value).toBe('## **Horizon** *çağrısı*');
  });

  test('Ctrl+B and Ctrl+I format text from the keyboard', () => {
    render(<Harness initial="kalın ve italik" />);
    const el = textarea();

    el.setSelectionRange(0, 5);
    fireEvent.keyDown(el, { key: 'b', ctrlKey: true });
    expect(el.value).toBe('**kalın** ve italik');

    el.setSelectionRange(13, 19);
    fireEvent.keyDown(el, { key: 'i', ctrlKey: true });
    expect(el.value).toBe('**kalın** ve *italik*');
  });

  test('Ctrl+K opens link modal and inserting adds [text](url)', async () => {
    render(<Harness initial="Detaylı bilgi için tıklayın" />);
    const el = textarea();
    el.setSelectionRange(14, 18); // "için"

    fireEvent.keyDown(el, { key: 'k', ctrlKey: true });

    // Link modal is open
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(t.linkModal.title)).toBeTruthy();

    // Text field is populated with selected word "için"
    const textInput = screen.getByPlaceholderText(t.linkModal.textPlaceholder) as HTMLInputElement;
    expect(textInput.value).toBe('için');

    // Fill URL
    const urlInput = screen.getByPlaceholderText(t.linkModal.urlPlaceholder) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://nexagrant.com/rehber' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: t.linkModal.submit }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(el.value).toBe('Detaylı bilgi [için](https://nexagrant.com/rehber) tıklayın');
  });

  test('Image modal allows entering URL and inserts image markdown', async () => {
    render(<Harness initial="Yazı metni" />);
    const el = textarea();
    el.setSelectionRange(10, 10);

    // Click toolbar image button
    fireEvent.click(screen.getByRole('button', { name: t.toolbar.image }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(t.imageModal.title)).toBeTruthy();

    // Switch to URL tab
    fireEvent.click(screen.getByText(t.imageModal.tabUrl));

    // Fill URL & Alt
    const urlInput = screen.getByPlaceholderText(t.imageModal.urlPlaceholder) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://images.unsplash.com/photo-test' } });

    const altInput = screen.getByPlaceholderText(t.imageModal.altPlaceholder) as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'Proje Konsorsiyumu' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: t.imageModal.submit }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(el.value).toContain('![Proje Konsorsiyumu](https://images.unsplash.com/photo-test)');
  });

  test('the preview shows rendered post with headings, links and images', () => {
    const post = [
      '# Başlık',
      'Bir [Bağlantı](https://example.com) ve görsel:',
      '',
      '![Örnek](https://images.unsplash.com/photo-1)',
    ].join('\n');

    render(<Harness initial={post} />);

    fireEvent.click(screen.getByRole('tab', { name: t.tabs.preview }));

    expect(screen.getByRole('heading', { name: 'Başlık' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Bağlantı' });
    expect(link.getAttribute('href')).toBe('https://example.com');

    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://images.unsplash.com/photo-1');
    expect(img?.getAttribute('alt')).toBe('Örnek');

    // Toolbar buttons are disabled while in preview mode
    expect((screen.getByRole('button', { name: t.toolbar.bold }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('word and character counts are displayed in footer', () => {
    render(<Harness initial="Bir iki üç dört beş" />);
    expect(screen.getByText('5 kelime')).toBeTruthy();
    expect(screen.getByText('19 karakter')).toBeTruthy();
  });

  test('an empty preview displays empty state message', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: t.tabs.preview }));
    expect(screen.getByText(t.previewEmpty)).toBeTruthy();
  });

  test('a failed submit while previewing switches back to the writing tab', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: t.tabs.preview }));
    expect(textarea().hidden).toBe(true);

    fireEvent.invalid(textarea());
    expect(textarea().hidden).toBe(false);
    expect(screen.getByRole('tab', { name: t.tabs.write }).getAttribute('aria-selected')).toBe('true');
  });
});
