import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import nextConfig from '../../next.config';
import { createRequire } from 'node:module';
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { config as proxyConfig, proxy } from '../proxy';

// The compiler `next build` runs over `config.matcher`. Exported at runtime but not
// in next's .d.ts, hence the require and the hand-written type.
const { getMiddlewareMatchers } = createRequire(import.meta.url)(
  'next/dist/build/analysis/get-page-static-info',
) as { getMiddlewareMatchers: (matcher: unknown, nextConfig: object) => Parameters<typeof getMiddlewareRouteMatcher>[0] };
import {
  API_CONTENT_SECURITY_POLICY,
  PRINT_BUTTON_HANDLER,
  PRINT_BUTTON_HANDLER_SHA256,
  STATIC_FILE_CONTENT_SECURITY_POLICY,
  STATIC_FILE_EXTENSIONS,
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  cspHeaderName,
  cspOptionsFromEnv,
  CORDIS_WIDGET_SOURCE,
  CSP_REPORT_PATH,
  generateNonce,
  isCordisWidgetHostPath,
  isCordisWidgetPath,
  staticFileNotFoundSource,
} from './security-headers';

/** `directive → values` so a test can ask about one directive without string-matching the rest. */
function parseCsp(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as [string, string[]];
    }),
  );
}

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('STATIC_SECURITY_HEADERS (TASK-MUN80T8IVTPM7 Y-2) — pinned', () => {
  it('is exactly this list', () => {
    expect(STATIC_SECURITY_HEADERS).toEqual([
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
      },
    ]);
  });
});

