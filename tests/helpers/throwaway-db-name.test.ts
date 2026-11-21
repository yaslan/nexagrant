import { afterEach, describe, expect, it } from 'vitest';
import { isThrowawayDbName } from './live-db-role';

/** NG-266: which database names a live suite may write to. */
describe('isThrowawayDbName', () => {
  const savedGha = process.env.GITHUB_ACTIONS;
  afterEach(() => {
    if (savedGha === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = savedGha;
  });

  it('accepts names that say test, and the isolated gate database', () => {
    delete process.env.GITHUB_ACTIONS;
    expect(isThrowawayDbName('fabrika_test')).toBe(true);
    expect(isThrowawayDbName('fabrika_test_ng266')).toBe(true);
    expect(isThrowawayDbName('test')).toBe(true);
    expect(isThrowawayDbName('fabrika_gate')).toBe(true);
  });

  it('refuses the shared dev database name locally', () => {
    delete process.env.GITHUB_ACTIONS;
    expect(isThrowawayDbName('fabrika')).toBe(false);
  });

  it('accepts the CI service database only on GitHub Actions', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(isThrowawayDbName('fabrika')).toBe(true);
    process.env.GITHUB_ACTIONS = 'false';
    expect(isThrowawayDbName('fabrika')).toBe(false);
  });

  it('refuses names that merely contain the word "latest" or nothing test-like', () => {
    delete process.env.GITHUB_ACTIONS;
    expect(isThrowawayDbName('fabrika_latest')).toBe(false);
    expect(isThrowawayDbName('prod')).toBe(false);
    expect(isThrowawayDbName('postgres')).toBe(false);
  });
});
