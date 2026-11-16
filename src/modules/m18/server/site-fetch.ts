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
 *  - HTML is parsed with single forward scans (indexOf), not regular expressions that rescan from
 *    every unclosed tag: a hostile 1 MB page costs milliseconds, not the event loop (NG-136 review).
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
/**
 * What the reader needs from an answer. A fetch `Response` fits it; the pinned transport builds
 * one by hand rather than a `Response`, so no `new Response(…)` with an upstream status exists
 * in src (tests/api/api-error-body-guard.test.ts: only internalError() builds a possible 5xx).
 */
export type SiteResponse = { status: number; headers: Headers; body: ReadableStream<Uint8Array> | null };
export type FetchLike = (url: URL, init: { headers: Record<string, string>; signal: AbortSignal; redirect?: 'manual' }) => Promise<SiteResponse>;
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
    // The socket gets exactly one answer. Whatever throws on the way (the resolver, the guard, or
    // the callback itself) ends in the catch below, never as an unhandled rejection; before the
    // answer it becomes the answer (an error), after it there is nobody left to tell.
    let answered = false;
    const fail = (error: unknown) => {
      if (answered) return;
      answered = true;
      callback(error instanceof Error ? error : new Error(String(error)), '', 0);
    };
    Promise.resolve()
      .then(() => resolve(hostname))
      .then((addresses) => {
        if (addresses.length === 0 || !addresses.every(allowed)) {
          fail(new BlockedAddressError(hostname));
          return;
        }
        const entries: LookupAddress[] = addresses
          .map((address) => ({ address, family: isIP(address) }))
          .filter((e) => e.family !== 0 && (!options.family || options.family === e.family));
        const first = entries[0];
        if (!first) {
          fail(new BlockedAddressError(hostname));
          return;
        }
        answered = true;
        if (options.all) callback(null, entries);
        else callback(null, first.address, first.family);
      })
      .catch(fail);
  };
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * GET over node:http(s) whose every connection goes through {@link guardedLookup}. No connection
 * pooling (`agent: false`): a pooled socket would skip the lookup. Redirects are never followed here
 * (guardedGet follows them by hand); the body arrives as a stream, so readCapped's byte cap and the
 * abort signal (per-request timeout + total budget) apply to it as they did to `fetch`.
 */
export function createPinnedFetch(opts: { resolve: LookupFn; allowed?: AddressGuard }): FetchLike {
  // NG-202 (B6): built from the two options by name, so an options bag that also carries `ca` or
  // `connectPort` cannot reach the transport — the system trust store and the URL's port always apply.
  return pinnedTransport({ resolve: opts.resolve, allowed: opts.allowed });
}

type PinnedTransportOptions = {
  resolve: LookupFn;
  allowed?: AddressGuard;
  /** Test seam: the port the socket connects to (a local test server). Default: the URL's own. */
  connectPort?: number;
  /** Test seam: the CA a local https test server's certificate is checked against. Default: the system's. */
  ca?: string;
};

/**
 * TEST SEAM ONLY (NG-202 B6) — the pinned transport pointed at a local test server: `connectPort`
 * and a custom `ca`. A custom CA replaces the system trust store, so no code under src/ other than
 * this file may use it (tests/modules/m18/site-fetch.test.ts checks). Production builds the
 * transport through {@link createPinnedFetch}, or through `fetchOrganizationSite`'s own test seam.
 */
export function testOnlyPinnedTransport(opts: PinnedTransportOptions): FetchLike {
  return pinnedTransport(opts);
}