describe('next.config.ts', () => {
  const resolved = (nextConfig as unknown as (phase: string) => Record<string, unknown>)('phase-test');

  it('drops X-Powered-By (D-2)', () => {
    expect(resolved.poweredByHeader).toBe(false);
  });

  it('puts every static header on /:path*, CSP on /api only, and keeps accept-invite no-referrer after the global one', async () => {
    const rules = await (resolved.headers as () => Promise<Array<{ source: string; headers: { key: string; value: string }[] }>>)();
    const all = rules.find((r) => r.source === '/:path*');
    for (const h of STATIC_SECURITY_HEADERS) expect(all?.headers).toContainEqual(h);
    // A static page CSP here would intersect with the proxy's nonce policy and block Next's inline scripts.
    expect(all?.headers.map((h) => h.key.toLowerCase())).not.toContain('content-security-policy');

    const api = rules.find((r) => r.source === '/api/:path*');
    expect(api?.headers).toEqual([{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }]);

    const inviteIdx = rules.findIndex((r) => r.source.includes('accept-invite'));
    expect(inviteIdx).toBeGreaterThan(rules.indexOf(all!));
    expect(rules[inviteIdx]?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  });
});

describe('buildContentSecurityPolicy', () => {
  const prod = parseCsp(buildContentSecurityPolicy({ nonce: 'abc123', isDev: false }));

  it('script-src is nonce + strict-dynamic, with no unsafe-inline / unsafe-eval in production', () => {
    expect(prod.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it('forbids framing, plugins and base-tag hijack', () => {
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
    expect(prod.get('default-src')).toEqual(["'self'"]);
  });

  it('lets the Google sign-in form redirect leave the origin, and nothing else', () => {
    expect(prod.get('form-action')).toEqual(["'self'", 'https://accounts.google.com']);
  });

  it('has no upgrade-insecure-requests (would break plain-http hosts)', () => {
    expect(prod.has('upgrade-insecure-requests')).toBe(false);
  });

  it('connect-src is self only unless PostHog / R2 are configured; LLM hosts never appear', () => {
    expect(prod.get('connect-src')).toEqual(["'self'"]);
    const full = parseCsp(
      buildContentSecurityPolicy({
        nonce: 'n',
        isDev: false,
        posthogHost: 'https://eu.i.posthog.com/',
        r2AccountId: 'abcdef0123456789abcdef0123456789',
        r2PublicHost: 'https://files.example.com/some/path',
      }),
    );
    expect(full.get('connect-src')).toEqual([
      "'self'",
      'https://eu.i.posthog.com',
      'https://abcdef0123456789abcdef0123456789.r2.cloudflarestorage.com',
    ]);
    expect(full.get('img-src')).toContain('https://files.example.com');
    const text = [...full.values()].flat().join(' ');
    expect(text).not.toMatch(/anthropic|openai/);
  });

  it('R2_ENDPOINT: valid https endpoint is added to connect-src (origin only, no path)', () => {
    const policy = parseCsp(
      buildContentSecurityPolicy({
        nonce: 'n',
        isDev: false,
        r2Endpoint: 'https://minio.example.com:9000/path/to/bucket',
      }),
    );
    expect(policy.get('connect-src')).toEqual(["'self'", 'https://minio.example.com:9000']);
  });

  it('R2_ENDPOINT: loopback http endpoints are added (localhost, 127.0.0.1, ::1)', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: `http://${host}:9000`,
        }),
      );
      expect(policy.get('connect-src')).toContain(`http://${host}:9000`);
    }
  });

  it('R2_ENDPOINT: IPv6 http — only ::1 is loopback; the parser canonicalises long forms to [::1]', () => {
    const connect = (r2Endpoint: string) =>
      parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: false, r2Endpoint })).get('connect-src');
    // Same address as ::1 (RFC 5952): new URL() rewrites it before our check, header gets the canonical form.
    expect(connect('http://[0:0:0:0:0:0:0:1]:9000')).toEqual(["'self'", 'http://[::1]:9000']);
    for (const ep of ['http://[::ffff:127.0.0.1]:9000', 'http://[::2]:9000', 'http://[fe80::1]:9000']) {
      expect(connect(ep)).toEqual(["'self'"]);
    }
  });

  it('R2_ENDPOINT: remote http endpoint is rejected (safe fallback)', () => {
    const policy = parseCsp(
      buildContentSecurityPolicy({
        nonce: 'n',
        isDev: false,
        r2Endpoint: 'http://s3.example.com:9000',
      }),
    );
    expect(policy.get('connect-src')).toEqual(["'self'"]);
  });

  it('R2_ENDPOINT: invalid url is dropped', () => {
    const policy = parseCsp(
      buildContentSecurityPolicy({
        nonce: 'n',
        isDev: false,
        r2Endpoint: 'not a url',
      }),
    );
    expect(policy.get('connect-src')).toEqual(["'self'"]);
  });

  it('R2_ENDPOINT: empty or missing leaves connect-src unchanged', () => {
    for (const endpoint of ['', null, undefined]) {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: endpoint as unknown as string | null | undefined,
        }),
      );
      expect(policy.get('connect-src')).toEqual(["'self'"]);
    }
  });

  describe('R2_ENDPOINT mutant tests (each mutation should fail these tests)', () => {
    it('MUTANT 1 RED→GREEN: loopback HTTP filter must exist (reject without it)', () => {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: 'http://localhost:9000',
        }),
      );
      // If r2EndpointOrigin did NOT check for loopback, this would fail (connect-src would be ["'self'"])
      expect(policy.get('connect-src')).toContain('http://localhost:9000');
    });

    it('MUTANT 2 RED→GREEN: r2Endpoint must be included in connect-src (not omitted)', () => {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: 'https://minio.example.com:9000',
        }),
      );
      // If r2Endpoint were omitted from extra(), this would fail
      expect(policy.get('connect-src')).toContain('https://minio.example.com:9000');
    });

    it('MUTANT 3 RED→GREEN: cspOptionsFromEnv must read R2_ENDPOINT (not ignore it)', () => {
      const opts = cspOptionsFromEnv('n', env({ R2_ENDPOINT: 'https://minio.local:9000' }));
      // If cspOptionsFromEnv set r2Endpoint to null or ignored it, this would fail
      expect(opts.r2Endpoint).toBe('https://minio.local:9000');
    });

    it('MUTANT 4 RED→GREEN: originOf filter must not accept malformed URLs', () => {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: 'not a valid url at all',
        }),
      );
      // If r2EndpointOrigin did not drop invalid URLs, it might cause errors or strange CSP
      expect(policy.get('connect-src')).toEqual(["'self'"]);
    });

    it('MUTANT 5 RED→GREEN: HTTP remote endpoint must be rejected (not accepted)', () => {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: 'http://s3.example.com:9000',
        }),
      );
      // If HTTP remote were allowed, this would fail
      expect(policy.get('connect-src')).toEqual(["'self'"]);
    });

    it('MUTANT 6 RED→GREEN: IPv6 bracket notation must be stripped for loopback check', () => {
      const policy = parseCsp(
        buildContentSecurityPolicy({
          nonce: 'n',
          isDev: false,
          r2Endpoint: 'http://[::1]:9000',
        }),
      );
      // If bracket stripping were omitted, url.hostname would be "[::1]" (with brackets),
      // which would not match "::1" in the hardcoded check, so the endpoint would be rejected
      expect(policy.get('connect-src')).toContain('http://[::1]:9000');
    });
  });

  it('drops malformed env values instead of writing them into the header', () => {
    const bad = parseCsp(
      buildContentSecurityPolicy({
        nonce: 'n',
        isDev: false,
        posthogHost: "javascript:alert(1)",
        r2AccountId: "x; script-src *",
        r2PublicHost: 'not a url',
      }),
    );
    expect(bad.get('connect-src')).toEqual(["'self'"]);
    expect(bad.get('script-src')).toEqual(["'self'", "'nonce-n'", "'strict-dynamic'"]);
  });

  it('dev adds unsafe-eval and websocket HMR only', () => {
    const dev = parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: true }));
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('connect-src')).toEqual(["'self'", 'ws:', 'wss:']);
  });
});

