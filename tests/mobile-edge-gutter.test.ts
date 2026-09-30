import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, test, expect } from 'vitest';

/**
 * TASK-MUNU027UKJ2AD — on a phone the page content sits 2px from the screen edge, everywhere.
 *
 * The gap used to stack: the app `<main>` added 16px, the page root under it another 16–32px
 * (`max-w-6xl mx-auto p-6`), so a card on a 472px screen started 40px in. The gutter now has
 * one source, `--spacing-edge` in `src/app/globals.css` (the `px-edge` utility), and one owner
 * per page:
 *
 * - inside the app and admin shells the layout `<main>` owns it, so a page container there
 *   (`mx-auto max-w-*`) carries no horizontal padding below `sm` — only `sm:`-and-up values;
 * - a layout-less public page has no shell, so its outermost container (`<main>` or
 *   `mx-auto max-w-*`) uses `px-edge` below `sm`.
 *
 * Cards keep their inner padding (it is not the outer edge), so a container that is itself a
 * card — a border or background plus `rounded-*` — is not checked. Only static
 * `className="..."` strings are read; a container built with `cn()` or a template literal is
 * not seen, so write page containers as plain strings.
 */

const ROOT = resolve(__dirname, '..');
const SCAN = ['src/app/[locale]', 'src/components', 'src/lib/modules', 'src/modules'];
const SHELLED = [
  `src/app/[locale]/(app)${sep}`,
  `src/app/[locale]/admin${sep}`,
  `src/lib/modules${sep}`,
  `src/modules${sep}`,
].map((p) => p.split('/').join(sep));
const SHELL_LAYOUTS = ['src/app/[locale]/(app)/layout.tsx', 'src/app/[locale]/admin/layout.tsx'];

/** Full-width bars (site header/footer rows), not page content: their padding is chrome. */
const BARS: Array<[file: string, classFragment: string]> = [
  ['src/components/PublicNavbar.tsx', 'h-18 flex items-center justify-between'],
  ['src/components/PublicFooter.tsx', 'py-16'],
  ['src/app/[locale]/calls/page.tsx', 'py-4 flex justify-between items-center'],
];

const HORIZONTAL = /^(p|px|pl|pr|ps|pe)-(?!0$)\S+$/;
const isCard = (tokens: string[]) =>
  tokens.some((t) => /^rounded(-|$)/.test(t)) &&
  tokens.some((t) => /^(border|bg-(?!gradient|opacity))/.test(t));
const isContainer = (tokens: string[]) =>
  tokens.includes('mx-auto') && tokens.some((t) => t.startsWith('max-w-'));

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

type Hit = { file: string; line: number; className: string };

function containers(): Array<Hit & { shelled: boolean; main: boolean }> {
  const hits: Array<Hit & { shelled: boolean; main: boolean }> = [];
  for (const base of SCAN) {
    for (const full of tsxFiles(join(ROOT, base))) {
      const file = relative(ROOT, full);
      const posix = file.split(sep).join('/');
      if (SHELL_LAYOUTS.includes(posix)) continue;
      const src = readFileSync(full, 'utf8');
      const re = /<(\w+)\b[^<>]*?className="([^"]*)"/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        const tag = m[1] ?? '';
        const className = m[2] ?? '';
        const tokens = className.split(/\s+/).filter(Boolean);
        const main = tag === 'main';
        if (!isContainer(tokens) && !main) continue;
        if (isCard(tokens)) continue;
        if (BARS.some(([f, frag]) => f === posix && className.includes(frag))) continue;
        const line = src.slice(0, m.index).split('\n').length;
        hits.push({ file: posix, line, className, shelled: SHELLED.some((p) => file.startsWith(p)), main });
      }
    }
  }
  return hits;
}

describe('mobile edge gutter (TASK-MUNU027UKJ2AD)', () => {
  const all = containers();

  test('the scan sees the page containers it is meant to police', () => {
    // A regex that silently matched nothing would pass every rule below.
    expect(all.filter((h) => h.shelled).length).toBeGreaterThan(30);
    expect(all.filter((h) => !h.shelled).length).toBeGreaterThan(10);
  });

  test('the gutter token is defined once, as 2px', () => {
    const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
    expect(css.match(/--spacing-edge:\s*([^;]+);/g)).toEqual(['--spacing-edge: 2px;']);
  });

  test.each(SHELL_LAYOUTS)('%s: <main> owns the gutter (px-edge below sm)', (layout) => {
    const src = readFileSync(join(ROOT, layout), 'utf8');
    const main = src.match(/<main\b[^>]*className="([^"]*)"/);
    expect(main, `${layout} has no <main className="...">`).not.toBeNull();
    const tokens = (main?.[1] ?? '').split(/\s+/);
    expect(tokens).toContain('px-edge');
    expect(tokens.filter((t) => HORIZONTAL.test(t) && t !== 'px-edge')).toEqual([]);
  });

  test('inside the app/admin shell a page container adds no horizontal padding below sm', () => {
    const bad = all
      .filter((h) => h.shelled && !h.main)
      .filter((h) => h.className.split(/\s+/).some((t) => HORIZONTAL.test(t)))
      .map((h) => `${h.file}:${h.line}  "${h.className}"`);
    // Fix: move the value behind sm: (px-4 → sm:px-4, p-6 → py-6 sm:px-6).
    expect(bad).toEqual([]);
  });

  test('a layout-less public page pads its outermost container with px-edge below sm', () => {
    const bad = all
      .filter((h) => !h.shelled)
      .filter((h) => h.className.split(/\s+/).some((t) => HORIZONTAL.test(t) && t !== 'px-edge'))
      .map((h) => `${h.file}:${h.line}  "${h.className}"`);
    // Fix: px-4 sm:px-6 → px-edge sm:px-6.
    expect(bad).toEqual([]);
  });
});
