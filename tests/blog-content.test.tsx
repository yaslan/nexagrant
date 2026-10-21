// @vitest-environment jsdom
import React from 'react';
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { isSafeUrl, renderBlogContent, renderInline } from '@/components/blog/blog-content';

describe('isSafeUrl', () => {
  test('accepts https and http protocols', () => {
    expect(isSafeUrl('https://fonbridge.com/test')).toBe(true);
    expect(isSafeUrl('http://images.unsplash.com/photo-1')).toBe(true);
  });

  test('accepts relative paths', () => {
    expect(isSafeUrl('/tr/blog/ornek-yazi')).toBe(true);
    expect(isSafeUrl('#bolum-1')).toBe(true);
  });

  test('refuses dangerous protocols', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('   javascript:void(0)   ')).toBe(false);
  });
});

describe('renderInline', () => {
  test('renders bold, italic, code and links', () => {
    const { container } = render(
      <div>
        {renderInline(
          'Metin içinde **kalın**, *italik*, `kod parçası` ve [Bağlantı](https://example.com) bulunuyor.'
        )}
      </div>
    );

    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('kalın');

    const em = container.querySelector('em');
    expect(em?.textContent).toBe('italik');

    const code = container.querySelector('code');
    expect(code?.textContent).toBe('kod parçası');

    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Bağlantı');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('refuses javascript links and renders text without anchor tag', () => {
    const { container } = render(
      <div>{renderInline('[Zararlı Link](javascript:alert(1))')}</div>
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Zararlı Link');
  });

  test('renders inline images safely', () => {
    const { container } = render(
      <div>{renderInline('Öncesi ![Açıklama](https://images.unsplash.com/photo-1) sonrası')}</div>
    );

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://images.unsplash.com/photo-1');
    expect(img?.getAttribute('alt')).toBe('Açıklama');
  });
});

describe('renderBlogContent', () => {
  test('renders headings, block figures, quotes, lists and paragraphs', () => {
    const markdown = [
      '# Ana Başlık',
      'İlk paragraf metni.',
      '## İkinci Düzey Başlık',
      '### Üçüncü Düzey Başlık',
      '',
      '![Mimarî Görseli](https://images.unsplash.com/photo-arch)',
      '',
      '> Bu bir alıntı cümlesidir.',
      '',
      '* Liste maddesi 1',
      '* Liste maddesi 2',
      '',
      '1. Adım bir',
      '2. Adım iki',
    ].join('\n');

    const { container } = render(<div>{renderBlogContent(markdown)}</div>);

    expect(container.querySelector('h2')?.textContent).toBe('Ana Başlık');
    expect(container.querySelector('h3')?.textContent).toBe('İkinci Düzey Başlık');
    expect(container.querySelector('h4')?.textContent).toBe('Üçüncü Düzey Başlık');

    const figure = container.querySelector('figure');
    expect(figure).toBeTruthy();
    const img = figure?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://images.unsplash.com/photo-arch');
    expect(img?.getAttribute('alt')).toBe('Mimarî Görseli');
    expect(figure?.querySelector('figcaption')?.textContent).toBe('Mimarî Görseli');

    const bq = container.querySelector('blockquote');
    expect(bq?.textContent).toContain('Bu bir alıntı cümlesidir.');

    const ul = container.querySelector('ul');
    expect(ul?.querySelectorAll('li')).toHaveLength(2);

    const ol = container.querySelector('ol');
    expect(ol?.querySelectorAll('li')).toHaveLength(2);
  });

  test('keeps pasted raw HTML as text (never creates dangerous elements)', () => {
    const raw = '# Test\n\n<script>window.xss=1</script>\n\n<img src=x onerror="alert(1)">';
    const { container } = render(<div>{renderBlogContent(raw)}</div>);

    expect(container.querySelector('script')).toBeNull();
    // Only markdown images become <img>; raw html tags stay as safe escaped text nodes
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(container.textContent).toContain('<script>window.xss=1</script>');
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
