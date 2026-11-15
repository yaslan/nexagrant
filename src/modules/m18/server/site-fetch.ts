import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

/**
 * M18-F5 (NG-136) — reads a client organisation's OWN public website for the enrichment proposal.
 *
 * Polite and bounded:
 *  - robots.txt is obeyed (user agent "FonBridgeBot", else the `*` group). A missing robots.txt
 *    (404/410) allows; any other failure to read it (5xx, timeout, network) disallows — when we
 *    cannot tell, we do not crawl.
 *  - at most MAX_PAGES (5) pages: the homepage plus up to four same-site links that look like
 *    "about / contact / corporate" pages.
 *  - text/html only, a byte cap per page, a timeout per request, a total time budget for the whole
 *    read, a character cap on the text.
 *  - robots.txt patterns are matched without regular expressions (linear, no backtracking), and a
 *    robots.txt with more than MAX_ROBOTS_RULES rules or a longer pattern than
 *    MAX_ROBOTS_PATTERN_CHARS counts as unreadable (NG-136 review: a remote robots.txt must not be
 *    able to hold the event loop).
 *
 * SSRF: the address is tenant-typed, and the request leaves our server. Only http(s) on the default
 * port, no credentials in the URL, the host must resolve to public addresses only (loopback,
 * private, link-local, CGNAT, multicast, reserved, ULA … are refused), redirects are followed by
 * hand (≤3) and each hop is checked again and must stay on the same site (host or its www twin).
 * DNS rebinding: the request goes through node:http(s) with a `lookup` hook (`createPinnedFetch`),
 * so the addresses are checked again at connect time, on the very answer the socket connects to; an
 * answer that changed to a private address after the pre-check is refused before any byte is sent.
 *
 * Every network edge is injectable (`SiteFetchDeps`) so the tests run with no outside network.
 */

export const MAX_PAGES = 5;
export const USER_AGENT = 'FonBridgeBot/1.0 (+client record enrichment; obeys robots.txt)';
const ROBOTS_AGENT = 'fonbridgebot';
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
/** The whole read (robots.txt, homepage, sub-pages, every redirect hop) ends within this. */
const BUDGET_MS = 25_000;
export const MAX_PAGE_CHARS = 6_000;
export const MAX_TOTAL_CHARS = 20_000;
export const MAX_ROBOTS_RULES = 200;
export const MAX_ROBOTS_PATTERN_CHARS = 256;

export type LookupFn = (host: string) => Promise<string[]>;
export type AddressGuard = (ip: string) => boolean;
/** The one request shape guardedGet makes; the global `fetch` satisfies it (fake sites in tests). */
export type FetchLike = (url: URL, init: { headers: Record<string, string>; signal: AbortSignal; redirect?: 'manual' }) => Promise<Response>;
export type SiteFetchDeps = {
  fetchImpl?: FetchLike;
  lookup?: LookupFn;
  timeoutMs?: number;
  budgetMs?: number;
  /** Test seam: which resolved addresses the connect-time check accepts. Default: public only. */
  addressAllowed?: AddressGuard;
  /** Test seam: the port the socket connects to (a local test server). Default: the URL's own. */
  connectPort?: number;
};
type ResolvedDeps = { fetchImpl: FetchLike; lookup: LookupFn; timeoutMs: number; budget: AbortSignal };

export type FetchedPage = { url: string; text: string };
export type SiteFetchResult =
  | { ok: true; pages: FetchedPage[]; skipped: { url: string; reason: string }[] }
  | { ok: false; reason: 'invalid_url' | 'blocked_address' | 'robots_disallow' | 'robots_unreadable' | 'unreachable' | 'no_html' };

const defaultLookup: LookupFn = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

// ── URL and address guard ────────────────────────────────────────────────────

/** Normalises what a user typed ("example.com.tr", "https://x.tr/a") to a site URL, or null. */
export function normaliseSiteUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  // A trailing dot ("localhost.", "acme.com.tr.") is the same name; checked without it.
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host) return null;
  url.hostname = host;
  // A bare IP, a single-label name or a reserved-for-local suffix is not a public website.
  if (isIP(host.replace(/^\[|\]$/g, '')) !== 0) return null;
  if (!host.includes('.') || /\.(localhost|local|internal|lan|home|arpa|test|invalid|example)$/.test(host)) return null;
  url.hash = '';
  return url;
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : null;
}

