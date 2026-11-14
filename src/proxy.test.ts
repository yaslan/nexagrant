import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-124: the proxy sends Strict-Transport-Security only in production and only
 * over HTTPS. `env.NODE_ENV` is read once at import (src/lib/env.ts), so each
 * case stubs the environment and loads a fresh copy of the proxy module.
 */
async function loadProxyWithNodeEnv(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  // env.ts refuses the public test-fixture tax-id key in production; give it a fresh real key.
  vi.stubEnv('TAX_ID_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  const mod = await import('./proxy');
  return mod.proxy;
}

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('proxy — Strict-Transport-Security (NG-124)', () => {
  it('production over HTTPS (request URL scheme) sends max-age=300', async () => {
    const proxy = await loadProxyWithNodeEnv('production');
    const res = proxy(request('https://nexagrant.example/tr'));
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=300');
  });

  it('production behind the TLS-terminating proxy (x-forwarded-proto: https) sends max-age=300', async () => {
    const proxy = await loadProxyWithNodeEnv('production');
    const res = proxy(request('http://127.0.0.1:3000/tr', { 'x-forwarded-proto': 'https' }));
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=300');
  });

  it('production over plain HTTP with no forwarded proto sends no HSTS', async () => {
    const proxy = await loadProxyWithNodeEnv('production');
    const res = proxy(request('http://127.0.0.1:3000/tr'));
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('development over HTTPS sends no HSTS', async () => {
    const proxy = await loadProxyWithNodeEnv('development');
    const res = proxy(request('https://localhost:3000/tr', { 'x-forwarded-proto': 'https' }));
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });
});