describe('cspOptionsFromEnv / cspHeaderName', () => {
  it('PostHog host only when the key is set; default is the EU host', () => {
    expect(cspOptionsFromEnv('n', env({})).posthogHost).toBeNull();
    expect(cspOptionsFromEnv('n', env({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_x' })).posthogHost).toBe('https://eu.i.posthog.com');
    expect(
      cspOptionsFromEnv('n', env({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_x', NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' }))
        .posthogHost,
    ).toBe('https://us.i.posthog.com');
    expect(cspOptionsFromEnv('n', env({ NODE_ENV: 'production' })).isDev).toBe(false);
  });

  it('R2_ENDPOINT is read and passed to buildContentSecurityPolicy', () => {
    expect(cspOptionsFromEnv('n', env({})).r2Endpoint).toBeUndefined();
    expect(cspOptionsFromEnv('n', env({ R2_ENDPOINT: 'https://minio.local:9000' })).r2Endpoint).toBe(
      'https://minio.local:9000',
    );
  });

  it('only NODE_ENV=development loosens script-src; an unset or odd NODE_ENV does not', () => {
    // A server started without NODE_ENV (or with 'test'/'staging') must not get 'unsafe-eval'.
    expect(cspOptionsFromEnv('n', env({})).isDev, 'unset').toBe(false);
    for (const NODE_ENV of ['', 'test', 'staging', 'Production']) {
      expect(cspOptionsFromEnv('n', env({ NODE_ENV })).isDev, NODE_ENV).toBe(false);
    }
    expect(cspOptionsFromEnv('n', env({ NODE_ENV: 'development' })).isDev).toBe(true);
  });

  it('enforces by default; CSP_MODE=report-only is the rollback switch', () => {
    expect(cspHeaderName(env({}))).toBe('Content-Security-Policy');
    expect(cspHeaderName(env({ CSP_MODE: 'enforce' }))).toBe('Content-Security-Policy');
    expect(cspHeaderName(env({ CSP_MODE: ' Report-Only ' }))).toBe('Content-Security-Policy-Report-Only');
  });
});

describe('CORDIS widget CSP (FO-168, sandboxed iframe since FO-169 / K-573263) — embed route only', () => {
  const CORDIS_PATH = 'https://cordis.europa.eu/datalab/visualisations/';
  const WIDENED = ['style-src', 'img-src', 'font-src'];
  const embed = () => parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: false, cordisWidget: true }));
  const host = () => parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: false, cordisWidgetHost: true }));
  const csp = (p: string) => proxy(new NextRequest(`http://localhost${p}`)).headers.get('content-security-policy') ?? '';

  it('the source is one https path on cordis.europa.eu — no wildcard, no bare host', () => {
    expect(CORDIS_WIDGET_SOURCE).toBe(CORDIS_PATH);
    expect(CORDIS_WIDGET_SOURCE).not.toContain('*');
  });

  it('isCordisWidgetPath: /tr/embed/cordis and /en/embed/cordis (optional trailing slash) only', () => {
    for (const p of ['/tr/embed/cordis', '/en/embed/cordis', '/tr/embed/cordis/', '/en/embed/cordis/']) {
      expect(isCordisWidgetPath(p), p).toBe(true);
    }
    for (const p of [
      '/', '/tr', '/en', '/tr/', '/TR/embed/cordis', '/tr/embed/Cordis', '/tr/embed', '/tr/embed/cordis/x',
      '/tr/embed/cordisx', '/tr/embed/cordis//', '/x/tr/embed/cordis', '/de/embed/cordis', '/embed/cordis',
      '/tr/login', '/api/health', '',
    ]) {
      expect(isCordisWidgetPath(p), p).toBe(false);
    }
  });

  it('isCordisWidgetHostPath: /tr and /en (optional trailing slash) only', () => {
    for (const p of ['/tr', '/en', '/tr/', '/en/']) expect(isCordisWidgetHostPath(p), p).toBe(true);
    for (const p of [
      '/', '/TR', '/En', '/tr/login', '/en/pricing', '/tr/blog', '/tr/x', '/tr//', '/trx', '/tr.png',
      '/api/health', '/de', '/tr/en', '/tr/embed/cordis', '',
    ]) {
      expect(isCordisWidgetHostPath(p), p).toBe(false);
    }
  });

  it('embed policy: style/img/font-src get the CORDIS path, frame-ancestors is self, nothing else changes', () => {
    const plain = parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: false }));
    const e = embed();
    expect([...e.keys()]).toEqual([...plain.keys()]);
    for (const [name, values] of plain) {
      if (WIDENED.includes(name)) expect(e.get(name), name).toEqual([...values, CORDIS_PATH]);
      else if (name === 'frame-ancestors') expect(e.get(name), name).toEqual(["'self'"]);
      else expect(e.get(name), name).toEqual(values);
    }
    // the widget fetches its data as JSONP scripts: no connect-src opening, and it frames nothing
    expect(e.get('connect-src')).toEqual(["'self'"]);
    expect(e.get('frame-src')).toEqual(["'none'"]);
  });

  it('host (home page) policy: only frame-src becomes self, nothing mentions cordis', () => {
    const plain = parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: false }));
    const h = host();
    expect([...h.keys()]).toEqual([...plain.keys()]);
    for (const [name, values] of plain) {
      if (name === 'frame-src') expect(h.get(name), name).toEqual(["'self'"]);
      else expect(h.get(name), name).toEqual(values);
    }
    expect(buildContentSecurityPolicy({ nonce: 'n', isDev: false, cordisWidgetHost: true })).not.toMatch(/cordis/i);
    expect(h.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('without the flags (default) nothing mentions cordis and nothing frames or is framed', () => {
    const plain = buildContentSecurityPolicy({ nonce: 'n', isDev: false });
    expect(plain).not.toMatch(/cordis/i);
    expect(buildContentSecurityPolicy({ nonce: 'n', isDev: false, cordisWidget: false })).not.toMatch(/cordis/i);
    expect(parseCsp(plain).get('frame-src')).toEqual(["'none'"]);
    expect(parseCsp(plain).get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('production embed policy has no unsafe-eval, no unsafe-inline in script-src, no wildcard host', () => {
    const e = embed();
    expect(e.get('script-src')).toEqual(["'self'", "'nonce-n'", "'strict-dynamic'"]);
    for (const [name, values] of e) {
      expect(values.join(' '), name).not.toContain('unsafe-eval');
      expect(values.join(' '), name).not.toMatch(/(^|\s)\*/);
      expect(values.join(' '), name).not.toMatch(/https:\/\/\*|\s(https?:)(\s|$)/);
      if (name !== 'style-src') expect(values, name).not.toContain("'unsafe-inline'");
    }
  });

  it('the proxy sends the CORDIS path on the embed route only; the home page gets frame-src self and no cordis', () => {
    for (const p of ['/tr/embed/cordis', '/en/embed/cordis', '/en/embed/cordis?x=1']) {
      expect(csp(p), p).toContain(CORDIS_PATH);
      expect(csp(p), p).toMatch(/frame-ancestors 'self'/);
    }
    for (const p of ['/tr', '/en', '/tr/', '/en?utm=x']) {
      expect(csp(p), p).not.toMatch(/cordis/i);
      expect(csp(p), p).toMatch(/frame-src 'self'/);
      expect(csp(p), p).toMatch(/frame-ancestors 'none'/);
    }
    for (const p of ['/tr/login', '/en/login', '/tr/pricing', '/tr/blog', '/tr/some-workspace/pipeline', '/TR', '/tr/en', '/foo.bar', '/robots.txt', '/TR/embed/cordis']) {
      expect(csp(p), p).not.toMatch(/cordis/i);
      expect(csp(p), p).toMatch(/frame-src 'none'/);
      expect(csp(p), p).toMatch(/frame-ancestors 'none'/);
    }
    // `/` only redirects to a locale: the redirect carries the default policy
    expect(csp('/')).not.toMatch(/cordis/i);
  });

  it('the embed policy is the same policy on request and response (the route reads the nonce from the request)', () => {
    const res = proxy(new NextRequest('http://localhost/tr/embed/cordis'));
    const policy = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
  });

  it('CSP_MODE=report-only still applies to the embed policy (rollback switch)', () => {
    expect(cspHeaderName(env({ CSP_MODE: 'report-only' }))).toBe('Content-Security-Policy-Report-Only');
  });

  it('API and static-file policies never mention cordis', () => {
    expect(API_CONTENT_SECURITY_POLICY).not.toMatch(/cordis/i);
    expect(STATIC_FILE_CONTENT_SECURITY_POLICY).not.toMatch(/cordis/i);
  });
});

describe('generateNonce', () => {
  it('is 128-bit base64 and different every call', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(new Set(Array.from({ length: 50 }, generateNonce)).size).toBe(50);
  });
});

describe('API CSP print-button hash', () => {
  it('is the sha256 of the handler text', () => {
    const digest = createHash('sha256').update(PRINT_BUTTON_HANDLER).digest('base64');
    expect(PRINT_BUTTON_HANDLER_SHA256).toBe(`sha256-${digest}`);
    expect(API_CONTENT_SECURITY_POLICY).toContain(`'unsafe-hashes' '${PRINT_BUTTON_HANDLER_SHA256}'`);
  });

  it.each(['src/lib/document-exporter.ts', 'src/lib/efatura.ts'])('%s emits exactly that handler and no other inline script', (file) => {
    const src = readFileSync(path.join(process.cwd(), file), 'utf8');
    const handlers = [...src.matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => m[1]);
    expect(handlers.length).toBeGreaterThan(0);
    expect(new Set(handlers)).toEqual(new Set([PRINT_BUTTON_HANDLER]));
    expect(src).not.toMatch(/<script/i);
  });
});

describe('proxy', () => {
  it('puts one nonce on the request (for Next to read) and the same policy on the response', () => {
    const res = proxy(new NextRequest('http://localhost/tr/login'));
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    const nonce = /'nonce-([^']+)'/.exec(csp!)?.[1];
    expect(nonce).toBeTruthy();
    // Next's middleware protocol: request-header overrides travel as x-middleware-request-*.
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('a fresh nonce per request', () => {
    const a = proxy(new NextRequest('http://localhost/tr/login')).headers.get('content-security-policy');
    const b = proxy(new NextRequest('http://localhost/tr/login')).headers.get('content-security-policy');
    expect(a).not.toBe(b);
  });

  it('keeps next-intl routing: / still redirects to a locale, and the redirect carries the CSP too', () => {
    const res = proxy(new NextRequest('http://localhost/'));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/\/(tr|en)$/);
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
  });
});

