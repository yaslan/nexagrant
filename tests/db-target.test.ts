import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// scripts/db-target.sh is POSIX sh, sourced by db-setup.sh and githooks/pre-push.
// Run the real functions, not a copy: fail-closed means the local check must
// refuse every URL that libpq could send to a non-local host.
function probe(url: string): { target: string; local: boolean } {
  const script = [
    '. scripts/db-target.sh',
    'target=$(db_target "$1")',
    'if db_is_local "$1" "${target%%/*}"; then echo local; else echo remote; fi',
    'printf "%s\\n" "$target"',
  ].join('\n');
  const out = execFileSync('sh', ['-c', script, 'probe', url], { encoding: 'utf8' }).trim().split('\n');
  return { local: out[0] === 'local', target: out[1] ?? '' };
}

describe('scripts/db-target.sh', () => {
  it.each([
    ['postgresql://u:pw@localhost:5479/fabrika', 'localhost:5479/fabrika'],
    ['postgresql://u:pw@localhost:5479/fabrika?schema=public', 'localhost:5479/fabrika'],
    ['postgresql://u:p@ss@localhost:5479/fabrika', 'localhost:5479/fabrika'],
  ])('accepts a plain local URL: %s', (url, target) => {
    expect(probe(url)).toEqual({ local: true, target });
  });

  it.each([
    // The @ in the query must not be taken for the userinfo separator.
    'postgresql://u:pw@prod.example.invalid/db?application_name=a@localhost',
    // Percent-encoded query key hides ?host= from a plain grep.
    'postgresql://u:pw@localhost:5479/fabrika?h%6fst=prod.example.invalid',
    'postgresql://u:pw@localhost:5479/fabrika?x=%41&host=prod.example.invalid',
    'postgresql://u:pw@localhost:5479/fabrika?host=prod.example.invalid',
    'postgresql://u:pw@localhost:5479/fabrika?schema=public&host=prod.example.invalid',
    'postgresql://u:pw@localhost:5479/fabrika?schema=public&HostAddr=203.0.113.7',
    'postgresql://u:pw@localhost:5479/fabrika?service=prod',
    // Multi-host list: libpq falls through to the second host when localhost is down.
    'postgresql://u:pw@localhost:5499,prod.example.invalid:5432/fabrika',
    'postgresql://u:pw@prod.example.invalid/fabrika',
    'not a url at all',
  ])('refuses a non-local or overridable URL: %s', (url) => {
    const { local, target } = probe(url);
    expect(local).toBe(false);
    expect(target).not.toContain('pw');
  });

  // A password with # ? or / used to leak into the printed target
  // (user:pa#ss@localhost:5479/fabrika printed "user:pa#ss/@localhost:5479/fabrika").
  it.each([
    'postgresql://u:pa#ss@localhost:5479/fabrika',
    'postgresql://u:pa?ss@localhost:5479/fabrika',
    'postgresql://u:pa/ss@localhost:5479/fabrika',
    'postgresql://u:p%23ss@localhost:5479/fabrika?password=x@y',
  ])('prints the placeholder, never a password fragment: %s', (url) => {
    const { local, target } = probe(url);
    expect(local).toBe(false);
    expect(target).toBe('<ayrıştırılamadı>');
  });
});
