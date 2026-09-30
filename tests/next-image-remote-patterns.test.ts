import { describe, expect, it } from 'vitest';
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern';

import config from '../next.config';

/**
 * TASK-MUNRB2037NA5V (İNCELEME-57 Ö-5) — which remote images `/_next/image` will
 * fetch. Measured with Next's own matcher, so a pattern that reads right but does
 * not match (or matches too much) shows up here rather than as a broken avatar.
 */
const patterns = config('phase-development-server').images?.remotePatterns ?? [];
const allowed = (url: string) => hasRemoteMatch([], patterns, new URL(url));

describe('next.config images.remotePatterns', () => {
  it("lets a Google sign-in's profile picture through", () => {
    expect(allowed('https://lh3.googleusercontent.com/a/ACg8ocKxyz=s96-c')).toBe(true);
  });

  it('still allows the blog images', () => {
    expect(allowed('https://images.unsplash.com/photo-1?w=800')).toBe(true);
  });

  it('refuses plain http, sibling hosts and anything else', () => {
    expect(allowed('http://lh3.googleusercontent.com/a/x')).toBe(false);
    expect(allowed('https://lh4.googleusercontent.com/a/x')).toBe(false);
    expect(allowed('https://evil.googleusercontent.com.example.org/a/x')).toBe(false);
    expect(allowed('https://evil.example.com/x.png')).toBe(false);
  });

  it('refuses a non-default port on the allowed hosts (İNCELEME-71 B-5)', () => {
    expect(allowed('https://lh3.googleusercontent.com:8443/a/x')).toBe(false);
    expect(allowed('https://images.unsplash.com:8080/photo-1')).toBe(false);
  });
});
