import { describe, expect, it } from 'vitest';

import { isLocalDatabaseUrl, parseSeatRescoreArgs } from '@/lib/scoring/seat-rescore-args';

/**
 * FO-147 (Ö1) — `jobs:seat-rescore` must never write every tenant because `--tenant` lost its
 * value, and must not write to a non-local database without an explicit extra flag.
 */

const LOCAL = 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const REMOTE = 'postgresql://app:secret@db.example-project.supabase.co:5432/fabrika';

describe('parseSeatRescoreArgs — tenant scope', () => {
  it('refuses a bare --apply with no scope', () => {
    expect(() => parseSeatRescoreArgs(['--apply'], LOCAL)).toThrow(/Name the scope/);
  });

  it('refuses a bare run with no scope, dry or not', () => {
    expect(() => parseSeatRescoreArgs([], LOCAL)).toThrow(/Name the scope/);
  });

  it('refuses --tenant with no value at the end of argv', () => {
    expect(() => parseSeatRescoreArgs(['--apply', '--tenant'], LOCAL)).toThrow(/--tenant needs/);
  });

  it('refuses --tenant whose "value" is another flag, and does not swallow that flag', () => {
    expect(() => parseSeatRescoreArgs(['--tenant', '--apply'], LOCAL)).toThrow(/--tenant needs/);
  });

  it('refuses --tenant= with an empty value', () => {
    expect(() => parseSeatRescoreArgs(['--tenant=', '--apply'], LOCAL)).toThrow(/--tenant needs/);
  });

  it('refuses a whitespace-only --tenant value', () => {
    expect(() => parseSeatRescoreArgs(['--tenant', '   ', '--apply'], LOCAL)).toThrow(/--tenant needs/);
  });

  it('accepts --tenant <id> --apply and writes that tenant only', () => {
    expect(parseSeatRescoreArgs(['--tenant', 'demo-tenant', '--apply'], LOCAL)).toEqual({
      apply: true,
      tenantId: 'demo-tenant',
      allTenants: false,
      verbose: false,
    });
  });

  it('accepts --tenant=<id> and trims the id', () => {
    expect(parseSeatRescoreArgs(['--tenant= demo-tenant ', '--dry-run'], LOCAL)).toMatchObject({
      apply: false,
      tenantId: 'demo-tenant',
    });
  });

  it('accepts --all-tenants --apply as the explicit all-tenant write', () => {
    expect(parseSeatRescoreArgs(['--all-tenants', '--apply'], LOCAL)).toEqual({
      apply: true,
      tenantId: null,
      allTenants: true,
      verbose: false,
    });
  });

  it('refuses --tenant together with --all-tenants', () => {
    expect(() =>
      parseSeatRescoreArgs(['--tenant', 'demo-tenant', '--all-tenants', '--apply'], LOCAL),
    ).toThrow(/not both/);
  });

  it('skips the bare pnpm separator', () => {
    expect(parseSeatRescoreArgs(['--', '--tenant', 'demo-tenant', '--apply'], LOCAL)).toMatchObject({
      apply: true,
      tenantId: 'demo-tenant',
    });
  });

  it('rejects unknown flags', () => {
    expect(() => parseSeatRescoreArgs(['--all-tenants', '--force'], LOCAL)).toThrow(/Unknown flag/);
  });
});

describe('parseSeatRescoreArgs — remote database guard', () => {
  it('refuses --apply against a remote host without --confirm-remote-db', () => {
    expect(() => parseSeatRescoreArgs(['--all-tenants', '--apply'], REMOTE)).toThrow(
      /--confirm-remote-db/,
    );
  });

  it('accepts --apply against a remote host once --confirm-remote-db is given', () => {
    expect(
      parseSeatRescoreArgs(['--all-tenants', '--apply', '--confirm-remote-db'], REMOTE),
    ).toMatchObject({ apply: true, allTenants: true });
  });

  it('allows a dry run against a remote host without the extra flag', () => {
    expect(parseSeatRescoreArgs(['--tenant', 'demo-tenant'], REMOTE)).toMatchObject({ apply: false });
  });

  it('treats an unparseable DATABASE_URL as remote, so --apply needs the flag', () => {
    expect(() => parseSeatRescoreArgs(['--all-tenants', '--apply'], 'not a url')).toThrow(
      /--confirm-remote-db/,
    );
  });
});

describe('isLocalDatabaseUrl', () => {
  it.each([
    ['unset (db.ts falls back to localhost)', undefined],
    ['empty (db.ts falls back to localhost)', ''],
    ['localhost', LOCAL],
    ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5670/fabrika'],
    ['IPv6 loopback', 'postgresql://u:p@[::1]:5432/fabrika'],
  ])('%s is local', (_label, url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it('a managed host is not local', () => {
    expect(isLocalDatabaseUrl(REMOTE)).toBe(false);
  });
});
