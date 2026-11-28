import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * NG-369 (Ö5): deleting an object that is not in the dev store is a success, the same answer as S3's
 * DeleteObject for a missing key. An infected file whose object was already gone used to report a
 * failed removal on every sweep, so the retry never stopped.
 *
 * Dev store only (no R2 account): `storage.ts` resolves the path under `.dev-objects`. The failure
 * answer (`false`) stays for a key that has no place in the dev store at all (unsafe characters, or
 * production, where there is no local store): the object may exist somewhere we cannot reach.
 */
// storage.ts picks its backend at module load from process.env (R2_ACCOUNT_ID), not from the
// mocked `env` below. A gate that sets CI's R2 test values (MinIO) would otherwise send these
// calls to R2, so the account is cleared for each load and restored after each test.
async function loadStorage(fakeEnv: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv('R2_ACCOUNT_ID', '');
  vi.stubEnv('R2_ENDPOINT', '');
  vi.doMock('@/lib/env', () => ({ env: fakeEnv }));
  return import('@/lib/storage');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deleteObjectBytes, dev store (NG-369 Ö5)', () => {
  it('an object that is not there is removed: true (the removal is done)', async () => {
    const storage = await loadStorage({});
    const key = `ng369-missing/${Date.now().toString(36)}/none.bin`;
    await expect(storage.deleteObjectBytes(key)).resolves.toBe(true);
  });

  it('a key with no place in the dev store is not removed: false (nothing is known to be gone)', async () => {
    const storage = await loadStorage({});
    await expect(storage.deleteObjectBytes('../escape.bin')).resolves.toBe(false);
  });
});
