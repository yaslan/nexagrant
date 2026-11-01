import { describe, expect, test } from 'vitest';
import { generateR2ObjectKey, tenantObjectKeyOf } from '@/lib/storage';

/**
 * TASK-MUN80W2VFY56R (Y-4 of the TASK-MUN66T2HM4A4E scan) — the only keys a
 * tenant may record on an evidence row or delete from the store are its own.
 * The live half (two tenants, real rows, real `.dev-objects` files) is
 * tests/evidence-object-key.live.test.ts.
 */

const A = 'cmtenantaaaaaaaaaaaaaaaaa';
const B = 'cmtenantbbbbbbbbbbbbbbbbb';

describe('tenantObjectKeyOf', () => {
  test('accepts a key under the tenant prefix, and a URL whose path is one', () => {
    const key = `${A}/org-default/certificate/2026/1a2b3c4d_iso_9001.pdf`;
    expect(tenantObjectKeyOf(A, key)).toBe(key);
    expect(tenantObjectKeyOf(A, `https://files.example.com/${key}`)).toBe(key);
  });

  test.each([
    ['another tenant', `${B}/org-default/certificate/2026/x.pdf`],
    ['a tenant id that only starts the same', `${A}x/org-default/x.pdf`],
    ['the bare tenant id', A],
    ['the tenant prefix alone', `${A}/`],
    ['a dot-dot segment', `${A}/../${B}/org-default/x.pdf`],
    ['a trailing dot-dot', `${A}/org-default/..`],
    ['a dot segment', `${A}/./x.pdf`],
    ['an empty segment', `${A}//x.pdf`],
    ['a leading slash', `/${A}/x.pdf`],
    ['percent-encoded dots', `${A}/%2e%2e/${B}/x.pdf`],
    ['upper-case percent-encoding', `${A}/%2E%2E/${B}/x.pdf`],
    ['a backslash', `${A}/..\\${B}\\x.pdf`],
    ['a space', `${A}/a b.pdf`],
    ['a NUL byte', `${A}/x.pdf\u0000`],
    ['a URL into another tenant', `https://files.example.com/${B}/x.pdf`],
    ['a URL that climbs out', `https://files.example.com/${A}/%2e%2e/${B}/x.pdf`],
    ['a non-http URL', `file:///${A}/x.pdf`],
    ['an empty string', ''],
    ['a key over 1024 chars', `${A}/${'a'.repeat(1100)}`],
  ])('refuses %s', (_label, key) => {
    expect(tenantObjectKeyOf(A, key)).toBeNull();
  });

  test.each([undefined, null, 42, {}, ['x']])('refuses a non-string key (%s)', (key) => {
    expect(tenantObjectKeyOf(A, key)).toBeNull();
  });

  test('refuses when the tenant id itself is unusable', () => {
    expect(tenantObjectKeyOf('', '/x.pdf')).toBeNull();
    expect(tenantObjectKeyOf('..', '../x.pdf')).toBeNull();
    expect(tenantObjectKeyOf('a/b', 'a/b/x.pdf')).toBeNull();
  });
});

describe('generateR2ObjectKey', () => {
  test('keeps every client-typed part inside the tenant prefix', () => {
    for (const [category, fileName] of [
      ['certificate', 'ISO 9001.pdf'],
      ['../../x', '../../../etc/passwd'],
      ['cat', `x./../../${B}/secret`],
      ['cat', 'x.%2e%2e'],
      ['cat', 'no-extension'],
      ['cat', '.'],
    ] as const) {
      const key = generateR2ObjectKey(A, 'org-default', category, fileName);
      expect(tenantObjectKeyOf(A, key), `${category} / ${fileName} → ${key}`).toBe(key);
      expect(key.split('/')).toHaveLength(5);
    }
  });

  test('refuses to build a key for an unusable tenant id', () => {
    expect(() => generateR2ObjectKey('..', 'org-default', 'c', 'x.pdf')).toThrow();
  });
});