/**
 * İNCELEME-57 Y-2 — the matcher decides which responses get a CSP at all, and the
 * tests above call proxy() directly, so they never saw it: a matcher cut down to
 * `['/api/:path*']` left every page without a policy and all of them still passed.
 * Compiled here with the same Next.js functions `next build` and the router use.
 */
describe('proxy config.matcher (İNCELEME-57 Y-1 / Y-2)', () => {
  const runs = getMiddlewareRouteMatcher(getMiddlewareMatchers(proxyConfig.matcher, {}));
  const matches = (pathname: string) => runs(pathname, {} as never, {});

  it.each([
    '/',
    '/tr',
    '/en',
    '/tr/login',
    '/tr/main/dashboard',
    '/en/main/calls/abc',
    '/tr/accept-invite/x',
    // Y-1: dotted paths render the app 404 — 24 inline scripts that need the nonce.
    '/foo.bar',
    '/tr/yok.html',
    '/wp-login.php',
    '/.env',
    '/.well-known/security.txt.bak',
    '/foo',
    // İNCELEME-78 Y-1: `api` / `_next` are whole segments, not prefixes.
    '/apifoo',
    '/api-docs',
    '/api.html',
    '/_nextfoo',
    '/_vercelx',
    // İNCELEME-98 Y-1: a case variant of a real file is not that file.
    '/Logo.png',
    '/Favicon.ICO',
    '/favicon.ICO',
    '/_next/Image',
    '/_next/STATIC/x.js',
    '/_NEXT/static/x.js',
    '/_Next/yok',
    '/fav\u0131con.ico',
  ])('runs for %s', (pathname) => {
    expect(matches(pathname)).toBe(true);
  });

  it.each([
    '/api',
    '/api/x',
    '/api/csp-report',
    '/api/auth/session',
    '/_next/static/chunks/main.js',
    // Chunk names carry upper case; `/_next/static/` is skipped whatever follows.
    '/_next/static/chunks/src_app_AppShell_tsx_0Ab.js',
    '/_next/static/BUILD_Id-x/_buildManifest.js',
    '/_next/image',
    '/_next/webpack-hmr',
    '/_vercel/insights/script.js',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/site.webmanifest',
    '/fonts/inter.woff2',
  ])('skips %s', (pathname) => {
    expect(matches(pathname)).toBe(false);
  });

  it('skips every file in public/ (a proxy run would locale-redirect it to /tr/<file>)', () => {
    const files = readdirSync(path.join(process.cwd(), 'public'), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => `/${path.relative(path.join(process.cwd(), 'public'), path.join(e.parentPath, e.name))}`);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(matches(f), f).toBe(false);
  });
});

