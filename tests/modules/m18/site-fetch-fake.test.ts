import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-209 — the in-process fake website the e2e web server reads when `E2E_FAKE_AI=true`.
 *
 * It replaces only the two network edges (DNS answer and HTTP transport). Every guard of
 * fetchOrganizationSite still runs unchanged: URL normalisation, the public-address check on the
 * resolved address, robots.txt, same-site redirects, the page limits. No socket is opened.
 */

const dns = vi.hoisted(() => ({ lookup: vi.fn(async () => { throw new Error('DNS must not be reached'); }) }));
vi.mock('node:dns/promises', () => ({ lookup: dns.lookup, default: { lookup: dns.lookup } }));
const http = vi.hoisted(() => ({ request: vi.fn(() => { throw new Error('http must not be reached'); }) }));
vi.mock('node:http', () => ({ request: http.request, default: { request: http.request } }));
vi.mock('node:https', () => ({ request: http.request, default: { request: http.request } }));

import { FAKE_SITE_ADDRESS, fakeSiteDeps, fetchOrganizationSite, isPublicAddress } from '@/modules/m18/server/site-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fakeSiteDeps', () => {
  it('reads the fake site through the normal reader: robots.txt, homepage and an about page, no network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchOrganizationSite('https://acme-ng209.com.tr', fakeSiteDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages.map((p) => p.url)).toEqual(['https://acme-ng209.com.tr/', 'https://acme-ng209.com.tr/hakkimizda']);
    // robots.txt of the fake site disallows /gizli; the reader obeys it.
    expect(result.skipped).toEqual([{ url: 'https://acme-ng209.com.tr/gizli/hakkimizda', reason: 'robots_disallow' }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dns.lookup).not.toHaveBeenCalled();
    expect(http.request).not.toHaveBeenCalled();
  });

  it('does not loosen the address guard: no allow-list, no port override, and its answer is a public address', () => {
    const deps = fakeSiteDeps();
    expect(deps.addressAllowed).toBeUndefined();
    expect(deps.connectPort).toBeUndefined();
    expect(isPublicAddress(FAKE_SITE_ADDRESS)).toBe(true);
  });

  it('still refuses what the guard refuses (a local address typed as the website)', async () => {
    for (const url of ['http://localhost', 'http://127.0.0.1', 'https://intranet.local', 'https://acme.com.tr:8443']) {
      expect(await fetchOrganizationSite(url, fakeSiteDeps())).toEqual({ ok: false, reason: 'invalid_url' });
    }
  });
});
