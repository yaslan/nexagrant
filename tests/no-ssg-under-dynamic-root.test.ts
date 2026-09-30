import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(REPO_ROOT, 'src/app');

/**
 * TASK-MUNRB2037NA5V (İNCELEME-57 Ö-2) — no page may ask to be prerendered.
 *
 * The root layout reads `cookies()` and `headers()` on every request (the theme,
 * src/app/layout.tsx), and src/proxy.ts puts a fresh CSP nonce on every page that
 * only a dynamic render stamps onto the scripts. So every page is dynamic. A page
 * that exports `generateStaticParams` is still built as SSG (●); Next then renders
 * it as a static page on first request, the layout's `cookies()` throws
 * `DYNAMIC_SERVER_USAGE` and the visitor gets a 500. That is what
 * /[locale]/calls/[region] did for /tr/calls/germany and every other region.
 */
function pageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...pageFiles(full));
    } else if (/^(page|layout)\.(tsx?|jsx?)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

describe('pages under the dynamic root layout', () => {
  it('the root layout is dynamic (the premise of this test)', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/await cookies\(\)/);
  });

  it('none exports generateStaticParams', () => {
    const offenders = pageFiles(APP_DIR)
      .filter((f) => /export\s+(async\s+)?function\s+generateStaticParams|export\s+const\s+generateStaticParams/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(REPO_ROOT, f));
    expect(
      offenders,
      'generateStaticParams makes the route SSG; the root layout reads cookies(), so the page 500s with DYNAMIC_SERVER_USAGE',
    ).toEqual([]);
  });
});
