/**
 * NG-9: the e2e server runs with a fixture PostHog key and this host
 * (playwright.config.ts), so the consent gate in src/lib/analytics.ts is the
 * only thing between an event and a request. `.invalid` never resolves: a spec
 * that does not fulfil it (page.route) sends nothing anywhere real.
 */
export const E2E_POSTHOG_KEY = 'phc_e2e_fixture_not_a_real_key';
export const E2E_POSTHOG_HOST = 'https://posthog.e2e.invalid';
