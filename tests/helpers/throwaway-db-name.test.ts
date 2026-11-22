import { describe, expect, it } from 'vitest';
import { isGithubRunner, isThrowawayDbName } from './live-db-role';

/**
 * NG-266, NG-283: which database names a live suite may write to. The environment is passed in, so
 * no test depends on (or edits) the real process.env.
 */
const LOCAL: Record<string, string | undefined> = {};
// What the GitHub runner sets (CI log of run 44874105200: `-e GITHUB_ACTIONS=true -e CI=true`).
const RUNNER: Record<string, string | undefined> = { GITHUB_ACTIONS: 'true', CI: 'true' };

describe('isThrowawayDbName', () => {
  // The names this repo really uses: scripts/gate-isolated.sh (`fabrika_gate`) and the throwaway
  // databases agents create by hand (`fabrika_test`, `fabrika_test_ng266`, `fabrika_test_ng266c`).
  it.each(['fabrika_test', 'fabrika_test_ng266', 'fabrika_test_ng266c', 'fabrika_test_ng283', 'fabrika_gate'])(
    'accepts the repo test database name %s',
    (name) => {
      expect(isThrowawayDbName(name, LOCAL)).toBe(true);
    }
  );

  // The three the NG-266 review measured as wrongly accepted, plus lookalikes.
  it.each([
    'fabrika_test_prod',
    'staging_test',
    'prod_test_mirror',
    'test',
    'my_test',
    'test_fabrika',
    'fabrika_testing',
    'fabrika_test_',
    'fabrika_test_ng',
    'fabrika_test_ng266_prod',
    // NG-292: the per-agent form `fabrika_test_<agent>` seen once in an old docker listing
    // (docs/agent-results/TASK-MVDZHA5FQTZ84-sec-gnd.md:45). No script, .env example or suite uses it.
    'fabrika_test_fe_fb',
    'FABRIKA_TEST',
    'fabrika_latest',
    'prod',
    'postgres',
    '',
  ])('refuses %j', (name) => {
    expect(isThrowawayDbName(name, LOCAL)).toBe(false);
    expect(isThrowawayDbName(name, RUNNER)).toBe(false);
  });

  it('refuses the shared dev database name locally', () => {
    expect(isThrowawayDbName('fabrika', LOCAL)).toBe(false);
  });

  it.each([
    ['only GITHUB_ACTIONS=true (hand-typed)', { GITHUB_ACTIONS: 'true' }],
    ['only CI=true', { CI: 'true' }],
    ['GITHUB_ACTIONS=false', { GITHUB_ACTIONS: 'false', CI: 'true' }],
    ['CI=1', { GITHUB_ACTIONS: 'true', CI: '1' }],
    ['empty CI', { GITHUB_ACTIONS: 'true', CI: '' }],
  ])('refuses "fabrika" with %s', (_label, env) => {
    expect(isGithubRunner(env)).toBe(false);
    expect(isThrowawayDbName('fabrika', env)).toBe(false);
  });

  it('accepts the CI service database on a runner (GITHUB_ACTIONS=true and CI=true)', () => {
    expect(isGithubRunner(RUNNER)).toBe(true);
    expect(isThrowawayDbName('fabrika', RUNNER)).toBe(true);
  });
});
