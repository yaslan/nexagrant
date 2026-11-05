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

  it('leaves lines without secrets unchanged', () => {
    expect(redact('next dev --port 3400')).toBe('next dev --port 3400');
    expect(redact('playwright test tests/e2e/auth.spec.ts')).toBe('playwright test tests/e2e/auth.spec.ts');
  });
});
