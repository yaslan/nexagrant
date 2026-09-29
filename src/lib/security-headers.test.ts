import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import nextConfig from '../../next.config';
import { proxy } from '../proxy';
import {
  API_CONTENT_SECURITY_POLICY,
  PRINT_BUTTON_HANDLER,
  PRINT_BUTTON_HANDLER_SHA256,
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  cspHeaderName,
  cspOptionsFromEnv,
  generateNonce,
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
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
      },
    ]);
  });

  it('HSTS has no preload (a patron decision, not ours)', () => {
    const hsts = STATIC_SECURITY_HEADERS.find((h) => h.key === 'Strict-Transport-Security');
    expect(hsts?.value).not.toMatch(/preload/i);
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

  it('enforces by default; CSP_MODE=report-only is the rollback switch', () => {
    expect(cspHeaderName(env({}))).toBe('Content-Security-Policy');
    expect(cspHeaderName(env({ CSP_MODE: 'enforce' }))).toBe('Content-Security-Policy');
    expect(cspHeaderName(env({ CSP_MODE: ' Report-Only ' }))).toBe('Content-Security-Policy-Report-Only');
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
