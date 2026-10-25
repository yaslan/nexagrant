import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { regionOf } from '@/app/[locale]/(public)/calls/[region]/regions';
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

describe('publicCallDetailHref (B-2, İNCELEME-76 Y-1)', () => {
  it('links the workspace-free route, the same for every visitor', () => {
    expect(publicCallDetailHref('tr', 'HORIZON-CL5-2026-D4-01')).toBe('/tr/calls/topic/HORIZON-CL5-2026-D4-01');
    expect(publicCallDetailHref('en', 'HORIZON-CL5-2026-D4-01')).toBe('/en/calls/topic/HORIZON-CL5-2026-D4-01');
  });

  it('carries no workspace segment — the server picks the workspace, not the link (Y-1)', () => {
    for (const locale of ['tr', 'en']) {
      const href = publicCallDetailHref(locale, 'X-1');
      expect(href).not.toMatch(/\/default\//);
      expect(href.split('/')).toEqual(['', locale, 'calls', 'topic', 'X-1']);
    }
  });

  it('keeps an odd identifier inside one path segment', () => {
    expect(publicCallDetailHref('en', 'A/B?c=1#d')).toBe('/en/calls/topic/A%2FB%3Fc%3D1%23d');
  });
});

describe('the public call lists use publicCallDetailHref (B-2)', () => {
  const pages = ['src/app/[locale]/(public)/calls/page.tsx', 'src/app/[locale]/(public)/calls/[region]/page.tsx'];

  it.each(pages)('%s links every card through it and reads no session', (file) => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    // The old targets: /calls/<identifier> (the [region] route, 404) and
    // /login?redirect=/dashboard (a parameter nothing reads).
    expect(src).not.toMatch(/href=\{`\/\$\{locale\}\/calls\/\$\{/);
    expect(src).not.toMatch(/login\?redirect=/);
    expect(src).toMatch(/href=\{publicCallDetailHref\(locale, \w+\.identifier\)\}/);
    // Y-1: the link no longer depends on the session, so a signed-in branch
    // (İNCELEME-76 N4/N5, `signedIn = … || true` survived) cannot come back.
    expect(src).not.toMatch(/\bauth\(\)|signedIn/);
  });
});
