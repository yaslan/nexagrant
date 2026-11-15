import { describe, expect, it, vi } from 'vitest';
import {
  fetchOrganizationSite,
  htmlToText,
  isPublicAddress,
  MAX_PAGES,
  normaliseSiteUrl,
  parseRobots,
  pickSubpages,
  robotsAllows,
} from '@/modules/m18/server/site-fetch';

/**
 * NG-136 (M18-F5) — the website reader behind enrichment. No network: fetch and DNS are injected.
 */

const PUBLIC = async () => ['93.184.216.34'];

type Route = { status?: number; body?: string; type?: string; location?: string };

function fakeSite(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    const headers: Record<string, string> = { 'content-type': r.type ?? 'text/html; charset=utf-8' };
    if (r.location) headers.location = r.location;
    return new Response(r.body ?? '', { status: r.status ?? 200, headers });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const HOME_HTML = `<html><head><title>Acme</title><script>evil()</script></head><body>
  <h1>Acme Teknoloji A.Ş.</h1><p>Ankara &amp; İzmir</p>
  <a href="/hakkimizda">Hakkımızda</a>
  <a href="/iletisim">İletişim</a>
  <a href="/kurumsal/ekibimiz">Ekibimiz</a>
  <a href="/about-us">About</a>
  <a href="/contact">Contact</a>
  <a href="/private/about">About (private)</a>
  <a href="https://other.example.org/about">Other site</a>
  <a href="/urunler">Ürünler</a>
</body></html>`;

describe('normaliseSiteUrl', () => {
  it('adds https and accepts a plain domain', () => {
    expect(normaliseSiteUrl('acme.com.tr')?.toString()).toBe('https://acme.com.tr/');
  });
  it.each([
    'ftp://acme.com.tr',
    'http://127.0.0.1',
    'http://[::1]/',
    'http://localhost',
    'http://intranet',
    'http://user:pw@acme.com.tr',
    'http://acme.com.tr:8080',
    'http://router.local',
    'javascript:alert(1)',
    '',
  ])('refuses %s', (raw) => {
    expect(normaliseSiteUrl(raw)).toBeNull();
  });
});

describe('isPublicAddress', () => {
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700::1111'])('public: %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    'not-an-ip',
  ])('not public: %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('robots.txt', () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/ok
Disallow: /*.pdf$

User-agent: OtherBot
Disallow: /
`);
  it('applies the * group, longest match wins', () => {
    expect(robotsAllows(rules, '/')).toBe(true);
    expect(robotsAllows(rules, '/private/x')).toBe(false);
    expect(robotsAllows(rules, '/private/ok')).toBe(true);
    expect(robotsAllows(rules, '/a/b.pdf')).toBe(false);
    expect(robotsAllows(rules, '/a/b.pdf?x=1')).toBe(true);
  });
  it('a FonBridgeBot group replaces the * group', () => {
    const ours = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: FonBridgeBot\nDisallow: /secret\n');
    expect(robotsAllows(ours, '/')).toBe(true);
    expect(robotsAllows(ours, '/secret/x')).toBe(false);
  });
  it('an empty Disallow allows everything', () => {
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/anything')).toBe(true);
  });
});

describe('htmlToText and pickSubpages', () => {
  it('drops scripts, decodes entities, keeps the title', () => {
    const text = htmlToText(HOME_HTML);
    expect(text).toContain('Acme Teknoloji A.Ş.');
    expect(text).toContain('Ankara & İzmir');
    expect(text).not.toContain('evil');
  });
  it('picks only same-site about/contact links, at most four', () => {
    const picked = pickSubpages(HOME_HTML, new URL('https://acme.com.tr/')).map((u) => u.pathname);
    expect(picked).toHaveLength(MAX_PAGES - 1);
    expect(picked).not.toContain('/urunler');
    expect(picked.every((p) => !p.includes('other'))).toBe(true);
  });
});

describe('fetchOrganizationSite', () => {
  it('reads the homepage and at most four sub-pages (≤5), skipping what robots.txt disallows', async () => {
    const { fetchImpl, calls } = fakeSite({
      'https://acme.com.tr/robots.txt': { body: 'User-agent: *\nDisallow: /iletisim\n', type: 'text/plain' },
      'https://acme.com.tr/': { body: HOME_HTML },
      'https://acme.com.tr/hakkimizda': { body: '<p>Hakkımızda: 45 çalışan</p>' },
      'https://acme.com.tr/kurumsal/ekibimiz': { body: '<p>Ekip</p>' },
      'https://acme.com.tr/about-us': { body: '<p>About</p>' },
      'https://acme.com.tr/contact': { body: '<p>Contact</p>' },
    });
    const res = await fetchOrganizationSite('acme.com.tr', { fetchImpl, lookup: PUBLIC });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pages.length).toBeLessThanOrEqual(MAX_PAGES);
    expect(res.pages[0]!.url).toBe('https://acme.com.tr/');
    expect(calls).not.toContain('https://acme.com.tr/iletisim');
    expect(res.skipped).toContainEqual({ url: 'https://acme.com.tr/iletisim', reason: 'robots_disallow' });
    // robots.txt + homepage + at most four sub-pages.
    expect(calls.length).toBeLessThanOrEqual(1 + MAX_PAGES);
  });

  it('a site that disallows everything is not read', async () => {
    const { fetchImpl, calls } = fakeSite({
      'https://acme.com.tr/robots.txt': { body: 'User-agent: *\nDisallow: /\n', type: 'text/plain' },
    });
    const res = await fetchOrganizationSite('https://acme.com.tr', { fetchImpl, lookup: PUBLIC });
    expect(res).toEqual({ ok: false, reason: 'robots_disallow' });
    expect(calls).toEqual(['https://acme.com.tr/robots.txt']);
  });

  it('a missing robots.txt (404) allows; an unreadable one (5xx) does not', async () => {
    const missing = fakeSite({ 'https://acme.com.tr/': { body: '<p>Hi</p>' } });
    expect((await fetchOrganizationSite('acme.com.tr', { fetchImpl: missing.fetchImpl, lookup: PUBLIC })).ok).toBe(true);
    const broken = fakeSite({ 'https://acme.com.tr/robots.txt': { status: 503 }, 'https://acme.com.tr/': { body: '<p>Hi</p>' } });
    expect(await fetchOrganizationSite('acme.com.tr', { fetchImpl: broken.fetchImpl, lookup: PUBLIC })).toEqual({ ok: false, reason: 'robots_unreadable' });
    expect(broken.calls).not.toContain('https://acme.com.tr/');
  });

  it('a host that resolves to a private address is never requested', async () => {
    const { fetchImpl, calls } = fakeSite({});
    const res = await fetchOrganizationSite('acme.com.tr', { fetchImpl, lookup: async () => ['10.0.0.5'] });
    expect(res).toEqual({ ok: false, reason: 'blocked_address' });
    expect(calls).toEqual([]);
  });

  it('a redirect off the site (or to a private host) is not followed', async () => {
    const { fetchImpl, calls } = fakeSite({
      'https://acme.com.tr/robots.txt': { status: 404 },
      'https://acme.com.tr/': { status: 302, location: 'http://169.254.169.254/latest/meta-data/' },
    });
    const res = await fetchOrganizationSite('acme.com.tr', { fetchImpl, lookup: PUBLIC });
    expect(res).toEqual({ ok: false, reason: 'unreachable' });
    expect(calls).not.toContain('http://169.254.169.254/latest/meta-data/');
  });

  it('a non-HTML homepage is refused', async () => {
    const { fetchImpl } = fakeSite({ 'https://acme.com.tr/': { body: '%PDF', type: 'application/pdf' } });
    expect(await fetchOrganizationSite('acme.com.tr', { fetchImpl, lookup: PUBLIC })).toEqual({ ok: false, reason: 'no_html' });
  });
});
