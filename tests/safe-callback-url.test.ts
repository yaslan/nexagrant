import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { safeCallbackUrl } from '@/lib/safe-callback-url';

/**
 * TASK-MUO12A7NHANOT (İNCELEME-76 D-1/D-2). The login page puts this value in
 * `window.location.href`; fe-fb's off-site inputs are the table below.
 */
const FALLBACK = '/tr/default/dashboard';

describe('safeCallbackUrl', () => {
  it.each([
    '/tr/calls/topic/HORIZON-CL5-2026-D4-01',
    '/en/login?x=1#y',
    '/tr/calls/topic/A%2FB%3Fc%3D1%23d',
  ])('keeps the same-origin path %s', (path) => {
    expect(safeCallbackUrl(path, FALLBACK)).toBe(path);
  });

  it.each([
    'https://evil.com/x',
    'HTTPS://EVIL.COM',
    '//evil.com/x',
    '/\\evil.com/x',
    '/\\/evil.com',
    ' //evil.com',
    ' /tr/panel',
    '\t/tr/panel',
    '/tr/\npanel',
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'http://localhost:3476@evil.com/',
    'evil.com',
    '',
    null,
    undefined,
  ])('replaces %o with the fallback', (raw) => {
    expect(safeCallbackUrl(raw as string | null | undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('does not let dot segments collapse back into a protocol-relative URL', () => {
    expect(safeCallbackUrl('/a/../..//evil.com', FALLBACK)).toBe(FALLBACK);
    expect(safeCallbackUrl('/tr/x/../panel', FALLBACK)).toBe('/tr/panel');
  });
});

describe('AuthCard reads callbackUrl only through safeCallbackUrl', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/[locale]/(public)/login/AuthCard.tsx'), 'utf8');

  it('has exactly one read of the query value, and it is filtered', () => {
    expect(src.match(/searchParams\.get\('callbackUrl'\)/g)).toHaveLength(1);
    expect(src).toMatch(/const rawCallbackUrl = safeCallbackUrl\(searchParams\.get\('callbackUrl'\),/);
  });
});
