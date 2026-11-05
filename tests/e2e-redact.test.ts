import { describe, expect, it } from 'vitest';

import { redact } from './e2e/support/redact.mjs';

// FO-385: the process listing in the e2e server diagnostics must not show credentials.
describe('e2e process listing redaction (FO-385)', () => {
  it('masks a URL password', () => {
    expect(redact('psql postgresql://fabrika:s3cret@127.0.0.1:5432/db')).toBe(
      'psql postgresql://***@127.0.0.1:5432/db',
    );
  });

  it('masks NAME=value and --name=value', () => {
    expect(redact('ANTHROPIC_API_KEY=sk-live-1 next dev')).toBe('ANTHROPIC_API_KEY=*** next dev');
    expect(redact('node x --token=abc --port=3400')).toBe('node x --token=*** --port=3400');
  });

  it('masks --name value given with a space', () => {
    expect(redact('node x --api-key sk-live-2 --port 3400')).toBe('node x --api-key *** --port 3400');
  });

  it('masks a quoted value that contains spaces', () => {
    expect(redact('DB_PASSWORD="a b c" next dev')).toBe('DB_PASSWORD=*** next dev');
    expect(redact("SECRET='x y' run")).toBe('SECRET=*** run');
  });

  it('masks the quoted value after --name with a space', () => {
    expect(redact('tool --api-key "a b" --x 1')).toBe('tool --api-key *** --x 1');
  });

  // FO-385 round 2 (review finding A): forms that leaked in the first mask.
  it('masks PASS= and DB_PASS= (PASS is a secret name, not only PASSWORD)', () => {
    expect(redact('DB_PASS=hunter2 node server.js')).toBe('DB_PASS=*** node server.js');
    expect(redact('PASS=hunter4 next dev')).toBe('PASS=*** next dev');
  });

  it('masks --passwd=value', () => {
    expect(redact('mysql --passwd=hunter3 -h x')).toBe('mysql --passwd=*** -h x');
  });

  it('masks the password after sshpass -p', () => {
    expect(redact('sshpass -p hunter5 ssh host')).toBe('sshpass -p *** ssh host');
    expect(redact("sshpass -p 'a b' ssh host")).toBe("sshpass -p *** ssh host");
  });

  it('masks an Authorization header value (Bearer token) inside quotes', () => {
    expect(redact('curl -H "Authorization: Bearer ZZZ" https://x')).toBe(
      'curl -H "Authorization: Bearer ***" https://x',
    );
    expect(redact('curl -H Authorization:abc123 x')).toBe('curl -H Authorization:*** x');
  });

  it('masks a URL password that contains a slash', () => {
    expect(redact('postgres://user:p/ss@host/db')).toBe('postgres://***@host/db');
  });

  it('masks a URL password that contains an @ (up to the last @ of the token)', () => {
    expect(redact('postgres://user:p@ss@host/db')).toBe('postgres://***@host/db');
  });

  it('masks an unterminated quoted value to the end of the line', () => {
    expect(redact('TOKEN="abc def ghi')).toBe('TOKEN=***');
    expect(redact("SECRET='x y")).toBe('SECRET=***');
  });

  it('masks COOKIE=session=value', () => {
    expect(redact('COOKIE=session=abcdef node')).toBe('COOKIE=*** node');
  });

  it('leaves lines without secrets unchanged', () => {
    expect(redact('next dev --port 3400')).toBe('next dev --port 3400');
    expect(redact('playwright test tests/e2e/auth.spec.ts')).toBe('playwright test tests/e2e/auth.spec.ts');
  });
});