/** True only for a globally routable unicast address. */
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false; // 192.0.0/24 + 192.0.2/24 (TEST-NET-1)
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false; // benchmarking, TEST-NET-2
    if (a === 203 && b === 0) return false; // TEST-NET-3
    return true;
  }
  if (isIP(ip) !== 6) return false;
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPublicAddress(mapped[1]!);
  if (lower === '::' || lower === '::1') return false;
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // ULA fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (lower.startsWith('2001:db8') || lower.startsWith('64:ff9b') || lower.startsWith('2002:')) return false;
  return (first & 0xe000) === 0x2000; // global unicast 2000::/3 only
}

async function hostIsAllowed(host: string, lookup: LookupFn, allowed: AddressGuard): Promise<boolean> {
  try {
    const addresses = await lookup(host);
    return addresses.length > 0 && addresses.every(allowed);
  } catch {
    return false;
  }
}

// ── Pinned transport: the address check at connect time ─────────────────────

class BlockedAddressError extends Error {
  readonly code = 'EBLOCKEDADDRESS';
  constructor(host: string) {
    super(`blocked address for ${host}`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * A `net` lookup hook: resolves with `resolve`, refuses unless EVERY address passes `allowed`, and
 * hands the socket exactly the addresses it checked. node:http calls it for each connection, so the
 * check runs on the answer the socket really uses (DNS rebinding, NG-136 review).
 */
export function guardedLookup(resolve: LookupFn, allowed: AddressGuard): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || !addresses.every(allowed)) {
          callback(new BlockedAddressError(hostname), '', 0);
          return;
        }
        const entries: LookupAddress[] = addresses
          .map((address) => ({ address, family: isIP(address) }))
          .filter((e) => e.family !== 0 && (!options.family || options.family === e.family));
        const first = entries[0];
        if (!first) {
          callback(new BlockedAddressError(hostname), '', 0);
          return;
        }
        if (options.all) callback(null, entries);
        else callback(null, first.address, first.family);
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), '', 0),
    );
  };
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * GET over node:http(s) whose every connection goes through {@link guardedLookup}. No connection
 * pooling (`agent: false`): a pooled socket would skip the lookup. Redirects are never followed here
 * (guardedGet follows them by hand); the body arrives as a stream, so readCapped's byte cap and the
 * abort signal (per-request timeout + total budget) apply to it as they did to `fetch`.
 */
export function createPinnedFetch(opts: { resolve: LookupFn; allowed?: AddressGuard; connectPort?: number }): FetchLike {
  const allowed = opts.allowed ?? isPublicAddress;
  const lookup = guardedLookup(opts.resolve, allowed);
  return (url, init) =>
    new Promise<Response>((resolveResponse, reject) => {
      const literal = url.hostname.replace(/^\[|\]$/g, '');
      // An IP literal never reaches a lookup hook: check it here.
      if (isIP(literal) !== 0 && !allowed(literal)) {
        reject(new BlockedAddressError(literal));
        return;
      }
      const send = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : null;
      if (!send) {
        reject(new Error(`unsupported protocol ${url.protocol}`));
        return;
      }
      const req = send(
        url,
        {
          method: 'GET',
          headers: init.headers,
          signal: init.signal,
          lookup,
          agent: false,
          ...(opts.connectPort ? { port: opts.connectPort } : {}),
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const headers = new Headers();
          for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) headers.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
          try {
            if (NULL_BODY_STATUSES.has(status) || status < 200) {
              res.resume();
              resolveResponse(new Response(null, { status: status < 200 ? 502 : status, headers }));
              return;
            }
            const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
            resolveResponse(new Response(body, { status, headers }));
          } catch (e) {
            res.destroy();
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        },
      );
      req.on('error', reject);
      req.end();
    });
}

