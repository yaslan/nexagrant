import { describe, expect, it, vi } from 'vitest';

/**
 * `R2_PUBLIC_HOST` decides whether a stored evidence file can be linked at all.
 *
 * The host used to be a literal in six places, on a domain the company retired,
 * so every upload recorded a download link that resolves nowhere
 * (TASK-MTV5ESBVAHUEV). The replacement must keep one property above all: when
 * no public origin is configured it returns null and no URL is invented.
 */
async function loadStorage(fakeEnv: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock('@/lib/env', () => ({ env: fakeEnv }));
  return import('@/lib/storage');
}

const KEY = 'tenant-1/org-default/certificate/2026/ab12cd34_belge.pdf';

describe('publicObjectUrl', () => {
  it('returns null when R2_PUBLIC_HOST is unset', async () => {
    const { publicObjectUrl } = await loadStorage({});
    expect(publicObjectUrl(KEY)).toBeNull();
  });

  it('builds the URL from the configured origin', async () => {
    const { publicObjectUrl } = await loadStorage({ R2_PUBLIC_HOST: 'https://files.example.org' });
    expect(publicObjectUrl(KEY)).toBe(`https://files.example.org/${KEY}`);
  });

  it('does not double the separator when the origin ends in a slash', async () => {
    const { publicObjectUrl } = await loadStorage({ R2_PUBLIC_HOST: 'https://files.example.org/' });
    expect(publicObjectUrl(KEY)).toBe(`https://files.example.org/${KEY}`);
  });
});

describe('EVIDENCE_BUCKET', () => {
  it('follows R2_BUCKET so a caller cannot drift from the deployed bucket', async () => {
    const { EVIDENCE_BUCKET } = await loadStorage({ R2_BUCKET: 'fabrika-evidence-eu' });
    expect(EVIDENCE_BUCKET).toBe('fabrika-evidence-eu');
  });

  it('keeps a bucket name when R2_BUCKET is unset — stored objects still need one', async () => {
    const { EVIDENCE_BUCKET } = await loadStorage({});
    expect(EVIDENCE_BUCKET).toBeTruthy();
  });
});
