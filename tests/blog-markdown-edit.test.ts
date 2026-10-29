import { describe, expect, it } from 'vitest';
import {
  toggleBlock,
  toggleBold,
  toggleItalic,
  insertLink,
  insertImage,
} from '@/lib/blog-markdown-edit';

describe('toggleBold', () => {
  it('wraps the selection and keeps the same words selected', () => {
    const r = toggleBold('fon başvurusu', 0, 3);
    expect(r).toEqual({ value: '**fon** başvurusu', selectionStart: 2, selectionEnd: 5 });
  });

  it('unwraps when the markers are inside the selection', () => {
    expect(toggleBold('a **fon** b', 2, 9)).toEqual({ value: 'a fon b', selectionStart: 2, selectionEnd: 5 });
  });

  it('unwraps when the markers sit right around the selection', () => {
    expect(toggleBold('a **fon** b', 4, 7)).toEqual({ value: 'a fon b', selectionStart: 2, selectionEnd: 5 });
  });

  it('inserts empty markers with the caret between them when nothing is selected', () => {
    expect(toggleBold('ab', 1, 1)).toEqual({ value: 'a****b', selectionStart: 3, selectionEnd: 3 });
  });
});

describe('toggleItalic', () => {
  it('wraps the selection in single asterisks', () => {
    const r = toggleItalic('hibe rehberi', 0, 4);
    expect(r).toEqual({ value: '*hibe* rehberi', selectionStart: 1, selectionEnd: 5 });
  });

  it('unwraps when the markers are inside the selection', () => {
    expect(toggleItalic('a *hibe* b', 2, 8)).toEqual({ value: 'a hibe b', selectionStart: 2, selectionEnd: 6 });
  });

  it('unwraps when the markers sit right around the selection', () => {
    expect(toggleItalic('a *hibe* b', 3, 7)).toEqual({ value: 'a hibe b', selectionStart: 2, selectionEnd: 6 });
  });

  it('inserts empty markers with caret between them when nothing is selected', () => {
    expect(toggleItalic('ab', 1, 1)).toEqual({ value: 'a**b', selectionStart: 2, selectionEnd: 2 });
  });
});

describe('toggleBlock', () => {
  it('makes the caret line a heading', () => {
    const r = toggleBlock('giriş\nmetin', 2, 2, 'h2');
    expect(r.value).toBe('## giriş\nmetin');
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('## giriş');
  });

  it('replaces an existing heading level instead of stacking markers', () => {
    expect(toggleBlock('# Başlık', 0, 0, 'h3').value).toBe('### Başlık');
  });

  it('turns a heading back into plain text when toggled again', () => {
    expect(toggleBlock('## Başlık', 3, 3, 'h2').value).toBe('Başlık');
  });

  it('numbers every selected line from 1 and skips blank lines', () => {
    const text = 'önce\nbir\n\niki\nsonra';
    const r = toggleBlock(text, 5, 13, 'ol');
    expect(r.value).toBe('önce\n1. bir\n\n2. iki\nsonra');
  });

  it('switches a bullet list to a numbered list', () => {
    expect(toggleBlock('* a\n* b', 0, 7, 'ol').value).toBe('1. a\n2. b');
  });

  it('removes the list when every selected line already is that list', () => {
    expect(toggleBlock('* a\n* b', 0, 7, 'ul').value).toBe('a\nb');
  });

  it('toggles quote block with >', () => {
    expect(toggleBlock('Önemli not', 0, 0, 'quote').value).toBe('> Önemli not');
    expect(toggleBlock('> Önemli not', 0, 0, 'quote').value).toBe('Önemli not');
  });

  it('does not touch the next line when the selection ends after a newline', () => {
    expect(toggleBlock('a\nb', 0, 2, 'ul').value).toBe('* a\nb');
  });
});

describe('insertLink', () => {
  it('inserts link using selected text as label', () => {
    const r = insertLink('Detaylı bilgi için tıklayın.', 14, 18, 'https://nexagrant.com', undefined, 'Bağlantı');
    expect(r.value).toBe('Detaylı bilgi [için](https://nexagrant.com) tıklayın.');
    expect(r.selectionStart).toBe(14);
    expect(r.selectionEnd).toBe(43);
  });

  it('inserts link with explicitly provided text', () => {
    const r = insertLink('Buradan ulaşabilirsiniz.', 0, 0, 'https://nexagrant.com', 'FonBridge Portalı', 'Bağlantı');
    expect(r.value).toBe('[FonBridge Portalı](https://nexagrant.com)Buradan ulaşabilirsiniz.');
  });

  it('uses the caller-supplied fallback label when selection and text are both empty', () => {
    const r = insertLink('Metin', 5, 5, 'https://nexagrant.com', undefined, 'Link');
    expect(r.value).toBe('Metin[Link](https://nexagrant.com)');
  });
});

describe('insertImage', () => {
  it('inserts image markdown with alt text', () => {
    const r = insertImage('Giriş metni', 11, 11, 'https://images.unsplash.com/photo-1', 'Konsorsiyum');
    expect(r.value).toBe('Giriş metni\n\n![Konsorsiyum](https://images.unsplash.com/photo-1)');
  });

  it('inserts image markdown without alt text cleanly', () => {
    const r = insertImage('', 0, 0, 'https://images.unsplash.com/photo-1');
    expect(r.value).toBe('![](https://images.unsplash.com/photo-1)');
  });
});
