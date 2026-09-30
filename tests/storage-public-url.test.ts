import { describe, expect, it, vi } from 'vitest';

/**
 * The bucket name has one source (TASK-MTV5ESBVAHUEV). Public object URLs are
 * gone (B-2, TASK-MUNODY0DVDWC5): evidence is read through the authenticated
 * download route, so no link on `R2_PUBLIC_HOST` is built any more.
 */
async function loadStorage(fakeEnv: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock('@/lib/env', () => ({ env: fakeEnv }));
  return import('@/lib/storage');
}

describe('public object URLs', () => {
  it('are not built even when R2_PUBLIC_HOST is set', async () => {
    const storage = await loadStorage({ R2_PUBLIC_HOST: 'https://files.example.org' });
    expect('publicObjectUrl' in storage).toBe(false);
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