function pinnedTransport(opts: PinnedTransportOptions): FetchLike {
  const allowed = opts.allowed ?? isPublicAddress;
  const lookup = guardedLookup(opts.resolve, allowed);
  return (url, init) =>
    new Promise<SiteResponse>((resolveResponse, reject) => {
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
          ...(opts.ca ? { ca: opts.ca } : {}),
        },
        (res) => {
          try {
            const status = res.statusCode ?? 0;
            // Inside the try: a header the Headers class refuses rejects the request instead of
            // throwing out of node's response callback (the promise would never settle).
            const headers = new Headers();
            for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) headers.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
            if (NULL_BODY_STATUSES.has(status) || status < 200) {
              res.resume();
              resolveResponse({ status: status < 200 ? 502 : status, headers, body: null });
              return;
            }
            const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
            resolveResponse({ status, headers, body });
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
//
// Every pass below is a single forward scan with indexOf (NG-136 review, round 3): no regular
// expression that can rescan from each unclosed opening. The old `[\s\S]*?</script>`-style
// expressions held the event loop for 5–167 s on 1 MB of HTML with unclosed tags, and the read's
// time budget does not stop CPU work. Each pass keeps the old expression's result on well-formed HTML.

/** Elements whose content is not page text. The first four hide the rest of the page when never closed (a browser does the same); `<head>` (end tag optional) and `<svg>` (may be self-closing) do not. */
const HIDDEN_ELEMENTS = ['script', 'style', 'noscript', 'svg', 'template', 'head'] as const;
const HIDE_TO_END = new Set<string>(['script', 'style', 'noscript', 'template']);
const BLOCK_ELEMENTS = ['br', 'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'section', 'article', 'footer', 'header'];
/**
 * At most this many CANDIDATE anchors are resolved (an href whose text or label carries an about/contact
 * hint; NG-202 B5: ordinary menu links no longer use the budget up), and a label is read from at most
 * this many characters.
 */
export const MAX_ANCHORS = 500;
export const MAX_LABEL_CHARS = 2_000;

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

/** ASCII-only lower case: same length as the input, so an index found in it is an index in the input. */
function lowerAscii(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

/** `\w` of a regular expression: [A-Za-z0-9_]. Past the end counts as a boundary. */
function isWordChar(s: string, i: number): boolean {
  const c = s.charCodeAt(i);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/** The tag name from `names` that `lower` has right after the `<` at `lt`, followed by a word boundary. */
function tagAt(lower: string, lt: number, names: readonly string[]): string | null {
  for (const name of names) {
    if (lower.startsWith(name, lt + 1) && !isWordChar(lower, lt + 1 + name.length)) return name;
  }
  return null;
}

/** `<title …>…</title>`: the first title's text, or '' when there is no closed one. */
function titleOf(html: string, lower: string): string {
  const open = lower.indexOf('<title');
  if (open < 0) return '';
  const gt = lower.indexOf('>', open + 6);
  if (gt < 0) return '';
  const close = lower.indexOf('</title>', gt + 1);
  return close < 0 ? '' : html.slice(gt + 1, close);
}

/** The index just past `</name\s*>` at or after `from`, or -1. */
function closingEnd(s: string, lower: string, name: string, from: number): number {
  const needle = `</${name}`;
  for (let at = lower.indexOf(needle, from); at >= 0; at = lower.indexOf(needle, at + 1)) {
    let k = at + needle.length;
    while (k < s.length && /\s/.test(s[k]!)) k += 1;
    if (s[k] === '>') return k + 1;
  }
  return -1;
}

const isAsciiLetter = (s: string, i: number) => {
  const c = s.charCodeAt(i) | 0x20;
  return c >= 97 && c <= 122;
};

/**
 * NG-207 F2: the index just past the comment whose body starts at `body` (right after `<!--`), or -1
 * when it never ends. As a browser: `<!-->` and `<!--->` end at once; otherwise the first `-->` or
 * `--!>` ends it. `cache` keeps the last found position of each closer (-1: none left; -2: not looked
 * up yet), reused while it still lies ahead, so many comments cost one pass over the input.
 */
function commentEnd(s: string, body: number, cache: { dashes: number; bang: number }): number {
  if (s[body] === '>') return body + 1;
  if (s[body] === '-' && s[body + 1] === '>') return body + 2;
  if (cache.dashes === -2 || (cache.dashes >= 0 && cache.dashes < body)) cache.dashes = s.indexOf('-->', body);
  if (cache.bang === -2 || (cache.bang >= 0 && cache.bang < body)) cache.bang = s.indexOf('--!>', body);
  const { dashes, bang } = cache;
  if (dashes < 0 && bang < 0) return -1;
  if (bang < 0 || (dashes >= 0 && dashes < bang)) return dashes + 3;
  return bang + 4;
}

/**
 * Comments and hidden elements (with their content) become a space; an unclosed comment, or an
 * unclosed <script>/<style>/<noscript>/<template>, hides the rest.
 *
 * NG-207 F1: both are found in ONE left-to-right scan, as a browser tokenises. A `<!--` inside a
 * <script> is script text (the script is skipped to its `</script>` first) and one inside an attribute
 * value is that value (every other tag is skipped whole, quoted values included) — neither opens a
 * comment, so the visible links and text up to the next `-->` stay. A `<script>` inside a comment opens
 * nothing either. Once a tag never ends (an unclosed quote or no `>`), attribute values are no longer
 * skipped: the rest is scanned `<` by `<` as before, so the scan stays linear.
 * A comment ends as a browser ends it (see `commentEnd`), and a `<!` not followed by `--` (doctype, bogus
 * comment) runs to the next `>`.
 */
function stripHiddenAndComments(s: string): string {
  const lower = lowerAscii(s);
  const neverClosed = new Set<string>(); // no closing tag after some point → none after any later one
  const cache = { dashes: -2, bang: -2 };
  let tagsEnd = true;
  let out = '';
  let i = 0; // start of the input not yet copied to `out`
  let from = 0; // where the next `<` is looked for
  for (;;) {
    const lt = s.indexOf('<', from);
    if (lt < 0) return out + s.slice(i);
    if (s.startsWith('<!--', lt)) {
      const end = commentEnd(s, lt + 4, cache);
      out += `${s.slice(i, lt)} `;
      if (end < 0) return out;
      i = end;
      from = end;
      continue;
    }
    if (s[lt + 1] === '!') {
      // NG-207 F3: a doctype or a bogus comment runs to the next `>`, quotes or not; a `<!--` in it is text.
      const gt = s.indexOf('>', lt + 2);
      out += `${s.slice(i, lt)} `;
      if (gt < 0) return out;
      i = gt + 1;
      from = i;
      continue;
    }
    const name = tagAt(lower, lt, HIDDEN_ELEMENTS);
    if (name && !neverClosed.has(name)) {
      const end = closingEnd(s, lower, name, lt + 1 + name.length);
      if (end >= 0) {
        out += `${s.slice(i, lt)} `;
        i = end;
        from = end;
        continue;
      }
      if (HIDE_TO_END.has(name)) return `${out}${s.slice(i, lt)} `;
      neverClosed.add(name);
    }
    from = lt + 1;
    // Any other start or end tag is passed whole, so nothing inside its attribute values is markup.
    const nameAt = s[lt + 1] === '/' ? lt + 2 : lt + 1;
    if (!tagsEnd || !isAsciiLetter(s, nameAt)) continue;
    let k = nameAt;
    while (k < s.length && !isSpace(s[k]) && s[k] !== '/' && s[k] !== '>') k += 1;
    const tag = readStartTag(s, lower, k);
    if (tag) from = tag.end;
    else tagsEnd = false;
  }
}

/**
 * Replaces each `<…>` that `isMatch` accepts with `replacement`. A tag runs from `<` to the next `>`
 * (as `[^>]*>` did); once no `>` is left, nothing after can be a tag.
 */
function replaceTags(s: string, replacement: string, isMatch: (lower: string, lt: number, gt: number) => boolean): string {
  const lower = lowerAscii(s);
  let out = '';
  let i = 0;
  let from = 0;
  let gt = -1; // the next `>` after the current `<`; reused while it still lies ahead
  for (;;) {
    const lt = s.indexOf('<', from);
    if (lt < 0) break;
    if (gt <= lt) gt = s.indexOf('>', lt + 1);
    if (gt < 0) break;
    if (isMatch(lower, lt, gt)) {
      out += s.slice(i, lt) + replacement;
      i = gt + 1;
      from = gt + 1;
    } else {
      from = lt + 1;
    }
  }
  return out + s.slice(i);
}

/** Visible text of a page, whitespace collapsed, capped. */
export function htmlToText(html: string, maxChars = MAX_PAGE_CHARS): string {
  const title = titleOf(html, lowerAscii(html));
  const blocks = replaceTags(stripHiddenAndComments(html), '\n', (lower, lt) => tagAt(lower, lt, BLOCK_ELEMENTS) !== null);
  const body = replaceTags(blocks, ' ', (_lower, lt, gt) => gt > lt + 1);
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

const isSpace = (ch: string | undefined) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/**
 * Reads the attributes of a start tag whose name ends at `at`. Returns the first `href` and the index
 * just past the tag's `>`, or null when the tag never ends (an unclosed quote or no `>`).
 */
function readStartTag(s: string, lower: string, at: number): { href: string | null; end: number } | null {
  let href: string | null = null;
  let k = at;
  for (;;) {
    while (k < s.length && (isSpace(s[k]) || s[k] === '/')) k += 1;
    if (k >= s.length) return null;
    if (s[k] === '>') return { href, end: k + 1 };
    const nameStart = k;
    while (k < s.length && !isSpace(s[k]) && s[k] !== '/' && s[k] !== '>' && s[k] !== '=') k += 1;
    const name = lower.slice(nameStart, k);
    while (k < s.length && isSpace(s[k])) k += 1;
    if (s[k] !== '=') continue;
    k += 1;
    while (k < s.length && isSpace(s[k])) k += 1;
    let value: string;
    const quote = s[k];
    if (quote === '"' || quote === "'") {
      const close = s.indexOf(quote, k + 1);
      if (close < 0) return null;
      value = s.slice(k + 1, close);
      k = close + 1;
    } else {
      const start = k;
      while (k < s.length && !isSpace(s[k]) && s[k] !== '>') k += 1;
      value = s.slice(start, k);
    }
    if (name === 'href' && href === null) href = value;
  }
}

/**
 * Up to `limit` same-site links whose path or text looks like an about/contact page, outside comments
 * and hidden elements. One forward scan: at most MAX_ANCHORS anchors are read, and a label ends at `</a>`, at the next `<a`, or after
 * MAX_LABEL_CHARS characters, whichever comes first.
 */
export function pickSubpages(rawHtml: string, base: URL, limit = MAX_PAGES - 1): URL[] {
  const picked: URL[] = [];
  const seen = new Set<string>([base.origin + base.pathname]);
  // NG-202 (B4): links are read from the same markup the text is — comments and hidden elements
  // (<script>, <style>, <template>, <noscript>, …) gone first, so a link a script only writes as a
  // string, or one inside an unclosed <script>, is no candidate. One linear scan (above; NG-207 F1).
  const html = stripHiddenAndComments(rawHtml);
  const lower = lowerAscii(html);
  let from = 0;
  for (let candidates = 0; candidates < MAX_ANCHORS && picked.length < limit; ) {
    const lt = lower.indexOf('<a', from);
    if (lt < 0) break;
    if (isWordChar(lower, lt + 2)) {
      from = lt + 2;
      continue;
    }
    const tag = readStartTag(html, lower, lt + 2);
    if (!tag) break; // the tag never ends: nothing after it is markup
    // The label ends at the next `<a`, at `</a>` before it, or after MAX_LABEL_CHARS. `</a>` is looked
    // for only up to the next `<a`, so each character is scanned a bounded number of times.
    const window = lower.slice(tag.end, tag.end + MAX_LABEL_CHARS);
    const nextAnchor = window.search(/<a(?![A-Za-z0-9_])/);
    const span = nextAnchor >= 0 ? nextAnchor : window.length;
    const close = window.slice(0, span).indexOf('</a>');
    const labelLength = close >= 0 ? close : span;
    from = tag.end + (labelLength === close ? close + 4 : labelLength);
    if (tag.href === null) continue;
    const href = decodeEntities(tag.href);
    const rawLabel = html.slice(tag.end, tag.end + labelLength);
    const label = replaceTags(rawLabel, ' ', (_lower, lt, gt) => gt > lt + 1); // `<[^>]+>` in one pass
    // NG-202 (B5): only an anchor that could be picked — a hint in its href or its label — counts
    // against MAX_ANCHORS. The URL parser drops tabs and newlines, so the href is read without them.
    const bareHref = href.replace(/[\t\n\r]/g, '');
    if (!LINK_HINT.test(safeDecodePath(bareHref)) && !LINK_HINT.test(label)) continue;
    candidates += 1;
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

async function readCapped(response: SiteResponse): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    // Refused on the declared size: close the body now, or the socket stays open until the
    // per-request timeout.
    await response.body?.cancel().catch(() => {});
    return null;
  }
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
    let response: SiteResponse;
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
    fetchImpl: deps.fetchImpl ?? pinnedTransport({ resolve: lookup, allowed: addressAllowed, connectPort: deps.connectPort }),
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


// ── NG-209: the in-process fake site of the e2e web server ────────────────────────────────────────

/**
 * What the fake DNS answers. It is never connected to — the transport below is in-process — but it
 * has to pass the unchanged {@link isPublicAddress} guard, so it is a public address (the one the
 * unit tests already use), not a loopback or documentation one the guard would refuse.
 */
export const FAKE_SITE_ADDRESS = '93.184.216.34';

const FAKE_SITE_PAGES: Readonly<Record<string, { type: string; body: string }>> = {
  '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /gizli\n' },
  '/': {
    type: 'text/html; charset=utf-8',
    body:
      '<html><head><title>Acme</title></head><body><h1>Acme Teknoloji (E2E_FAKE_AI fake site)</h1>' +
      '<p>Yazılım geliştirme, Ankara.</p><a href="/hakkimizda">Hakkımızda</a> <a href="/gizli/hakkimizda">Gizli</a></body></html>',
  },
  '/hakkimizda': {
    type: 'text/html; charset=utf-8',
    body: '<html><body><h1>Hakkımızda</h1><p>Acme Teknoloji A.Ş., Çankaya / Ankara. 25 çalışan.</p></body></html>',
  },
};

/** Serves {@link FAKE_SITE_PAGES} for any host, built by hand like the pinned transport's answers. */
const fakeSiteFetch: FetchLike = async (url) => {
  const page = FAKE_SITE_PAGES[url.pathname];
  const status = page ? 200 : 404;
  const bytes = new TextEncoder().encode(page?.body ?? 'not found');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return { status, headers: new Headers({ 'content-type': page?.type ?? 'text/html' }), body };
};

/**
 * The network edges of {@link fetchOrganizationSite} for the e2e web server (`E2E_FAKE_AI=true`,
 * enrichment.ts): DNS and transport only. No `addressAllowed`, no `connectPort`: the URL check, the
 * public-address check on the answer, robots.txt, same-site redirects and every limit run as in
 * production. Nothing leaves the process.
 */
export function fakeSiteDeps(): SiteFetchDeps {
  return { lookup: async () => [FAKE_SITE_ADDRESS], fetchImpl: fakeSiteFetch };
}