/** Same site: the same host, or the host and its `www.` twin. */
export function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '');
  return strip(a.hostname) === strip(b.hostname);
}

// ── robots.txt ───────────────────────────────────────────────────────────────

type RobotsRule = { allow: boolean; pattern: string };

/** The rules that apply to us: the FonBridgeBot group if there is one, else `*`. */
export function parseRobots(body: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow allows everything: it adds no rule.
      if (value) current.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && ROBOTS_AGENT.startsWith(a)));
  const chosen = ours.length > 0 ? ours : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/**
 * RFC 9309 matching without a regular expression: `*` is any run of characters, a final `$` anchors
 * the end, everything else is literal; without `$` the pattern is a prefix (an implicit trailing
 * `*`). Iterative wildcard matching that only ever returns to the LAST star: O(pattern × path) in
 * the worst case, no exponential backtracking (NG-136 review: 8 stars on a 60-char path held the
 * regex engine for 73 s).
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const p = anchored ? pattern.slice(0, -1) : `${pattern}*`;
  let pi = 0;
  let si = 0;
  let star = -1; // index in p of the last `*` seen
  let mark = 0; // path index that star is currently standing in for, up to
  while (si < path.length) {
    if (pi < p.length && p[pi] !== '*' && p[pi] === path[si]) {
      pi += 1;
      si += 1;
    } else if (pi < p.length && p[pi] === '*') {
      star = pi;
      mark = si;
      pi += 1;
    } else if (star !== -1) {
      pi = star + 1;
      mark += 1;
      si = mark;
    } else {
      return false;
    }
  }
  while (pi < p.length && p[pi] === '*') pi += 1;
  return pi === p.length;
}

/** False when a robots.txt is too big to evaluate cheaply; the caller then treats it as unreadable. */
export function robotsWithinLimits(rules: RobotsRule[]): boolean {
  return rules.length <= MAX_ROBOTS_RULES && rules.every((r) => r.pattern.length <= MAX_ROBOTS_PATTERN_CHARS);
}

/** Longest matching rule wins; on a tie Allow wins; no match allows (RFC 9309). */
export function robotsAllows(rules: RobotsRule[], pathWithQuery: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, pathWithQuery)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Visible text of a page, whitespace collapsed, capped. */
export function htmlToText(html: string, maxChars = MAX_PAGE_CHARS): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6]|tr|section|article|footer|header)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(`${title}\n${body}`)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

const LINK_HINT =
  /(about|hakkimizda|hakkinda|hakkımızda|kurumsal|corporate|company|biz-kimiz|kimiz|who-we-are|contact|iletisim|iletişim|team|ekibimiz|profil|profile)/i;

/** The decoded path, or the raw one when its percent escapes are malformed (URIError). */
function safeDecodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** Up to `limit` same-site links whose path or text looks like an about/contact page. */
export function pickSubpages(html: string, base: URL, limit = MAX_PAGES - 1): URL[] {
  const picked: URL[] = [];
  const seen = new Set<string>([base.origin + base.pathname]);
  const anchor = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = anchor.exec(html); m && picked.length < limit; m = anchor.exec(html)) {
    const href = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
    const label = m[4]!.replace(/<[^>]+>/g, ' ');
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (url.username || url.password || url.port || !sameSite(url, base)) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|mp4|svg)$/i.test(url.pathname)) continue;
    if (!LINK_HINT.test(safeDecodePath(url.pathname)) && !LINK_HINT.test(label)) continue;
    url.hash = '';
    url.search = '';
    const key = url.origin + url.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(url);
  }
  return picked;
}

// ── Network ──────────────────────────────────────────────────────────────────

type Hop = { status: number; url: URL; body: string | null; contentType: string };

