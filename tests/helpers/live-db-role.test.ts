import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCi, isLocalDbUrl, requireRlsTestUrl, requireTestEnv, skipOrFailInCi } from './live-db-role';

/**
 * İNCELEME-62 O-1 — these four decide whether a live suite in CI throws or
 * quietly skips, and CI itself never takes their failing branch (it has the
 * database and AUTH_SECRET). Without a test of their own, `if (isCi())` → `if
 * (false)` or `if (value) return value` → `return undefined` put the job back to
 * "38 skipped, step green" with every suite still passing.
 */

const env = (vars: Record<string, string | undefined>) => vars as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('isCi', () => {
  it.each([['true'], ['1'], ['yes'], [' TRUE ']])('CI=%j is CI', (v) => {
    expect(isCi(env({ CI: v }))).toBe(true);
  });
  it.each([[undefined], [''], ['0'], ['false'], [' False ']])('CI=%j is not', (v) => {
    expect(isCi(env({ CI: v }))).toBe(false);
  });
});

describe('skipOrFailInCi', () => {
  it('throws in CI, naming the suite, the reason and the fix', () => {
    vi.stubEnv('CI', 'true');
    expect(() => skipOrFailInCi('suite-x', 'thing missing', 'Do Y.')).toThrow(
      'suite-x: refusing to skip in CI — thing missing. Do Y.',
    );
  });

  it('only warns locally', () => {
    vi.stubEnv('CI', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => skipOrFailInCi('suite-x', 'thing missing')).not.toThrow();
    expect(warn).toHaveBeenCalledWith('suite-x skipped: thing missing');
  });
});

describe('requireRlsTestUrl', () => {
  it('returns the URL when there is one, in CI or not', () => {
    vi.stubEnv('CI', 'true');
    expect(requireRlsTestUrl('postgres://x', 's')).toBe('postgres://x');
  });

  it('throws in CI when it is missing or empty', () => {
    vi.stubEnv('CI', 'true');
    expect(() => requireRlsTestUrl(undefined, 's')).toThrow(/refusing to skip in CI.*DATABASE_URL_RLS_TEST/);
    expect(() => requireRlsTestUrl('', 's')).toThrow(/refusing to skip in CI/);
  });

  it('locally: undefined after a warning', () => {
    vi.stubEnv('CI', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(requireRlsTestUrl(undefined, 's')).toBeUndefined();
  });
});

describe('requireTestEnv (the AUTH_SECRET guard of İNCELEME-54 Y-1)', () => {
  const NAME = 'FB_TEST_ONLY_REQUIRED_VALUE';

  it('returns the value when it is set — in CI too', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv(NAME, 'fixture');
    expect(requireTestEnv(NAME, 's')).toBe('fixture');
  });

  it('throws in CI when it is unset or empty, and points at ci.yml', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv(NAME, '');
    expect(() => requireTestEnv(NAME, 's')).toThrow(
      `s: refusing to skip in CI — ${NAME} is not set. Set a test-only ${NAME} in the Test step of .github/workflows/ci.yml.`,
    );
    vi.stubEnv(NAME, undefined);
    expect(() => requireTestEnv(NAME, 's')).toThrow(/refusing to skip in CI/);
  });

  it('locally: undefined after a warning', () => {
    vi.stubEnv('CI', '');
    vi.stubEnv(NAME, undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(requireTestEnv(NAME, 's')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(`s skipped: ${NAME} is not set`);
  });
});

// TASK-MVDVCQW3GI94J — blog-posts.live.test.ts runs DDL only where this says local.
describe('isLocalDbUrl', () => {
  it.each([
    ['postgresql://u:pw@localhost:5587/fabrika'],
    ['postgresql://u:pw@127.0.0.1:5587/fabrika?schema=public'],
  ])('%s is local', (url) => {
    expect(isLocalDbUrl(url)).toBe(true);
  });
  it.each([
    ['postgresql://u:pw@db.example.invalid:5432/postgres'],
    ['postgresql://u:pw@localhost:5587/fabrika?host=db.example.invalid'],
    ['postgresql://u:pw@localhost:5587,db.example.invalid:5432/fabrika'],
    ['not a url'],
  ])('%s is not', (url) => {
    expect(isLocalDbUrl(url)).toBe(false);
  });
});
