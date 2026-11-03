import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCi, isLocalDbUrl, requireRlsTestUrl, requireTestEnv, skipOrFailInCi, usedDatabaseName, type RawQueryable } from './live-db-role';

/**
 * İNCELEME-62 O-1 — these four decide whether a live suite in CI throws or
 * quietly skips, and CI itself never takes their failing branch (it has the
 * database and AUTH_SECRET). Without a test of their own, `if (isCi())` → `if
 * (false)` or `if (value) return value` → `return undefined` put the job back to
 * "38 skipped, step green" with every suite still passing.
 */

const env = (vars: Record<string, string | undefined>) => vars as unknown as NodeJS.ProcessEnv;
const muteStderr = () => vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

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
    const write = muteStderr();
    expect(() => skipOrFailInCi('suite-x', 'thing missing')).not.toThrow();
    expect(write).toHaveBeenCalledWith('WARNING suite-x skipped: thing missing\n');
  });

  it('does not rely on console.warn, which reporters drop for a fully skipped file (FO-357)', () => {
    vi.stubEnv('CI', '');
    muteStderr();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    skipOrFailInCi('suite-x', 'thing missing');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('usedDatabaseName', () => {
  const conn = (db: string, cluster = 'c1'): RawQueryable => ({
    $queryRawUnsafe: (async () => [{ db, cluster }]) as RawQueryable['$queryRawUnsafe'],
  });
  const broken: RawQueryable = {
    $queryRawUnsafe: (async () => {
      throw new Error('password authentication failed for user "fabrika_app"\nsecond line');
    }) as RawQueryable['$queryRawUnsafe'],
  };

  const failing = (message: string): RawQueryable => ({
    $queryRawUnsafe: (async () => {
      throw new Error(message);
    }) as RawQueryable['$queryRawUnsafe'],
  });
  // The text Prisma's driver adapter really produced for these roles (FO-366 F1, measured).
  const prismaError = (code: string, message: string): string =>
    `\nInvalid \`prisma.$queryRawUnsafe()\` invocation:\n\n\nRaw query failed. Code: \`${code}\`. Message: \`${message}\``;
  const denied = failing(prismaError('42501', 'permission denied for function pg_control_system'));

  it('returns the name both connections agree on', async () => {
    await expect(usedDatabaseName(conn('throwaway'), conn('throwaway'), 's')).resolves.toBe('throwaway');
  });

  it.each([[''], ['true']])('refuses two databases with CI=%j, naming both (FO-356 scenario I)', async (ci) => {
    vi.stubEnv('CI', ci);
    await expect(usedDatabaseName(conn('fabrika'), conn('fabrika_probe'), 's')).rejects.toThrow(
      /different databases \(DATABASE_URL: "fabrika_probe".*DATABASE_URL_RLS_TEST: "fabrika"/,
    );
  });

  it('refuses the same name on two clusters', async () => {
    await expect(usedDatabaseName(conn('fabrika', 'c1'), conn('fabrika', 'c2'), 's')).rejects.toThrow(/different databases/);
  });

  it('locally: an unreadable used connection skips, naming only the first line', async () => {
    vi.stubEnv('CI', '');
    const write = muteStderr();
    await expect(usedDatabaseName(broken, conn('fabrika'), 's')).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledWith(
      'WARNING s skipped: could not read which database it would run on (password authentication failed for user "fabrika_app")\n',
    );
  });

  it('locally: names the cause of a Prisma error, not its blank first line or its header', async () => {
    vi.stubEnv('CI', '');
    const write = muteStderr();
    const stale = failing(prismaError('28P01', 'password authentication failed for user "fabrika_app"'));
    await expect(usedDatabaseName(stale, conn('fabrika'), 's')).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledWith(
      'WARNING s skipped: could not read which database it would run on (Raw query failed. Code: `28P01`. Message: `password authentication failed for user "fabrika_app"`)\n',
    );
  });

  it('locally: a role refused pg_control_system() (42501) is told to GRANT it', async () => {
    vi.stubEnv('CI', '');
    const write = muteStderr();
    await expect(usedDatabaseName(denied, conn('fabrika'), 's')).resolves.toBeUndefined();
    const line = String(write.mock.calls[0]?.[0]);
    expect(line).toContain('permission denied for function pg_control_system');
    expect(line).toContain('GRANT EXECUTE ON FUNCTION pg_control_system()');
    expect(line).not.toContain('Provide the database');
  });

  it('in CI: 42501 throws with the GRANT, and sends nobody to db:rls-role for it', async () => {
    vi.stubEnv('CI', 'true');
    const thrown = await usedDatabaseName(denied, conn('fabrika'), 's').catch((e: Error) => e.message);
    expect(thrown).toContain('refusing to skip in CI');
    expect(thrown).toContain('permission denied for function pg_control_system');
    expect(thrown).toContain('GRANT EXECUTE ON FUNCTION pg_control_system()');
    expect(thrown).toContain('`pnpm db:rls-role` does not grant this');
    expect(thrown).not.toContain('Provide the database');
  });

  it('does not take 42501 in a port number for the permission code', async () => {
    vi.stubEnv('CI', 'true');
    const unreachable = failing(prismaError('N/A', "Can't reach database server at 127.0.0.1:42501"));
    await expect(usedDatabaseName(unreachable, conn('fabrika'), 's')).rejects.toThrow(/Provide the database/);
  });

  it('does not read an error without a message as an empty cause', async () => {
    vi.stubEnv('CI', '');
    const write = muteStderr();
    await expect(usedDatabaseName(failing('\n\n'), conn('fabrika'), 's')).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledWith('WARNING s skipped: could not read which database it would run on (Error)\n');
  });

  it('in CI: an unreadable used connection throws', async () => {
    vi.stubEnv('CI', 'true');
    await expect(usedDatabaseName(broken, conn('fabrika'), 's')).rejects.toThrow(/refusing to skip in CI/);
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
    muteStderr();
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
    const write = muteStderr();
    expect(requireTestEnv(NAME, 's')).toBeUndefined();
    expect(write).toHaveBeenCalledWith(`WARNING s skipped: ${NAME} is not set\n`);
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
