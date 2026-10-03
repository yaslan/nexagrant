import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { z } from 'zod';
import { SediaTopicSchema } from '@/lib/adapters/schemas/sedia';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * TASK-MTQV1JYGMGU6V — the components that carried inline `eslint-disable` exceptions,
 * driven by a real browser after the exceptions were removed.
 *
 * Three React 19 lint errors were suppressed rather than fixed on 2026-09-07: a mount flag
 * set from an effect (ThemeToggle), a `loading` flag raised synchronously inside an effect
 * (the calls list), and an editor buffer copied across by an effect plus a lock expiry read
 * from `Date.now()` during render (the Part B editor). The suppressions are gone and the
 * patterns are actually different now, so what has to be shown is that the *behaviour* the
 * suppressions protected still holds when a person clicks it.
 *
 * The console is watched throughout: a hydration mismatch is the failure mode a wrong fix to
 * `useIsHydrated` would produce, and it is only visible at runtime. Screenshots are taken with
 * `caret: 'initial'` — Playwright's default hides the caret by writing an inline style into the
 * focused input, which React then reports as a mismatch of the harness's own making.
 */

const SHOTS = shotsDir('TASK-MTQV1JYGMGU6V-screenshots');
const EMAIL = 'admin@yasinaslan.com.tr';
// The seeded platform-admin seat behind EMAIL (prisma/seed-tenant-workspace.ts,
// `isPlatformAdmin: true`). The demo sign-in form that used to resolve the address to
// it does not exist in a production build, so the session is a minted cookie for the
// same user (TASK-MUSBCXP9RKS3D); the jwt callback still reads the admin flag from the row.
const SEAT = { id: 'demo-user-superadmin', email: EMAIL, tenantId: 'demo-tenant', role: 'SUPER_ADMIN' };
const CALLS_URL = '/tr/main/calls';

/** React reports hydration mismatches and render-phase violations through console.error. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

const consent = (page: Page) =>
  page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });

/**
 * The calls page reads `/api/cagrilar`, which searches the live EC SEDIA portal and translates
 * every topic through MyMemory. On CI that took up to the whole 30 s budget and failed ~1 run in
 * 20 (TASK-MUPVLWSIPC5WU#render-purity). This spec is about how the page derives `loading`, not
 * about SEDIA, so the route is answered from a fixture shaped like the route's real body
 * (`src/app/api/cagrilar/route.ts`). The parse below checks each topic against the product's
 * `SediaTopicSchema`; the envelope schema is written here by hand, so a renamed or removed
 * envelope field in the route is NOT caught by this spec.
 */
const CagrilarResponseSchema = z.object({
  success: z.literal(true),
  totalResults: z.number(),
  pageNumber: z.number(),
  pageSize: z.number(),
  topics: z.array(SediaTopicSchema).min(1),
});
const CALLS_FIXTURE = CagrilarResponseSchema.parse(
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'cagrilar-response.json'), 'utf8')),
);
const HORIZON = '43108390';

/**
 * Answers `/api/cagrilar` from the fixture, filtered by `framework` the way SEDIA filters it.
 * Responses are held while the gate is closed, so "the list is loading" is observed for as long
 * as the test needs instead of for however long the network happened to take; `release()`
 * answers everything held and lets later requests through until `hold()` closes it again.
 */
function stubCalls(page: Page) {
  const requests: URL[] = [];
  let held: Array<() => Promise<void>> = [];
  let open = false;

  const answer = (route: Route, url: URL) => () => {
    const framework = url.searchParams.get('framework');
    const topics = framework
      ? CALLS_FIXTURE.topics.filter((t) => framework.split(',').includes(t.frameworkProgramme ?? ''))
      : CALLS_FIXTURE.topics;
    return route.fulfill({ json: { ...CALLS_FIXTURE, totalResults: topics.length, topics } });
  };

  const ready = page.route('**/api/cagrilar?**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const fulfil = answer(route, url);
    if (open) await fulfil();
    else held.push(fulfil);
  });

  return {
    ready,
    requests,
    hold: () => {
      open = false;
    },
    release: async () => {
      open = true;
      const pending = held;
      held = [];
      await Promise.all(pending.map((f) => f()));
    },
  };
}

