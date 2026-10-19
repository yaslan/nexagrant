import { describe, test, expect } from 'vitest';
import { publicAssetHostIsLoopback } from '@/lib/security-headers';

/** TASK-MUU20XFIXZKTE — the optimizer's private-IP guard is lifted only for a loopback public bucket. */
describe('publicAssetHostIsLoopback', () => {
  test.each([
    'http://localhost:9000/test-public',
    'http://127.0.0.1:9000/test-public',
    'http://[::1]:9000/test-public',
  ])('loopback: %s', (v) => expect(publicAssetHostIsLoopback(v)).toBe(true));

  test.each([
    undefined,
    '',
    'not a url',
    'https://ref.supabase.co/storage/v1/object/public/blog',
    'https://pub-abc.r2.dev',
    'http://10.0.0.5:9000/test-public',
    'http://localhost.evil.example/x',
    'http://127.0.0.1.nip.io/x',
  ])('not loopback: %s', (v) => expect(publicAssetHostIsLoopback(v)).toBe(false));
});
