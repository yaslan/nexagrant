import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { slack } from '../../helpers/timing';
import {
  createPinnedFetch,
  fetchOrganizationSite,
  MAX_ROBOTS_PATTERN_CHARS,
  MAX_ROBOTS_RULES,
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
    'https://localhost./',
    'http://intranet./',
    'http://router.local./',
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
  it('* and $ keep their meaning with the linear matcher', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*/print$\nDisallow: /a*b*c\nAllow: /a*b*c/ok\n');
    expect(robotsAllows(r, '/x/y/print')).toBe(false);
    expect(robotsAllows(r, '/x/y/print/more')).toBe(true);
    expect(robotsAllows(r, '/a-b-c-d')).toBe(false);
    expect(robotsAllows(r, '/a-c-b')).toBe(true);
    expect(robotsAllows(r, '/aXbYc/ok/1')).toBe(true);
    expect(robotsAllows(r, '/acb')).toBe(true);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /$\n'), '/')).toBe(false);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /$\n'), '/a')).toBe(true);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: *\n'), '/anything')).toBe(false);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /a.b(c)+[d]\n'), '/a.b(c)+[d]/x')).toBe(false);
    expect(robotsAllows(parseRobots('User-agent: *\nDisallow: /a.b\n'), '/aXb')).toBe(true);
  });
  it('ReDoS: a hostile pattern (25 stars, 300-char path) finishes within a wall-clock budget', () => {
    const pattern = `/${'a*'.repeat(25)}b`;
    const path = `/${'a'.repeat(299)}`;
    const rules = parseRobots(`User-agent: *\nDisallow: ${pattern}\n`);
    const started = performance.now();
    expect(robotsAllows(rules, path)).toBe(true);
    expect(robotsAllows(rules, `${path}b`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(slack(250));
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
  it('a malformed percent escape in a link does not throw; the raw path is used', () => {
    const html = '<a href="/%E0%A4%A">x</a><a href="/hakkimizda%E0%A4%A">y</a><a href="/iletisim">z</a>';
    const picked = pickSubpages(html, new URL('https://acme.com.tr/')).map((u) => u.pathname);
    expect(picked).toEqual(['/hakkimizda%E0%A4%A', '/iletisim']);
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

describe('fetchOrganizationSite — robots.txt size limits', () => {
  const site = (robots: string) =>
    fakeSite({ 'https://acme.com.tr/robots.txt': { body: robots, type: 'text/plain' }, 'https://acme.com.tr/': { body: '<p>Hi</p>' } });
  it('more rules than the cap, or an over-long pattern, is unreadable: nothing is crawled', async () => {
    const many = site(`User-agent: *\n${Array.from({ length: MAX_ROBOTS_RULES + 1 }, (_, i) => `Disallow: /p${i}`).join('\n')}\n`);
    expect(await fetchOrganizationSite('acme.com.tr', { fetchImpl: many.fetchImpl, lookup: PUBLIC })).toEqual({ ok: false, reason: 'robots_unreadable' });
    expect(many.calls).not.toContain('https://acme.com.tr/');
    const long = site(`User-agent: *\nDisallow: /${'x'.repeat(MAX_ROBOTS_PATTERN_CHARS)}\n`);
    expect(await fetchOrganizationSite('acme.com.tr', { fetchImpl: long.fetchImpl, lookup: PUBLIC })).toEqual({ ok: false, reason: 'robots_unreadable' });
    const atCap = site(`User-agent: *\n${Array.from({ length: MAX_ROBOTS_RULES }, (_, i) => `Disallow: /p${i}`).join('\n')}\n`);
    expect((await fetchOrganizationSite('acme.com.tr', { fetchImpl: atCap.fetchImpl, lookup: PUBLIC })).ok).toBe(true);
  });
});

/**
 * The real transport (node:http with a connect-time address check). The only server is a local one
 * on 127.0.0.1; no request leaves this machine. `connectPort` points the socket at it, and the tests
 * that must reach it allow 127.0.0.1 explicitly — the default guard (public addresses only) refuses it.
 */
describe('pinned transport (connect-time address check)', () => {
  let server: Server | null = null;
  const closeServer = async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server!.close(() => r()));
    }
    server = null;
  };
  afterEach(closeServer);

  async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ port: number; hits: string[] }> {
    const hits: string[] = [];
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      handler(req, res);
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    return { port: (server.address() as AddressInfo).port, hits };
  }

  const LOCAL = async () => ['127.0.0.1'];
  const localOnly = (ip: string) => ip === '127.0.0.1';
  const html = (res: ServerResponse, body: string) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  };
  const notFound = (res: ServerResponse) => {
    res.writeHead(404);
    res.end();
  };

  it('DNS rebinding: the first answer is public, the connection-time answer is private → no request is sent', async () => {
    const { port, hits } = await serve((_req, res) => html(res, '<p>internal</p>'));
    // The pre-check (deps.lookup) sees a public address; the socket's own resolution gets 127.0.0.1.
    const fetchImpl = createPinnedFetch({ resolve: LOCAL, connectPort: port });
    const res = await fetchOrganizationSite('http://acme.com.tr', { lookup: PUBLIC, fetchImpl });
    expect(res).toEqual({ ok: false, reason: 'robots_unreadable' });
    expect(hits).toEqual([]);
  });

  it('a mixed answer (one public, one private) is refused at connect time', async () => {
    const { port, hits } = await serve((_req, res) => html(res, '<p>internal</p>'));
    const fetchImpl = createPinnedFetch({ resolve: async () => ['93.184.216.34', '127.0.0.1'], connectPort: port });
    await expect(fetchImpl(new URL('http://acme.com.tr/'), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/blocked/);
    expect(hits).toEqual([]);
  });

  it('a literal private IP is refused without a lookup', async () => {
    const { port, hits } = await serve((_req, res) => html(res, 'x'));
    const fetchImpl = createPinnedFetch({ resolve: PUBLIC, connectPort: port });
    await expect(fetchImpl(new URL('http://127.0.0.1/'), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/blocked/);
    expect(hits).toEqual([]);
  });

  it('reads a site through the pinned path when the address is allowed', async () => {
    const { port, hits } = await serve((req, res) => {
      if (req.url === '/robots.txt') return notFound(res);
      if (req.url === '/') return html(res, '<title>Acme</title><a href="/hakkimizda">Hakkımızda</a>');
      return html(res, '<p>45 çalışan</p>');
    });
    const res = await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: port });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pages.map((p) => p.url)).toEqual(['http://acme.com.tr/', 'http://acme.com.tr/hakkimizda']);
    expect(hits).toEqual(['/robots.txt', '/', '/hakkimizda']);
  });

  it('follows at most three redirects on the pinned path', async () => {
    const chain = (n: number) => (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/robots.txt') return notFound(res);
      const step = req.url === '/' ? 0 : Number((req.url ?? '').slice(2));
      if (step < n) {
        res.writeHead(302, { location: `/r${step + 1}` });
        res.end();
        return;
      }
      html(res, '<p>end</p>');
    };
    const three = await serve(chain(3));
    const ok = await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: three.port });
    expect(ok.ok).toBe(true);
    await closeServer();
    const four = await serve(chain(4));
    const res = await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: four.port });
    expect(res).toEqual({ ok: false, reason: 'unreachable' });
    expect(four.hits).toEqual(['/robots.txt', '/', '/r1', '/r2', '/r3']);
  });

  it('a body over 1 MB is cut off on the pinned path (streamed, and when content-length says so)', async () => {
    const chunk = '<p>' + 'x'.repeat(64 * 1024) + '</p>';
    const streamed = await serve((req, res) => {
      if (req.url === '/robots.txt') return notFound(res);
      res.writeHead(200, { 'content-type': 'text/html' }); // chunked, no content-length
      for (let i = 0; i < 20; i += 1) res.write(chunk);
      res.end();
    });
    expect(await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: streamed.port })).toEqual({
      ok: false,
      reason: 'unreachable',
    });
    await closeServer();
    const declared = await serve((req, res) => {
      if (req.url === '/robots.txt') return notFound(res);
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': String(2_000_000) });
      res.write('<p>short</p>'); // the declared size alone refuses it
    });
    expect(await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: declared.port })).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('a request that never finishes times out (per-request limit) on the pinned path', async () => {
    const { port } = await serve((req, res) => {
      if (req.url === '/robots.txt') return notFound(res);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<p>start'); // headers sent, the body never ends
    });
    const started = performance.now();
    const res = await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: port, timeoutMs: 300 });
    expect(res).toEqual({ ok: false, reason: 'unreachable' });
    expect(performance.now() - started).toBeLessThan(slack(3000));
  });

  it('the whole read has a total time budget on top of the per-request limit (an in-flight request is cut)', async () => {
    const { port, hits } = await serve((req, res) => {
      if (req.url === '/robots.txt') return notFound(res);
      if (req.url === '/') {
        return html(res, ['/hakkimizda', '/iletisim', '/kurumsal', '/about'].map((h) => `<a href="${h}">${h}</a>`).join(''));
      }
      // Inside the 3 s per-request limit, but past the 600 ms budget.
      const timer = setTimeout(() => html(res, `<p>${req.url}</p>`), 1500);
      res.on('close', () => clearTimeout(timer));
    });
    const started = performance.now();
    const res = await fetchOrganizationSite('http://acme.com.tr', {
      lookup: LOCAL,
      addressAllowed: localOnly,
      connectPort: port,
      timeoutMs: 3000,
      budgetMs: 600,
    });
    const elapsed = performance.now() - started;
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The first sub-page is aborted by the budget mid-request (it would have answered at 1.5 s),
    // the other three are not even requested.
    expect(res.pages.map((p) => p.url)).toEqual(['http://acme.com.tr/']);
    expect(res.skipped).toEqual([
      { url: 'http://acme.com.tr/hakkimizda', reason: 'time_budget' },
      { url: 'http://acme.com.tr/iletisim', reason: 'time_budget' },
      { url: 'http://acme.com.tr/kurumsal', reason: 'time_budget' },
      { url: 'http://acme.com.tr/about', reason: 'time_budget' },
    ]);
    expect(hits).toEqual(['/robots.txt', '/', '/hakkimizda']);
    expect(elapsed).toBeLessThan(slack(1400));
  });
});