describe('proxy on a locale-less dotted path (İNCELEME-57 Y-1)', () => {
  it('sets the CSP and passes through, without a locale redirect', () => {
    const res = proxy(new NextRequest('http://localhost/foo.bar'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    const csp = res.headers.get('content-security-policy');
    expect(csp).toMatch(/'nonce-[^']+'/);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['/_next/Image', '/_NEXT/yok', '/_Vercel/x'])(
    '%s (İNCELEME-98 Y-1) gets the CSP and is not locale-redirected',
    (pathname) => {
      const res = proxy(new NextRequest(`http://localhost${pathname}`));
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(res.headers.get('content-security-policy')).toMatch(/'nonce-[^']+'/);
    },
  );

  it('a locale-prefixed dotted path still goes through next-intl', () => {
    const res = proxy(new NextRequest('http://localhost/tr/yok.html'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-security-policy')).toMatch(/'nonce-[^']+'/);
  });
});

describe('CSP reporting (İNCELEME-57 Ö-1)', () => {
  it('the policy reports to /api/csp-report with report-uri, and has no report-to', () => {
    const csp = parseCsp(buildContentSecurityPolicy({ nonce: 'n', isDev: false }));
    expect(csp.get('report-uri')).toEqual([CSP_REPORT_PATH]);
    expect(CSP_REPORT_PATH).toBe('/api/csp-report');
    // With a report-to, Chromium stops sending report-uri (see security-headers.ts).
    expect(csp.has('report-to')).toBe(false);
  });

  it('the report endpoint is under /api, so it gets the static API policy and never the page one', () => {
    expect(CSP_REPORT_PATH.startsWith('/api/')).toBe(true);
  });
});

/**
 * İNCELEME-78 Y-1 — who sets the CSP on each response. The proxy (nonce policy),
 * `/api/:path*` (API policy) and the static-file rule (script-free 404 policy) are
 * checked here with the functions Next itself matches with: `getMiddlewareMatchers`
 * for the proxy, and `getPathMatch` with the router's header options
 * (next/dist/server/lib/router-utils/filesystem.js `buildCustomRoute`). Where the
 * proxy runs its header wins (measured on `next start`, see the report), so what
 * decides a response is: proxy if it runs, else the header rule.
 */
describe('CSP coverage: proxy vs next.config headers (İNCELEME-78 Y-1)', () => {
  const runs = getMiddlewareRouteMatcher(getMiddlewareMatchers(proxyConfig.matcher, {}));
  const proxyRuns = (pathname: string) => runs(pathname, {} as never, {});
  const resolved = (nextConfig as unknown as (phase: string) => Record<string, unknown>)('phase-test');
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const rulesP = (resolved.headers as () => Promise<Rule[]>)();

  const cspRules = async () =>
    (await rulesP)
      .map((r) => ({
        value: r.headers.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value,
        match: getPathMatch(r.source, { strict: true, removeUnnamedParams: true, sensitive: false }),
      }))
      .filter((r): r is { value: string; match: ReturnType<typeof getPathMatch> } => !!r.value);

  /** 'nonce' | 'api' | 'static' | 'none' — which policy the response carries. */
  async function policyOf(pathname: string): Promise<string> {
    if (proxyRuns(pathname)) return 'nonce';
    const hits = (await cspRules()).filter((r) => r.match(pathname) !== false);
    // Two header rules on one response: the later one wins silently. Never let that happen.
    expect(hits.length, `${pathname}: ${hits.length} CSP header rules`).toBeLessThanOrEqual(1);
    const [hit] = hits;
    if (!hit) return 'none';
    if (hit.value === API_CONTENT_SECURITY_POLICY) return 'api';
    if (hit.value === STATIC_FILE_CONTENT_SECURITY_POLICY) return 'static';
    return `unknown: ${hit.value}`;
  }

  it('the matcher skips exactly STATIC_FILE_EXTENSIONS (Next needs the matcher as a literal)', () => {
    const catchAll = proxyConfig.matcher[2];
    expect(catchAll).toContain(`[-a-z0-9_./]*\\.(?:${STATIC_FILE_EXTENSIONS})$`);
  });

  it('the static-file policy runs no script, reports nothing and cannot be framed', () => {
    const csp = parseCsp(STATIC_FILE_CONTENT_SECURITY_POLICY);
    expect(csp.get('default-src')).toEqual(["'none'"]);
    expect(csp.has('script-src')).toBe(false);
    // İNCELEME-98 D-1 (X4): `script-src-elem` / `script-src-attr` would let the
    // 404's inline scripts run again while `script-src` stays absent.
    expect([...csp.keys()].filter((d) => d.startsWith('script-src'))).toEqual([]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'none'"]);
    expect(csp.has('report-uri')).toBe(false);
  });

  it.each([
    // No file behind a static-file path: Next's app 404, ~30 scripts.
    ['/yok.png', 'static'],
    ['/x.js', 'static'],
    ['/robots.txt', 'static'],
    ['/sitemap.xml', 'static'],
    ['/.well-known/security.txt', 'static'],
    ['/fonts/inter.woff2', 'static'],
    ['/a/b/c.css', 'static'],
    ['/a/logo.png', 'static'],
    ['/api.png', 'static'],
    ['/_next/yok', 'static'],
    ['/_next/yok.js', 'static'],
    ['/_next', 'static'],
    ['/_vercel/x', 'static'],
    ['/_vercel/x.js', 'static'],
    // İNCELEME-98 D-1 (X2/X3): only `/_next/image` itself and what is under
    // `/_next/static/` are real; their neighbours are the app 404.
    ['/_next/imagex', 'static'],
    ['/_next/image/x', 'static'],
    ['/_next/static', 'static'],
    ['/_next/staticfoo', 'static'],
    ['/_next/statics/x.js', 'static'],
    // İNCELEME-98 Y-1: case variants of real files — the static rule leaves them
    // out (it ignores case), so the proxy has to run.
    ['/Logo.png', 'nonce'],
    ['/LOGO.PNG', 'nonce'],
    ['/Next.svg', 'nonce'],
    ['/Favicon.ico', 'nonce'],
    ['/Favicon.ICO', 'nonce'],
    ['/favicon.ICO', 'nonce'],
    ['/_next/Image', 'nonce'],
    ['/_next/IMAGE', 'nonce'],
    ['/_next/STATIC/x.js', 'nonce'],
    ['/_next/Static/chunks/x.js', 'nonce'],
    ['/_NEXT/static/x.js', 'nonce'],
    ['/_Next/yok', 'nonce'],
    ['/_VERCEL/x', 'nonce'],
    ['/fav\u0131con.ico', 'nonce'],
    // Not plain lowercase, so no longer skipped (was 'static' / 'api'; both are
    // the app 404, and still carry a CSP).
    ['/TR/yok.png', 'nonce'],
    ['/API/x.png', 'nonce'],
    // The proxy runs (and its header replaces the static one where both match).
    ['/yok.PNG', 'nonce'],
    ['/tr/yok.png', 'nonce'],
    ['/apifoo', 'nonce'],
    ['/api-docs', 'nonce'],
    ['/api.html', 'nonce'],
    ['/_nextfoo', 'nonce'],
    ['/foo.bar', 'nonce'],
    ['/tr/yok', 'nonce'],
    // API responses, 404 included.
    ['/api', 'api'],
    ['/api/yok', 'api'],
    ['/api/yok.png', 'api'],
    // Real files: no CSP, cache headers untouched.
    ['/logo.png', 'none'],
    ['/favicon.ico', 'none'],
    ['/_next/static/chunks/main.js', 'none'],
    ['/_next/static/css/app.css', 'none'],
    ['/_next/image', 'none'],
  ])('%s → %s', async (pathname, expected) => {
    expect(await policyOf(pathname)).toBe(expected);
  });

  it('every file in public/ goes out without a CSP; a missing sibling gets the static one', async () => {
    const pub = path.join(process.cwd(), 'public');
    const files = readdirSync(pub, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => `/${path.relative(pub, path.join(e.parentPath, e.name))}`);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(await policyOf(f), f).toBe('none');
      expect(await policyOf(`${f}.yok${path.extname(f)}`), `${f} sibling`).toBe('static');
    }
  });

  it('no case variant of a real file goes out without a CSP (İNCELEME-98 Y-1)', async () => {
    const pub = path.join(process.cwd(), 'public');
    const real = [
      ...readdirSync(pub, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => `/${path.relative(pub, path.join(e.parentPath, e.name))}`),
      '/favicon.ico',
      '/_next/image',
      '/_next/static/chunks/main.js',
    ];
    const variants = (p: string) => {
      const out = new Set([p.toUpperCase(), p.replace(/\b[a-z]/g, (c) => c.toUpperCase())]);
      for (let i = 0; i < p.length; i++) {
        const c = p[i]!;
        if (/[a-z]/.test(c)) out.add(p.slice(0, i) + c.toUpperCase() + p.slice(i + 1));
      }
      // Only `/_next/static/<file>` itself may differ in case: that part is the chunk name.
      return [...out].filter((v) => v !== p && !v.startsWith('/_next/static/'));
    };
    let checked = 0;
    for (const f of real) {
      expect(await policyOf(f), f).toBe('none');
      for (const v of variants(f)) {
        expect(await policyOf(v), v).not.toBe('none');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('a served file name is matched literally, not as a regex', () => {
    const match = getPathMatch(staticFileNotFoundSource(['/a.b.png', '/(x)+.js']), {
      strict: true,
      removeUnnamedParams: true,
      sensitive: false,
    });
    expect(match('/a.b.png')).toBe(false);
    expect(match('/(x)+.js')).toBe(false);
    expect(match('/aXb.png')).not.toBe(false);
    expect(match('/xx.js')).not.toBe(false);
  });

  it('every static-file extension, on a path with no file, gets a CSP', async () => {
    const exts = ['ico', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'txt', 'xml', 'webmanifest', 'woff', 'woff2', 'ttf', 'css', 'js', 'map'];
    for (const ext of exts) expect(await policyOf(`/yok.${ext}`), ext).toBe('static');
  });
});
