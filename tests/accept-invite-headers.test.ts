import { expect, test } from 'vitest';

import config from '../next.config';

/**
 * TASK-MUN2793A57Z9I (se-fb (d); İNCELEME-34 B-4, mutant N6) — the invitation
 * link carries a bearer token in its query. Besides the GET handler's own
 * headers (tests/invitation-accept.live.test.ts), next.config sends
 * `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on every
 * accept-invite page, `/continue` included, in both locales.
 */
test('next.config: the accept-invite pages never send a Referer and are never cached', async () => {
  const resolved = config('phase-development-server');
  const rules = (await resolved.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === '/:locale(tr|en)/accept-invite/:path*');
  expect(rule).toBeDefined();
  expect(rule!.headers).toEqual(
    expect.arrayContaining([
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ])
  );
});
