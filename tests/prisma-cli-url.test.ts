import { describe, test, expect } from 'vitest';
import path from 'path';

import { toPrismaCliUrl } from '../prisma/cli-url';

// TASK-MUOG51GJ3PUOG Y-1 (R-S7): the Prisma CLI ignores libpq's verify-full and
// sslrootcert, so prisma.config.ts converts them to Prisma's strict spelling.
const ROOT = path.resolve(import.meta.dirname, '..');
const CA = path.join(ROOT, 'certs/supabase-prod-ca-2021.crt');
const BASE = 'postgresql://fabrika_migrate.ref:p%40ss@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

function params(url: string | undefined) {
  return Object.fromEntries(new URL(url!).searchParams);
}

describe('toPrismaCliUrl', () => {
  test('verify-full + relative sslrootcert → require + strict + absolute sslcert', () => {
    const out = toPrismaCliUrl(`${BASE}?sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt`, ROOT);
    expect(params(out)).toStrictEqual({ sslmode: 'require', sslaccept: 'strict', sslcert: CA });
  });

  test('absolute sslrootcert stays the same path', () => {
    const out = toPrismaCliUrl(`${BASE}?sslmode=verify-full&sslrootcert=${CA}`, '/');
    expect(params(out).sslcert).toBe(CA);
  });

  test('credentials, host, database and other parameters are kept', () => {
    const out = toPrismaCliUrl(
      `${BASE}?connection_limit=5&sslmode=verify-full&sslrootcert=${CA}&schema=public`,
      ROOT
    )!;
    const u = new URL(out);
    expect(u.username).toBe('fabrika_migrate.ref');
    expect(u.password).toBe('p%40ss');
    expect(u.host).toBe('aws-0-eu-west-1.pooler.supabase.com:5432');
    expect(u.pathname).toBe('/postgres');
    expect(params(out)).toStrictEqual({
      connection_limit: '5',
      sslmode: 'require',
      schema: 'public',
      sslaccept: 'strict',
      sslcert: CA,
    });
  });

  test('verify-ca is made strict too (Prisma has no CA-only check)', () => {
    expect(params(toPrismaCliUrl(`${BASE}?sslmode=verify-ca&sslrootcert=${CA}`))).toStrictEqual({
      sslmode: 'require',
      sslaccept: 'strict',
      sslcert: CA,
    });
  });

  test('verify-full without sslrootcert or with system → strict, no sslcert', () => {
    for (const q of ['?sslmode=verify-full', '?sslmode=verify-full&sslrootcert=system']) {
      expect(params(toPrismaCliUrl(BASE + q))).toStrictEqual({ sslmode: 'require', sslaccept: 'strict' });
    }
  });

  test('a missing CA file fails loudly instead of connecting unverified', () => {
    expect(() => toPrismaCliUrl(`${BASE}?sslmode=verify-full&sslrootcert=certs/nope.crt`, ROOT)).toThrow(
      /sslrootcert not found: .*certs\/nope\.crt/
    );
  });

  test('verify-full mixed with sslcert/sslaccept is refused as ambiguous', () => {
    expect(() => toPrismaCliUrl(`${BASE}?sslmode=verify-full&sslrootcert=${CA}&sslcert=/x.crt`)).toThrow(/sslcert\/sslaccept/);
    expect(() => toPrismaCliUrl(`${BASE}?sslmode=verify-full&sslaccept=accept_invalid_certs`)).toThrow(/sslcert\/sslaccept/);
  });

  test('anything else is returned unchanged', () => {
    for (const url of [
      undefined,
      '',
      `${BASE}`,
      `${BASE}?sslmode=disable`,
      `${BASE}?sslmode=require&sslaccept=strict&sslcert=${CA}`,
      'not a url',
    ]) {
      expect(toPrismaCliUrl(url)).toBe(url);
    }
  });
});
