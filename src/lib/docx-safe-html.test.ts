import { describe, it, expect } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  escapeHtmlText,
  safeInlineImageSrc,
  sanitizeHtmlForDocx,
} from './docx-safe-html';

/** A real 1×1 PNG. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const budget = () => ({ remaining: 8 * 1024 * 1024 });

describe('sanitizeHtmlForDocx — no URL survives as an image source (TASK-MUN80RJ96EG0O)', () => {
  const urlImages = [
    '<img src="http://169.254.169.254/latest/meta-data/iam.png">',
    '<img src="http://127.0.0.1:8080/internal/secret.png">',
    '<img src="https://10.0.0.5/x.png">',
    '<IMG SRC="http://127.0.0.1/a.png">',
    '<img/src="http://127.0.0.1/a.png">',
    '<img src=http://127.0.0.1/a.png>',
    '<img src="&#104;ttp://127.0.0.1/a.png">',
    '<img src="//127.0.0.1/a.png">',
    '<img src="file:///etc/passwd">',
    '<img srcset="http://127.0.0.1/a.png 1x">',
    '<img src="data:image/png;base64,AAAA" srcset="http://127.0.0.1/a.png">',
    `<img src="data:image/png;base64,${PNG_B64}#http://127.0.0.1/a.png">`,
    '<image src="http://127.0.0.1/a.png">',
    '<svg><image href="http://127.0.0.1/a.png"/></svg>',
    '<picture><source srcset="http://127.0.0.1/a.png"><img src="http://127.0.0.1/b.png"></picture>',
    '<p style="background:url(http://127.0.0.1/a.png)">x</p>',
    '<!-- <img src="http://127.0.0.1/a.png"> -->',
    '<p><img src="http://2130706433/a.png"></p>',
    '<p><img src="http://[::ffff:127.0.0.1]/a.png"></p>',
  ];

  it.each(urlImages)('drops every URL-bearing image form: %s', (html) => {
    const out = sanitizeHtmlForDocx(html, budget());
    expect(out).not.toMatch(/https?:|\/\/|file:|127\.0\.0\.1|169\.254/i);
    expect(out).not.toMatch(/srcset|style=|<svg|<image\b|<source/i);
  });

  it('keeps a real inline PNG, re-encoded, and nothing else on the tag', () => {
    const out = sanitizeHtmlForDocx(
      `<p>Chart:</p><img alt="a" width="9000" onerror="x" src="data:image/png;base64,${PNG_B64}">`,
      budget()
    );
    expect(out).toBe(`<p>Chart:</p><img src="data:image/png;base64,${PNG_B64}" />`);
  });

  it('keeps formatting tags and escapes text, dropping scripts and unknown wrappers', () => {
    const out = sanitizeHtmlForDocx(
      '<h2 class="x">Plan</h2><p onclick="y">a &lt; b &amp; <strong>c</strong></p><script>alert(1)</script><custom-el><em>kept</em></custom-el><ul><li>one</li></ul>',
      budget()
    );
    expect(out).toBe(
      '<h2>Plan</h2><p>a &lt; b &amp; <strong>c</strong></p><em>kept</em><ul><li>one</li></ul>'
    );
  });

  it('passes plain markdown through as escaped text', () => {
    expect(sanitizeHtmlForDocx('**Bold** 1 < 2\n- item', budget())).toBe('**Bold** 1 &lt; 2\n- item');
  });

  it('keeps http/https/mailto hyperlinks (not fetched) and drops javascript:', () => {
    expect(sanitizeHtmlForDocx('<a href="https://ec.europa.eu/x?a=1&b=2">EU</a>', budget())).toBe(
      '<a href="https://ec.europa.eu/x?a=1&amp;b=2">EU</a>'
    );
    expect(sanitizeHtmlForDocx('<a href="javascript:alert(1)">x</a>', budget())).toBe('<a>x</a>');
  });

  it('flattens absurd nesting to text instead of recursing without bound', () => {
    const deep = '<div>'.repeat(5000) + 'core' + '</div>'.repeat(5000);
    const out = sanitizeHtmlForDocx(deep, budget());
    expect(out).toContain('core');
    expect((out.match(/<div>/g) ?? []).length).toBeLessThanOrEqual(32);
  });
});

describe('safeInlineImageSrc — the image-size DoS path (O-3)', () => {
  const b64 = (bytes: number[] | Buffer) => Buffer.from(bytes).toString('base64');

  it('refuses bytes that are not PNG/JPEG/GIF even under an image/png label', () => {
    // ICNS ("icns") and HEIF ("ftypheic") are the formats whose bundled image-size parsers loop.
    const icns = Buffer.concat([Buffer.from('icns'), Buffer.alloc(16)]);
    const heif = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
    expect(safeInlineImageSrc(`data:image/png;base64,${b64(icns)}`, budget())).toBeNull();
    expect(safeInlineImageSrc(`data:image/png;base64,${b64(heif)}`, budget())).toBeNull();
    expect(safeInlineImageSrc(`data:image/svg+xml;base64,${b64(Buffer.from('<svg/>'))}`, budget())).toBeNull();
  });

  it('labels by signature, not by the declared type', () => {
    expect(safeInlineImageSrc(`data:image/gif;base64,${PNG_B64}`, budget())).toBe(
      `data:image/png;base64,${PNG_B64}`
    );
  });

  it('enforces the per-image cap and the shared per-document budget', () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big);
    expect(safeInlineImageSrc(`data:image/png;base64,${b64(big)}`, budget())).toBeNull();

    const shared = { remaining: 100 };
    expect(safeInlineImageSrc(`data:image/png;base64,${PNG_B64}`, shared)).not.toBeNull();
    expect(safeInlineImageSrc(`data:image/png;base64,${PNG_B64}`, shared)).toBeNull();
  });
});

describe('escapeHtmlText', () => {
  it('neutralises markup in names and titles', () => {
    expect(escapeHtmlText('<img src="http://127.0.0.1/a.png">')).toBe(
      '&lt;img src="http://127.0.0.1/a.png"&gt;'
    );
  });
});
