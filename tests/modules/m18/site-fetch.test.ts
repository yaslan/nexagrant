import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import type { TLSSocket } from 'node:tls';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { slack } from '../../helpers/timing';
import {
  createPinnedFetch,
  fetchOrganizationSite,
  guardedLookup,
  MAX_ROBOTS_PATTERN_CHARS,
  MAX_ROBOTS_RULES,
  htmlToText,
  isPublicAddress,
  MAX_ANCHORS,
  MAX_PAGES,
  normaliseSiteUrl,
  parseRobots,
  pickSubpages,
  robotsAllows,
  testOnlyPinnedTransport,
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
  // NG-205 (SEC NG-203 B-A1, defence in depth): Teredo 2001::/32 tunnels an IPv4 inside the address,
  // and 192.88.99.0/24 is the deprecated 6to4 relay anycast (RFC 7526). Neither is a website.
  it.each(['2001:0:a00:1::', '2001::1', '2001:0000:4136:e378:8000:63bf:3fff:fdd2', '192.88.99.1'])(
    'not public (tunnel/relay): %s',
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(['2001:4860:4860::8888', '2001:200::1', '192.88.98.1'])('public next to those blocks: %s', (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
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
  it('NG-202 B4: links inside <script>, <template>, <noscript> or a comment are not candidates', () => {
    const html =
      `<script>var nav = '<a href="/hakkimizda">Hakkımızda</a>';</script>` +
      `<!-- <a href="/iletisim">İletişim</a> -->` +
      `<template><a href="/kurumsal">Kurumsal</a></template>` +
      `<noscript><a href="/contact">Contact</a></noscript>` +
      `<a href="/about">About</a>`;
    expect(pickSubpages(html, new URL('https://acme.com.tr/')).map((u) => u.pathname)).toEqual(['/about']);
  });
  it('NG-202 B4: an unclosed <script> hides the links after it, as it hides the text', () => {
    const html = `<a href="/about">About</a><script>var a = 1; <a href="/iletisim">İletişim</a>`;
    expect(htmlToText(html)).toBe('About');
    expect(pickSubpages(html, new URL('https://acme.com.tr/')).map((u) => u.pathname)).toEqual(['/about']);
  });
  // NG-207 F1: comments and hidden elements are found in ONE left-to-right scan. A `<!--` inside a
  // <script> is script text and one inside an attribute value is that value — neither opens a comment,
  // so the visible links and text up to the next `-->` stay.
  it('NG-207 F1: a "<!--" inside a <script> does not hide the visible link after it', () => {
    const html = '<script>var s="<!--";</script><a href="/about">About</a><script>var e="-->";</script>';
    expect(pickSubpages(html, new URL('https://acme.com.tr/')).map((u) => u.pathname)).toEqual(['/about']);
  });
  it('NG-207 F1: a "<!--" inside an attribute value does not hide the links after it', () => {
    const html = '<a href="/about" title="<!--">About</a><a href="/iletisim">İletişim</a><!-- end -->';
    expect(pickSubpages(html, new URL('https://acme.com.tr/')).map((u) => u.pathname)).toEqual(['/about', '/iletisim']);
  });
  it('NG-207 F1: the same "<!--" does not hide visible text either', () => {
    expect(htmlToText('<script>var s="<!--";</script><p>Acme 45 çalışan</p><script>var e="-->";</script>')).toBe('Acme 45 çalışan');
    expect(htmlToText("<p title='<!--'>Acme</p><p>45 çalışan</p><!-- end -->")).toBe('Acme\n45 çalışan');
  });
  it('NG-207 F1: an unclosed comment still hides the links after it; a comment still hides a <script> in it', () => {
    const base = new URL('https://acme.com.tr/');
    expect(pickSubpages('<a href="/about">About</a><!-- <a href="/iletisim">İletişim</a>', base).map((u) => u.pathname)).toEqual(['/about']);
    expect(pickSubpages('<!-- <script> --><a href="/about">About</a>', base).map((u) => u.pathname)).toEqual(['/about']);
    expect(htmlToText('<!-- <script> --><p>Acme</p>')).toBe('Acme');
  });
  // NG-207 F2: a comment ends as a browser ends it — `<!-->` and `<!--->` close at once, `--!>` closes
  // like `-->` — so the visible links after it are not swallowed up to some later `-->`.
  it('NG-207 F2: "<!-->" and "<!--->" are empty comments, not openers', () => {
    const base = new URL('https://acme.com.tr/');
    const paths = (html: string) => pickSubpages(html, base).map((u) => u.pathname);
    expect(paths('<!--><a href="/about">About</a><!--->')).toEqual(['/about']);
    expect(paths('<!---><a href="/about">About</a>')).toEqual(['/about']);
    expect(paths('<!--><a href="/about">About</a><!-- x --><a href="/iletisim">İletişim</a>')).toEqual(['/about', '/iletisim']);
  });
  it('NG-207 F2: "--!>" closes a comment', () => {
    expect(pickSubpages('<!-- a --!><a href="/about">About</a>', new URL('https://acme.com.tr/')).map((u) => u.pathname)).toEqual(['/about']);
  });
  // NG-207 F3: `<!` not followed by `--` (a doctype or a bogus comment) runs to the next `>`; a quoted
  // `<!--` inside it opens no comment.
  it('NG-207 F3: a "<!--" inside a doctype or a "<!x …>" declaration hides nothing', () => {
    const base = new URL('https://acme.com.tr/');
    const paths = (html: string) => pickSubpages(html, base).map((u) => u.pathname);
    expect(paths('<!DOCTYPE html PUBLIC "<!--"><a href="/about">About</a>')).toEqual(['/about']);
    expect(paths('<!x title="<!--"><a href="/about">About</a><a href="/iletisim">İletişim</a>')).toEqual(['/about', '/iletisim']);
  });
  it('picks only same-site about/contact links, at most four', () => {
    const picked = pickSubpages(HOME_HTML, new URL('https://acme.com.tr/')).map((u) => u.pathname);
    expect(picked).toHaveLength(MAX_PAGES - 1);
    expect(picked).not.toContain('/urunler');
    expect(picked.every((p) => !p.includes('other'))).toBe(true);
  });
});

/**
 * NG-136 review (round 3): every HTML pass is a single forward scan. The old regular expressions
 * (`<script…>[\s\S]*?</script>`, `<!--[\s\S]*?-->`, `<title>[\s\S]*?</title>`, `<p\b[^>]*>`,
 * `<[^>]+>` and the anchor's `([\s\S]*?)</a>`) rescanned to the end from every unclosed opening:
 * 1 MB of hostile HTML held the event loop for 5–167 s. The read's time budget only stops I/O, not
 * this CPU work, so the parse itself must be linear.
 */
describe('HTML parsing is linear on hostile input (1 MB, no closing tags)', () => {
  const MB = 1_000_000;
  const fill = (unit: string) => unit.repeat(Math.ceil(MB / unit.length)).slice(0, MB);
  const base = new URL('https://acme.com.tr/');
  const hostile: [string, string][] = [
    ['unclosed <script> many times', fill('<script>x ')],
    ['unclosed <style> / <svg> / <head> mixed', fill('<style>a <svg>b <head>c ')],
    ['unclosed comments', fill('<!-- x ')],
    ['unclosed <title> many times', fill('<title>x ')],
    ['many <a href> with no </a>', fill('<a href=about>about ')],
    ['many <a href="… with no closing quote', fill('<a href="/about ')],
    ['many block tags with no >', fill('<p x ')],
    ['many < with no >', fill('< x ')],
    ['</script candidates with no >', `<script>${fill('</script x ')}`],
    // NG-136 review (round 4, B1): every label window is 2 000 `<` with no `>`; a `<[^>]+>` label
    // strip rescans the window from each `<` (~1 s over 500 anchors).
    ['many <a href> each followed by 2000 < with no >', fill(`<a href="/hakkimizda">${'<'.repeat(2000)}`)],
    // NG-202 (B5): anchors with no about/contact hint are no longer counted, so the whole page is
    // scanned; it must stay linear.
    ['many bare <a> (no href, no hint)', fill('<a>')],
    ['many ordinary closed links (no hint)', fill('<a href=x>x</a>')],
    // NG-207 F1: comments and hidden elements are found in one scan that passes each tag whole (its
    // quoted attribute values included); an unclosed quote must not make it rescan from each later tag.
    ['one unclosed attribute quote, then many <a', `<a x="${fill('<a href=/about>about ')}`],
    ['many "<!--" inside attribute values and scripts', fill('<a href="/about" title="<!--">About</a><script>"<!--"</script>')],
  ];
  it.each(hostile)('%s: htmlToText and pickSubpages finish within the wall-clock budget', (_name, html) => {
    const started = performance.now();
    htmlToText(html);
    const textMs = performance.now() - started;
    const linkStarted = performance.now();
    pickSubpages(html, base);
    const linkMs = performance.now() - linkStarted;
    expect(textMs).toBeLessThan(slack(400));
    expect(linkMs).toBeLessThan(slack(400));
  });

  it('an unclosed <script>/<style>/<noscript>/<template> hides the rest of the page (as a browser does)', () => {
    expect(htmlToText('<p>Acme</p><script>var a = "secret";<p>after</p>')).toBe('Acme');
    expect(htmlToText('<p>Acme</p><STYLE>p{} <p>after')).toBe('Acme');
    expect(htmlToText('<p>Acme</p><!-- never closed <p>after')).toBe('Acme');
  });

  it('an unclosed <head> or <svg> (end tag optional / self-closing) does not hide the page', () => {
    expect(htmlToText('<html><head><title>Acme</title><body><p>45 çalışan</p>')).toBe('Acme\nAcme\n45 çalışan');
    expect(htmlToText('<p>Logo <svg viewBox="0 0 1 1"/> Acme</p>')).toBe('Logo Acme');
  });

  it('a link label is capped and the number of candidate anchors resolved is capped', () => {
    // The label hint is read from a bounded window: a hint 5 000 characters into an unclosed label
    // does not count, one inside the window does.
    const far = `<a href="/x">${'y'.repeat(5000)} about</a>`;
    expect(pickSubpages(far, base)).toEqual([]);
    expect(pickSubpages('<a href="/x">about</a>', base).map((u) => u.pathname)).toEqual(['/x']);
    // Only the first MAX_ANCHORS candidates (an about/contact hint in href or label) are resolved —
    // here another site's about links, each one resolved and refused (NG-202 B5).
    const offsiteAbout = '<a href="https://other.example.org/about">About</a>';
    const many = `${offsiteAbout.repeat(MAX_ANCHORS)}<a href="/hakkimizda">Hakkımızda</a>`;
    expect(pickSubpages(many, base)).toEqual([]);
    const within = `${offsiteAbout.repeat(MAX_ANCHORS - 1)}<a href="/hakkimizda">Hakkımızda</a>`;
    expect(pickSubpages(within, base).map((u) => u.pathname)).toEqual(['/hakkimizda']);
  });

  it('NG-202 B5: an about link after more than MAX_ANCHORS ordinary menu links is still found', () => {
    // A shop menu: product links (same site, no about/contact hint), links to other sites, anchors with
    // no href. None of them can ever be picked, so none of them may use up the anchor budget.
    const products = Array.from({ length: MAX_ANCHORS + 100 }, (_, i) => `<a href="/urun/${i}">Ürün ${i}</a>`).join('');
    const offsite = Array.from({ length: 50 }, (_, i) => `<a href="https://other${i}.example.org/">Partner</a>`).join('');
    const bare = '<a name="top">Top</a>'.repeat(50);
    const html = `${products}${offsite}${bare}<a href="/hakkimizda">Hakkımızda</a><a href="/iletisim">İletişim</a>`;
    expect(pickSubpages(html, base).map((u) => u.pathname)).toEqual(['/hakkimizda', '/iletisim']);
  });
});

describe('htmlToText and pickSubpages — same output as before on ordinary HTML', () => {
  const base = new URL('https://acme.com.tr/');
  // Expected values were produced by the previous (regular-expression) implementation.
  it.each([
    [
      '<!DOCTYPE html><HTML><HEAD><TITLE>Acme &amp; Co</TITLE><style>p{color:red}</style></HEAD><BODY><H1>Acme</H1><P>Line&nbsp;one<br/>Line two</P><!-- note --><div>a &lt; b &#252; &#x15F;</div></BODY></HTML>',
      'Acme & Co\nAcme\nLine one\nLine two\na < b ü ş',
    ],
    [
      '<header><nav>Menü</nav></header><section><p>Ar-Ge <b>merkezi</b>, 45 çalışan</p><noscript>JS kapalı</noscript></section><template><p>gizli</p></template><footer>İletişim: info@acme.com.tr</footer>',
      'Menü\nAr-Ge merkezi , 45 çalışan\nİletişim: info@acme.com.tr',
    ],
    [
      '<pre>kod</pre><track src=x><link rel=x><p class="a>b">metin</p><svg><text>logo</text></svg><script type="x">if (a<b) {}</script ><script>x</scriptx>y</script>son',
      'kod\nb">metin son',
    ],
    ['<p>a</p><>b<p>c', 'a <>b\nc'],
    ['', ''],
  ])('htmlToText(%j)', (html, expected) => {
    expect(htmlToText(html)).toBe(expected);
  });

  it.each([
    [
      '<a href="/hakkimizda">Hakkımızda</a><A HREF=\'/iletisim\'>İletişim</A><a class="x" href=/kurumsal/ekibimiz title="t">Ekibimiz</a><a href="/urunler">Ürünler</a>',
      ['/hakkimizda', '/iletisim', '/kurumsal/ekibimiz'],
    ],
    [
      '<a href="/x"><span>About</span> us</a><a href="https://www.acme.com.tr/contact#form">c</a><a href="mailto:a@b.c">contact</a><a href="/about.pdf">about</a><abbr href="/about">no</abbr>',
      ['/x', '/contact'],
    ],
    ['<a href="/team?x=1">t</a><a href="/team">t</a><a href = "/profil" >p</a>', ['/team', '/profil']],
  ])('pickSubpages(%j)', (html, expected) => {
    expect(pickSubpages(html, base).map((u) => u.pathname)).toEqual(expected);
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

  it('NG-202 B6: the exported createPinnedFetch takes no connect port — the socket goes to the URL\'s own port', async () => {
    const { port, hits } = await serve((_req, res) => html(res, 'x'));
    const opts = { resolve: LOCAL, allowed: localOnly, connectPort: port };
    const fetchImpl = createPinnedFetch(opts);
    await fetchImpl(new URL('http://acme.com.tr/'), { headers: {}, signal: AbortSignal.timeout(2000) }).catch(() => null);
    expect(hits).toEqual([]);
  });

  it('DNS rebinding: the first answer is public, the connection-time answer is private → no request is sent', async () => {
    const { port, hits } = await serve((_req, res) => html(res, '<p>internal</p>'));
    // The pre-check (deps.lookup) sees a public address; the socket's own resolution gets 127.0.0.1.
    const fetchImpl = testOnlyPinnedTransport({ resolve: LOCAL, connectPort: port });
    const res = await fetchOrganizationSite('http://acme.com.tr', { lookup: PUBLIC, fetchImpl });
    expect(res).toEqual({ ok: false, reason: 'robots_unreadable' });
    expect(hits).toEqual([]);
  });

  it('a mixed answer (one public, one private) is refused at connect time', async () => {
    const { port, hits } = await serve((_req, res) => html(res, '<p>internal</p>'));
    const fetchImpl = testOnlyPinnedTransport({ resolve: async () => ['93.184.216.34', '127.0.0.1'], connectPort: port });
    await expect(fetchImpl(new URL('http://acme.com.tr/'), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/blocked/);
    expect(hits).toEqual([]);
  });

  it('a literal private IP is refused without a lookup', async () => {
    const { port, hits } = await serve((_req, res) => html(res, 'x'));
    const fetchImpl = testOnlyPinnedTransport({ resolve: PUBLIC, connectPort: port });
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

  it('a body refused on its declared size is closed at once (the socket does not wait for the timeout)', async () => {
    let closedAt = 0;
    const { port } = await serve((req, res) => {
      if (req.url === '/robots.txt') return notFound(res);
      res.on('close', () => {
        closedAt = performance.now();
      });
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': String(2_000_000) });
      res.write('<p>short</p>'); // never ends: only our side can close it before the timeout
    });
    const started = performance.now();
    const res = await fetchOrganizationSite('http://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, connectPort: port, timeoutMs: 5000 });
    expect(res).toEqual({ ok: false, reason: 'unreachable' });
    await vi.waitFor(() => expect(closedAt).toBeGreaterThan(0), { timeout: slack(1500), interval: 20 });
    expect(closedAt - started).toBeLessThan(slack(1500));
  });

  it('a response header the Headers class refuses rejects the request (nothing throws out of the response callback)', async () => {
    const { port } = await serve((_req, res) => html(res, 'x'));
    class RefusingHeaders extends Headers {
      override append(): void {
        throw new TypeError('invalid header value');
      }
    }
    vi.stubGlobal('Headers', RefusingHeaders);
    try {
      const fetchImpl = testOnlyPinnedTransport({ resolve: LOCAL, allowed: localOnly, connectPort: port });
      await expect(fetchImpl(new URL('http://acme.com.tr/'), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/invalid header value/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('guardedLookup never leaves an unhandled rejection', () => {
  it('a guard that throws becomes the lookup error', async () => {
    const lookup = guardedLookup(PUBLIC, () => {
      throw new Error('guard broke');
    });
    const error = await new Promise<Error | null>((r) => lookup('acme.com.tr', {}, (e) => r(e)));
    expect(error?.message).toBe('guard broke');
  });

  it('a resolver that throws synchronously becomes the lookup error', async () => {
    const lookup = guardedLookup(() => {
      throw new Error('resolver broke');
    }, isPublicAddress);
    const error = await new Promise<Error | null>((r) => lookup('acme.com.tr', {}, (e) => r(e)));
    expect(error?.message).toBe('resolver broke');
  });

  it('a callback that throws after the answer is called once and leaves no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const lookup = guardedLookup(PUBLIC, isPublicAddress);
      let calls = 0;
      lookup('acme.com.tr', {}, () => {
        calls += 1;
        throw new Error('socket side broke');
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(calls).toBe(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

/**
 * IPv4 spellings the WHATWG URL parser rewrites to dotted form (decimal, hex, octal, short forms) and
 * v4-mapped IPv6: none reaches a socket. No server is contacted: each is refused before a connection.
 */
describe('IP address spellings are refused', () => {
  const spellings = [
    'http://2130706433/', // 127.0.0.1 in decimal
    'http://0x7f000001/', // hex
    'http://0177.0.0.1/', // octal
    'http://017700000001/', // octal, one number
    'http://127.1/', // short form
    'http://0x7f.1/',
    'http://0/', // 0.0.0.0
    'http://10.1/', // 10.0.0.1
    'http://3232235777/', // 192.168.1.1
    'http://0xa9fea9fe/', // 169.254.169.254 (cloud metadata)
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::]/',
  ];
  it.each(spellings)('normaliseSiteUrl refuses %s', (raw) => {
    expect(normaliseSiteUrl(raw)).toBeNull();
  });
  it.each(spellings)('the pinned transport refuses %s before connecting', async (raw) => {
    const resolve = vi.fn(PUBLIC);
    const fetchImpl = createPinnedFetch({ resolve });
    await expect(fetchImpl(new URL(raw), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/blocked/);
    expect(resolve).not.toHaveBeenCalled();
  });
});

/**
 * The https path through the pinned transport, against a local server on 127.0.0.1 with a
 * certificate made for this run (openssl, a temp directory, deleted afterwards). Nothing leaves the
 * machine. Skipped (with the reason in the name) where no openssl binary exists.
 */
const OPENSSL = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;
describe.skipIf(!OPENSSL)('pinned transport over https (local self-signed server; skipped without openssl)', () => {
  let tls: { key: string; cert: string } | null = null;
  let server: HttpsServer | null = null;
  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server!.close(() => r()));
    }
    server = null;
  });

  function certificate(): { key: string; cert: string } {
    if (tls) return tls;
    const dir = mkdtempSync(join(tmpdir(), 'm18-tls-'));
    try {
      const made = spawnSync(
        'openssl',
        ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=acme.com.tr',
          '-addext', 'subjectAltName=DNS:acme.com.tr,DNS:www.acme.com.tr', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')],
        { encoding: 'utf8' },
      );
      if (made.status !== 0) throw new Error(`openssl failed: ${made.stderr}`);
      tls = { key: readFileSync(join(dir, 'key.pem'), 'utf8'), cert: readFileSync(join(dir, 'cert.pem'), 'utf8') };
      return tls;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async function serveTls(handler: (req: IncomingMessage, res: ServerResponse) => void) {
    const { key, cert } = certificate();
    const seen: { url: string; host: string; servername: string }[] = [];
    let connections = 0;
    server = createHttpsServer({ key, cert }, (req, res) => {
      seen.push({ url: req.url ?? '', host: req.headers.host ?? '', servername: String((req.socket as TLSSocket).servername) });
      handler(req, res);
    });
    server.on('connection', () => {
      connections += 1;
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    return { port: (server.address() as AddressInfo).port, cert, seen, connections: () => connections };
  }

  const LOCAL = async () => ['127.0.0.1'];
  const localOnly = (ip: string) => ip === '127.0.0.1';

  it('NG-202 B6: the exported createPinnedFetch takes no CA — a caller cannot swap the system trust store', async () => {
    const { port, cert, seen } = await serveTls((_req, res) => res.end('x'));
    // A plain object (not a literal), as a future caller holding an options bag would pass it.
    const opts = { resolve: LOCAL, allowed: localOnly, ca: cert };
    const fetchImpl = createPinnedFetch(opts);
    await expect(fetchImpl(new URL(`https://acme.com.tr:${port}/`), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(
      /self[- ]signed|certificate/i,
    );
    expect(seen).toEqual([]);
  });

  it('reads a site over https: SNI and Host carry the site name, the certificate is checked against it', async () => {
    const { port, cert, seen } = await serveTls((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(req.url === '/' ? '<title>Acme</title><a href="/hakkimizda">Hakkımızda</a>' : '<p>45 çalışan</p>');
    });
    const fetchImpl = testOnlyPinnedTransport({ resolve: LOCAL, allowed: localOnly, connectPort: port, ca: cert });
    const res = await fetchOrganizationSite('https://acme.com.tr', { lookup: LOCAL, addressAllowed: localOnly, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pages.map((p) => p.url)).toEqual(['https://acme.com.tr/', 'https://acme.com.tr/hakkimizda']);
    expect(seen.map((s) => s.url)).toEqual(['/robots.txt', '/', '/hakkimizda']);
    // SNI is the name, never the IP the socket connected to. Host carries the test port because the
    // socket is pointed at a non-default port (connectPort); without it Host is the bare name.
    expect(seen.every((s) => s.servername === 'acme.com.tr')).toBe(true);
    expect(seen.every((s) => s.host === `acme.com.tr:${port}`)).toBe(true);
  });

  it('DNS rebinding over https: a private connect-time answer is refused before the TLS handshake', async () => {
    const { port, cert, seen, connections } = await serveTls((_req, res) => res.end('internal'));
    const fetchImpl = testOnlyPinnedTransport({ resolve: LOCAL, connectPort: port, ca: cert }); // default guard: public only
    await expect(fetchImpl(new URL('https://acme.com.tr/'), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/blocked/);
    expect(connections()).toBe(0);
    expect(seen).toEqual([]);
  });

  it('a certificate that does not name the site is refused (verification uses the URL host)', async () => {
    const { port, cert, seen } = await serveTls((_req, res) => res.end('x'));
    const fetchImpl = testOnlyPinnedTransport({ resolve: LOCAL, allowed: localOnly, connectPort: port, ca: cert });
    await expect(fetchImpl(new URL('https://other.com.tr/'), { headers: {}, signal: AbortSignal.timeout(2000) })).rejects.toThrow(/altnames|does not match|Hostname/i);
    expect(seen).toEqual([]);
  });
});

describe('NG-202 B6: the test-only transport stays out of src/', () => {
  it('no source file other than site-fetch.ts uses testOnlyPinnedTransport, and site-fetch.ts does not call it', () => {
    const root = join(__dirname, '../../../src');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
      });
    const users = walk(root).filter((file) => readFileSync(file, 'utf8').includes('testOnlyPinnedTransport'));
    expect(users.map((f) => f.slice(root.length + 1).split(sep).join('/'))).toEqual(['modules/m18/server/site-fetch.ts']);
    const own = readFileSync(join(root, 'modules/m18/server/site-fetch.ts'), 'utf8');
    // Its declaration only: the production paths build the transport without it.
    expect(own.match(/testOnlyPinnedTransport/g)).toHaveLength(1);
  });
});
