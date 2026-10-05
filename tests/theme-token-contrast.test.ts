import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

/**
 * AKTAR-MURBCJ0A-1 K-4 — `text-muted` is body-size secondary text, so the `--muted`
 * token must reach WCAG AA (4.5:1) on every ground it sits on, in both themes.
 *
 * #64748B on the light --ground #F4F6F8 was 4.39:1 and alone made 277 axe
 * color-contrast violations across 18 pages. Checking the token pair here catches
 * a regression before a page is rendered; the ratio is the WCAG 2.x formula.
 */

const css = readFileSync(resolve(__dirname, '../src/app/globals.css'), 'utf8');

function block(selector: RegExp): Record<string, string> {
  const match = css.match(selector);
  if (!match) throw new Error(`no block for ${selector}`);
  return Object.fromEntries(
    [...(match[1] ?? '').matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const themes = {
  light: block(/:root\s*\{([^}]*)\}/),
  dark: block(/\.dark,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/),
};

describe.each(Object.entries(themes))('--muted contrast (%s)', (_, tokens) => {
  test.each(['ground', 'surface', 'surface-hover'])('on --%s is at least 4.5:1', (bg) => {
    const fg = tokens.muted;
    const ground = tokens[bg];
    if (!fg || !ground) throw new Error(`--muted or --${bg} missing from globals.css`);
    expect(contrast(fg, ground)).toBeGreaterThanOrEqual(4.5);
  });
});