async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BYTES) return null;
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** GET with the guard applied to the first URL and to every redirect hop. Null = refused/failed. */
async function guardedGet(
  start: URL,
  origin: URL,
  deps: ResolvedDeps & { addressAllowed: AddressGuard },
  allowed: (u: URL) => boolean = () => true,
): Promise<Hop | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (deps.budget.aborted) return null;
    if (!sameSite(url, origin) || url.username || url.password || url.port) return null;
    if (hop > 0 && !allowed(url)) return null; // a redirect into a disallowed path is not followed
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!(await hostIsAllowed(url.hostname, deps.lookup, deps.addressAllowed))) return null;
    let response: Response;
    try {
      response = await deps.fetchImpl(url, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9' },
        // Per-request limit and the read's total budget, whichever ends first; the body read below
        // runs under the same signal.
        signal: AbortSignal.any([AbortSignal.timeout(deps.timeoutMs), deps.budget]),
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) return null;
      try {
        url = new URL(location, url);
      } catch {
        return null;
      }
      continue;
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const body = await readCapped(response).catch(() => null);
    return { status: response.status, url, body, contentType };
  }
  return null;
}

/** Fetches up to MAX_PAGES pages of one organisation's website, obeying its robots.txt. */
export async function fetchOrganizationSite(rawUrl: string, deps: SiteFetchDeps = {}): Promise<SiteFetchResult> {
  const lookup = deps.lookup ?? defaultLookup;
  const addressAllowed = deps.addressAllowed ?? isPublicAddress;
  const d = {
    fetchImpl: deps.fetchImpl ?? createPinnedFetch({ resolve: lookup, allowed: addressAllowed, connectPort: deps.connectPort }),
    lookup,
    addressAllowed,
    timeoutMs: deps.timeoutMs ?? TIMEOUT_MS,
    budget: AbortSignal.timeout(deps.budgetMs ?? BUDGET_MS),
  };
  const home = normaliseSiteUrl(rawUrl);
  if (!home) return { ok: false, reason: 'invalid_url' };
  if (!(await hostIsAllowed(home.hostname, d.lookup, d.addressAllowed))) return { ok: false, reason: 'blocked_address' };

  const robots = await guardedGet(new URL('/robots.txt', home), home, d);
  let rules: RobotsRule[] = [];
  if (robots && robots.status >= 200 && robots.status < 300 && robots.body !== null) {
    rules = parseRobots(robots.body);
    if (!robotsWithinLimits(rules)) return { ok: false, reason: 'robots_unreadable' };
  } else if (!robots || !(robots.status === 404 || robots.status === 410)) {
    return { ok: false, reason: 'robots_unreadable' };
  }
  const allowed = (u: URL) => robotsAllows(rules, u.pathname + u.search);
  if (!allowed(home)) return { ok: false, reason: 'robots_disallow' };

  const first = await guardedGet(home, home, d, allowed);
  if (!first || first.status < 200 || first.status >= 300 || first.body === null) return { ok: false, reason: 'unreachable' };
  if (!first.contentType.includes('text/html')) return { ok: false, reason: 'no_html' };

  const pages: FetchedPage[] = [];
  const skipped: { url: string; reason: string }[] = [];
  let total = 0;
  const add = (url: URL, html: string) => {
    const text = htmlToText(html).slice(0, Math.max(0, MAX_TOTAL_CHARS - total));
    if (!text) return;
    total += text.length;
    pages.push({ url: url.toString(), text });
  };
  add(first.url, first.body);

  for (const sub of pickSubpages(first.body, first.url)) {
    if (pages.length >= MAX_PAGES || total >= MAX_TOTAL_CHARS) break;
    if (d.budget.aborted) {
      skipped.push({ url: sub.toString(), reason: 'time_budget' });
      continue;
    }
    if (!allowed(sub)) {
      skipped.push({ url: sub.toString(), reason: 'robots_disallow' });
      continue;
    }
    const page = await guardedGet(sub, home, d, allowed);
    if (d.budget.aborted && (!page || page.body === null)) {
      skipped.push({ url: sub.toString(), reason: 'time_budget' });
      continue;
    }
    if (!page || page.status < 200 || page.status >= 300 || page.body === null || !page.contentType.includes('text/html')) {
      skipped.push({ url: sub.toString(), reason: 'unreachable' });
      continue;
    }
    add(page.url, page.body);
  }
  return { ok: true, pages, skipped };
}
