import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { regionOf } from '@/app/[locale]/calls/[region]/regions';
import { publicCallDetailHref } from '@/lib/routes';

/**
 * TASK-MUNWZGWA70P16 (İNCELEME-71 B-1, B-2) — the public /calls routes.
 */
describe('regionOf (B-1)', () => {
  it('knows the listed regions', () => {
    expect(regionOf('germany')?.code).toBe('DE');
    expect(regionOf('turkey')?.code).toBe('TR');
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'GERMANY', 'eu', ''])(
    'has no region for %o, so the page 404s',
    (segment) => {
      expect(regionOf(segment)).toBeUndefined();
    }
  );
});

describe('publicCallDetailHref (B-2)', () => {
  it('sends a signed-in visitor straight to the workspace detail', () => {
    expect(publicCallDetailHref('tr', 'HORIZON-CL5-2026-D4-01', true)).toBe('/tr/default/cagrilar/HORIZON-CL5-2026-D4-01');
    expect(publicCallDetailHref('en', 'HORIZON-CL5-2026-D4-01', true)).toBe('/en/default/calls/HORIZON-CL5-2026-D4-01');
  });

  it('sends anyone else to sign-in with the detail as the return URL', () => {
    expect(publicCallDetailHref('tr', 'HORIZON-CL5-2026-D4-01', false)).toBe(
      '/tr/giris?callbackUrl=%2Ftr%2Fdefault%2Fcagrilar%2FHORIZON-CL5-2026-D4-01'
    );
    const en = new URL(publicCallDetailHref('en', 'HORIZON-CL5-2026-D4-01', false), 'https://x.test');
    expect(en.pathname).toBe('/en/login');
    expect(en.searchParams.get('callbackUrl')).toBe('/en/default/calls/HORIZON-CL5-2026-D4-01');
  });

  it('never points back into the public /calls/[region] route', () => {
    for (const signedIn of [true, false]) {
      for (const locale of ['tr', 'en']) {
        expect(publicCallDetailHref(locale, 'X-1', signedIn)).not.toMatch(new RegExp(`^/${locale}/calls/`));
      }
    }
  });

  it('keeps an odd identifier inside one path segment', () => {
    const href = publicCallDetailHref('en', 'A/B?c=1#d', true);
    expect(href).toBe('/en/default/calls/A%2FB%3Fc%3D1%23d');
    const back = new URL(publicCallDetailHref('en', 'A/B?c=1#d', false), 'https://x.test');
    expect(back.searchParams.get('callbackUrl')).toBe('/en/default/calls/A%2FB%3Fc%3D1%23d');
  });
});

describe('the public call lists use publicCallDetailHref (B-2)', () => {
  const pages = ['src/app/[locale]/calls/page.tsx', 'src/app/[locale]/calls/[region]/page.tsx'];

  it.each(pages)('%s links every card through it, signed-in state included', (file) => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    // The old targets: /calls/<identifier> (the [region] route, 404) and
    // /login?redirect=/dashboard (a parameter nothing reads).
    expect(src).not.toMatch(/href=\{`\/\$\{locale\}\/calls\/\$\{/);
    expect(src).not.toMatch(/login\?redirect=/);
    expect(src).toMatch(/href=\{publicCallDetailHref\(locale, \w+\.identifier, signedIn\)\}/);
    expect(src).toMatch(/const signedIn = Boolean\(\(await auth\(\)\)\?\.user\)/);
  });
});