const hydrationNoise = (errors: string[]) =>
  errors.filter((e) =>
    /hydrat|did not match|Text content does not match|Minified React error #(418|423|425)/i.test(e),
  );

test.describe('render-purity refactor — the three formerly suppressed components', () => {
  test('the theme toggle still switches the theme, with no mount effect behind it', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await consent(page);
    await page.goto('/tr');

    // `useIsHydrated` replaced `useState(false)` + `useEffect(setMounted)`. If it returned the
    // wrong snapshot the toggle would never appear at all, so its visibility is the assertion.
    const toggle = page.getByRole('button', { name: /moda geç/i }).first();
    await expectHydrated(toggle);
    await page.screenshot({ path: `${SHOTS}/01-public-page-light.png`, fullPage: false, caret: 'initial' });

    const before = await page.evaluate(() => document.documentElement.className);
    await toggle.click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.className))
      .not.toBe(before);
    await page.screenshot({ path: `${SHOTS}/02-public-page-after-toggle.png`, fullPage: false, caret: 'initial' });

    // And back, because a toggle that only goes one way is a broken toggle.
    await page.getByRole('button', { name: /moda geç/i }).first().click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.className))
      .toBe(before);

    expect(hydrationNoise(errors), 'hydration errors on the public page').toEqual([]);
  });

  test('the calls list loads, and changing a filter puts it back into loading', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await consent(page);
    const calls = stubCalls(page);
    await calls.ready;
    await signInAs(page, SEAT);
    await page.goto(CALLS_URL);
    await page.waitForURL(`**${CALLS_URL}`, { timeout: 30_000 });

    // `loading` is derived from "the query the filters describe" vs "the query the rows came
    // from" now. First paint therefore has to say loading without any effect having run yet.
    const loadingLabel = page.getByText('Canlı veriler yükleniyor...');
    await expect(loadingLabel).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-calls-loading.png`, fullPage: false, caret: 'initial' });

    const row = (i: number) => page.getByText(CALLS_FIXTURE.topics[i]!.title, { exact: true });
    const [energy, health, digital] = [row(0), row(1), row(2)];
    await expect.poll(() => calls.requests.length).toBeGreaterThan(0);
    // The request is held, so the list must still say loading and show no rows yet.
    await expect(loadingLabel).toBeVisible();
    await expect(energy).toBeHidden();
    await calls.release();
    await expect(loadingLabel).toBeHidden({ timeout: 30_000 });
    // The skeleton went away because the fixture rows arrived, not because a request failed.
    await expect(energy).toBeVisible();
    await expect(health).toBeVisible();
    await expect(digital).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/04-calls-loaded.png`, fullPage: false, caret: 'initial' });

    // Changing a filter changes the derived query, so the list must go stale again on its own.
    calls.hold();
    const before = calls.requests.length;
    await page.getByRole('button', { name: 'Ufuk Avrupa (Horizon Europe)', exact: true }).click();
    await expect(loadingLabel).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-calls-refiltering.png`, fullPage: false, caret: 'initial' });
    // …and the stale list asks again, for the new filter.
    await expect
      .poll(() => calls.requests.slice(before).map((u) => u.searchParams.get('framework')))
      .toContain(HORIZON);
    // The new filter's request is held, so the list must still be stale.
    await expect(loadingLabel).toBeVisible();
    await calls.release();
    await expect(loadingLabel).toBeHidden({ timeout: 30_000 });
    await expect(energy).toBeVisible();
    await expect(health).toBeVisible();
    await expect(digital).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/06-calls-filtered.png`, fullPage: false, caret: 'initial' });

    expect(hydrationNoise(errors), 'hydration errors on the calls page').toEqual([]);
  });
});
