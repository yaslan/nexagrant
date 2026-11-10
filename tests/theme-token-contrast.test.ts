import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

/**
 * NG-2 — the green/yellow/red status language has to be readable as text. `--ok`, `--amber` and
 * `--bad` are fine as accents in the dark theme, but in the light one they measure 3.77, 3.19 and
 * 4.83 on white and fall further on --ground and on their own tint, so text uses the `-ink` step
 * (the same split as --accent / --accent-ink). `-strong` carries white text (--accent-strong).
 */
function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** The solid colour a `bg-x/15` utility paints over `under`. */
function tint(hex: string, under: string, alpha: number): string {
  const [f, u] = [hexToRgb(hex), hexToRgb(under)];
  return `#${f.map((c, i) => Math.round(c * alpha + (u[i] as number) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

describe.each(Object.entries(themes))('status language contrast (%s)', (_, tokens) => {
  const need = (name: string): string => {
    const value = tokens[name];
    if (!value) throw new Error(`--${name} missing from globals.css`);
    return value;
  };

  describe.each(['ok', 'amber', 'bad'])('--%s-ink', (status) => {
    test.each(['ground', 'surface', 'surface-hover'])('on --%s is at least 4.5:1', (bg) => {
      expect(contrast(need(`${status}-ink`), need(bg))).toBeGreaterThanOrEqual(4.5);
    });

    test.each(['ground', 'surface'])('on its own tint over --%s is at least 4.5:1', (bg) => {
      expect(contrast(need(`${status}-ink`), tint(need(status), need(bg), 0.15))).toBeGreaterThanOrEqual(4.5);
    });
  });

  test.each(['accent-strong', 'bad-strong'])('white on --%s is at least 4.5:1', (fill) => {
    expect(contrast('#ffffff', need(fill))).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * NG-2 (K-576956) — the accent moved to the logo blues. `text-accent` and `text-accent-ink` both paint
 * --accent-ink (--text-color-accent in globals.css), `bg-accent` and `bg-accent-strong` carry white
 * text, and a border or ring only needs the 3:1 of WCAG 1.4.11.
 */
describe.each(Object.entries(themes))('accent contrast (%s)', (_, tokens) => {
  const need = (name: string): string => {
    const value = tokens[name];
    if (!value) throw new Error(`--${name} missing from globals.css`);
    return value;
  };

  test.each(['ground', 'surface', 'surface-hover'])('--accent-ink on --%s is at least 4.5:1', (bg) => {
    expect(contrast(need('accent-ink'), need(bg))).toBeGreaterThanOrEqual(4.5);
  });

  describe.each(['ground', 'surface'])('over --%s', (bg) => {
    test.each([0.1, 0.12, 0.15, 0.2])('--accent-ink on the %s tint of --accent is at least 4.5:1', (alpha) => {
      expect(contrast(need('accent-ink'), tint(need('accent'), need(bg), alpha))).toBeGreaterThanOrEqual(4.5);
    });
  });

  test('white on --accent is at least 4.5:1, since 69 bg-accent call sites carry white text', () => {
    expect(contrast('#ffffff', need('accent'))).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['ground', 'surface', 'surface-hover'])('--accent as a border on --%s is at least 3:1', (bg) => {
    expect(contrast(need('accent'), need(bg))).toBeGreaterThanOrEqual(3);
  });
});

test('text-accent reads the text step, so the fill can stay under white text', () => {
  expect(css).toMatch(/--text-color-accent:\s*var\(--accent-ink\)/);
});

/**
 * NG-63 — the accent colours that were still hard-coded after NG-2 (`#003D5C` on the sign-in and
 * home buttons, `#0369A1` in the survey e-mail, the cyan `#22d3ee` of the cart and pricing pages)
 * are now the token classes. This guard keeps them from coming back in the source.
 */
describe('no hard-coded accent left in src (NG-63)', () => {
  const retired = /003D5C|0369A1|22d3ee|67e8f9/i;
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });

  test('the retired hex values appear in no source file', () => {
    const hits = walk(resolve(__dirname, '../src')).filter((f) => retired.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.replace(/.*\/src\//, 'src/'))).toEqual([]);
  });
});

/**
 * NG-63 (review B1/B2) — a `bg-accent/N` tint that carries `text-accent-ink` must keep AA on the dark
 * card ground. The tint list above stops at /20, so /40–/80 went unchecked and shipped at 2.98–3.94:1.
 * Every alpha is collected from src, so a new tint on a text-accent-ink line is measured too.
 */
describe('accent tint carrying text-accent-ink stays AA on the dark card (NG-63)', () => {
  const darkCard = '#0e182e';
  const dark = themes.dark;
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });
  const alphas = new Set<number>();
  for (const file of walk(resolve(__dirname, '../src'))) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('text-accent-ink')) continue;
      for (const m of line.matchAll(/\bbg-accent\/(\d{1,3})\b/g)) alphas.add(Number(m[1]));
    }
  }

  test('the scan finds at least the known call sites', () => {
    expect(alphas.size).toBeGreaterThan(0);
  });

  test.each([...alphas])('bg-accent/%i with text-accent-ink is at least 4.5:1 on --card', (pct) => {
    const bg = tint(dark.accent as string, darkCard, pct / 100);
    expect(contrast(dark['accent-ink'] as string, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
