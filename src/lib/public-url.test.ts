import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { publicUrl } from './public-url';

describe('publicUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses AUTH_URL when set', () => {
    process.env.AUTH_URL = 'https://fonbridge.com';
    expect(publicUrl()).toBe('https://fonbridge.com');
  });

  it('strips path from AUTH_URL', () => {
    process.env.AUTH_URL = 'https://fonbridge.com/api/auth/callback';
    expect(publicUrl()).toBe('https://fonbridge.com');
  });

  it('preserves port in AUTH_URL', () => {
    process.env.AUTH_URL = 'https://fonbridge.com:8443/path';
    expect(publicUrl()).toBe('https://fonbridge.com:8443');
  });

  it('falls back to NEXT_PUBLIC_APP_URL when AUTH_URL is unset', () => {
    delete process.env.AUTH_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
    expect(publicUrl()).toBe('https://example.com');
  });

  it('ignores NEXT_PUBLIC_APP_URL when AUTH_URL is set', () => {
    process.env.AUTH_URL = 'https://fonbridge.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
    expect(publicUrl()).toBe('https://fonbridge.com');
  });

  it('falls back to localhost when both are unset', () => {
    delete process.env.AUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(publicUrl()).toBe('http://localhost:3000');
  });

  it('returns localhost when AUTH_URL is invalid', () => {
    process.env.AUTH_URL = 'not a url';
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(publicUrl()).toBe('http://localhost:3000');
  });

  it('returns localhost when both AUTH_URL and NEXT_PUBLIC_APP_URL are invalid', () => {
    process.env.AUTH_URL = 'invalid';
    process.env.NEXT_PUBLIC_APP_URL = 'also invalid';
    expect(publicUrl()).toBe('http://localhost:3000');
  });

  it('falls back to request origin when both env vars are unset', () => {
    delete process.env.AUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new NextRequest('https://proxy.example.com:8080/path?query=1');
    expect(publicUrl(req)).toBe('https://proxy.example.com:8080');
  });

  it('prefers AUTH_URL over request origin', () => {
    process.env.AUTH_URL = 'https://fonbridge.com';
    const req = new NextRequest('https://proxy.example.com/path');
    expect(publicUrl(req)).toBe('https://fonbridge.com');
  });

  it('prefers NEXT_PUBLIC_APP_URL over request origin', () => {
    delete process.env.AUTH_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const req = new NextRequest('https://proxy.example.com/path');
    expect(publicUrl(req)).toBe('https://app.example.com');
  });

  it('uses request origin even if request URL has query params', () => {
    delete process.env.AUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new NextRequest('https://proxy.example.com:9000/api/callback?code=abc');
    expect(publicUrl(req)).toBe('https://proxy.example.com:9000');
  });
});
