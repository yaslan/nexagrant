import { describe, it, expect, vi } from 'vitest';
import { appBaseUrl, appUrl, appUrlProblem, CANONICAL_APP_URL } from './app-url';
import { reportAppUrlProblem } from './app-url-alert';

// TASK-MUN3OAFIVW9NA — every self-link reads NEXT_PUBLIC_APP_URL; live = https://nexagrant.com.
const prod = (NEXT_PUBLIC_APP_URL?: string) => ({ NODE_ENV: 'production' as const, NEXT_PUBLIC_APP_URL });
const dev = (NEXT_PUBLIC_APP_URL?: string) => ({ NODE_ENV: 'development' as const, NEXT_PUBLIC_APP_URL });

describe('appBaseUrl', () => {
  it('returns the configured origin without a trailing slash', () => {
    expect(appBaseUrl(prod('https://nexagrant.com/'))).toBe('https://nexagrant.com');
    expect(appBaseUrl(prod(' https://nexagrant.com '))).toBe('https://nexagrant.com');
  });

  it('is null when unset, blank, not a URL, or loopback in production', () => {
    expect(appBaseUrl(prod(undefined))).toBeNull();
    expect(appBaseUrl(dev('  '))).toBeNull();
    expect(appBaseUrl(prod('nexagrant.com'))).toBeNull();
    for (const url of ['http://localhost:3000', 'http://127.0.0.1', 'http://LOCALHOST.', 'http://[::1]:3000']) {
      expect(appBaseUrl(prod(url))).toBeNull();
    }
  });

  it('keeps a loopback URL set on purpose in development', () => {
    expect(appBaseUrl(dev('http://localhost:3000'))).toBe('http://localhost:3000');
  });

  // B-1 of İNCELEME-39: the docs say an http:// value keeps Calendar connect and
  // invitation mails off; appBaseUrl() is what both of them read.
  it('is null in production for an http:// value, so nothing is built on it', () => {
    expect(appBaseUrl(prod('http://nexagrant.com'))).toBeNull();
    expect(appBaseUrl(prod('HTTP://nexagrant.com/'))).toBeNull();
  });

  // B-3 of İNCELEME-39: `https://nexagrant.com/?x=1` used to come back whole, and
  // the redirect_uri became `https://nexagrant.com/?x=1/api/calendar/callback`.
  it('is null in production for any value with more than an origin', () => {
    for (const url of [
      'https://nexagrant.com/?x=1',
      'https://nexagrant.com#top',
      'https://nexagrant.com/app',
      'https://user:pass@nexagrant.com',
    ]) {
      expect(appBaseUrl(prod(url))).toBeNull();
    }
  });

  it('returns only the origin outside production', () => {
    expect(appBaseUrl(dev('http://localhost:3000/?x=1#y'))).toBe('http://localhost:3000');
    expect(appBaseUrl(dev('http://localhost:3000/app/'))).toBe('http://localhost:3000');
    expect(appBaseUrl(dev('mailto:someone@example.invalid'))).toBeNull();
  });
});

describe('appUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when it is usable', () => {
    expect(appUrl(prod('https://nexagrant.com'))).toBe('https://nexagrant.com');
  });

  it('never falls back to localhost in production', () => {
    expect(appUrl(prod(undefined))).toBe(CANONICAL_APP_URL);
    expect(appUrl(prod('http://localhost:3000'))).toBe('https://nexagrant.com');
    expect(appUrl(prod('http://nexagrant.com'))).toBe(CANONICAL_APP_URL);
    expect(appUrl(prod('https://nexagrant.com/?x=1'))).toBe(CANONICAL_APP_URL);
  });

  it('falls back to localhost outside production', () => {
    expect(appUrl(dev(undefined))).toBe('http://localhost:3000');
  });
});

describe('appUrlProblem', () => {
  it('names what is wrong in production', () => {
    expect(appUrlProblem(prod(undefined))).toBe('unset');
    expect(appUrlProblem(prod('nexagrant.com'))).toBe('invalid');
    expect(appUrlProblem(prod('http://localhost:3000'))).toBe('loopback');
    expect(appUrlProblem(prod('https://127.0.0.1'))).toBe('loopback');
    expect(appUrlProblem(prod('http://nexagrant.com'))).toBe('insecure');
    expect(appUrlProblem(prod('https://nexagrant.com'))).toBeNull();
    expect(appUrlProblem(prod('https://nexagrant.com/'))).toBeNull();
  });

  it('calls a query, fragment, path or credentials in the value invalid (B-3)', () => {
    for (const url of [
      'https://nexagrant.com/?x=1',
      'https://nexagrant.com?',
      'https://nexagrant.com#top',
      'https://nexagrant.com/app',
      'https://user:pass@nexagrant.com',
    ]) {
      expect(appUrlProblem(prod(url))).toBe('invalid');
    }
  });

  it('is null exactly when appBaseUrl() has a value in production', () => {
    for (const url of [undefined, 'nexagrant.com', 'http://localhost:3000', 'http://nexagrant.com', 'https://nexagrant.com/?x=1', 'https://nexagrant.com', 'https://nexagrant.com/']) {
      expect(appUrlProblem(prod(url)) === null).toBe(appBaseUrl(prod(url)) !== null);
    }
  });

  it('is silent outside production', () => {
    expect(appUrlProblem(dev('http://localhost:3000'))).toBeNull();
    expect(appUrlProblem(dev(undefined))).toBeNull();
  });
});

describe('reportAppUrlProblem', () => {
  it('writes one error SystemAlert per problem in production', async () => {
    const record = vi.fn().mockResolvedValue({ status: 'recorded', id: 'a1' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await reportAppUrlProblem(prod('http://nexagrant.com'), record)).toBe('insecure');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', source: 'app-url', dedupeKey: 'app-url:insecure' })
    );
    expect(record.mock.calls[0]?.[0].message).toContain('https://nexagrant.com');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('writes nothing when the URL is fine or outside production', async () => {
    const record = vi.fn();
    expect(await reportAppUrlProblem(prod('https://nexagrant.com'), record)).toBeNull();
    expect(await reportAppUrlProblem(dev('http://localhost:3000'), record)).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
});
