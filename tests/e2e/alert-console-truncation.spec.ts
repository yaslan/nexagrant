import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTVN8M702FU5A — the alert console's header counts must come from a
 * real `count()`, not from the length of the (at most 300-row) list it
 * renders, and the truncation note must actually appear once the table
 * holds more rows than it can show.
 *
 * The verification that first proved this fix (TASK-MTVFKK8UZS5BF) inserted
 * 286 rows by hand and left them in the local database — no automated test
 * covered the 300-row boundary at all. This spec is the permanent
 * replacement: it plants its own pile of >300 rows, reads the console, and
 * — unlike that manual run — deletes every row it created in `afterAll`,
 * scoped to this run's unique `source` so it can never touch a real alert.
 */

const SHOTS = shotsDir('TASK-MTVN8M702FU5A-screenshots');
const ADMIN_EMAIL = 'admin@yasinaslan.com.tr';
const MAX_ROWS = 300;
const PILE_SIZE = MAX_ROWS + 1;
const RUN = Date.now().toString(36);
const SOURCE = `truncation-probe-${RUN}`;

let skipReason = '';

test.describe.configure({ mode: 'serial' });

test.describe('alert console reports real totals past the row cap', () => {
  test.beforeAll(async () => {
    if (!(await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } }))) {
      skipReason = `no platform admin ${ADMIN_EMAIL} in this database`;
      return;
    }

    // One createMany, not a loop of creates: the goal is to cross MAX_ROWS
    // (a display detail), not to model any real alert semantics — no two of
    // these are meant to dedupe against each other.
    await prisma.systemAlert.createMany({
      data: Array.from({ length: PILE_SIZE }, (_, i) => ({
        level: 'info',
        source: SOURCE,
        message: `truncation testing row ${i} of ${PILE_SIZE}`,
      })),
    });
  });

  test.afterAll(async () => {
    // Scoped to this run's unique source only — never a broad delete, never
    // a table truncate. See CLAUDE.md and scripts/check-orphan-alerts.ts for
    // why SystemAlert cleanup must always be this narrow.
    const removed = await prisma.systemAlert.deleteMany({ where: { source: SOURCE } });
    expect(removed.count, 'the probe must remove every row it planted').toBe(PILE_SIZE);
    await prisma.$disconnect();
  });

  test('header totals and the truncation note survive a >300-row pile', async ({ page }) => {
    test.skip(skipReason !== '', skipReason);

    const dbTotal = await prisma.systemAlert.count();
    expect(dbTotal, 'the fixture must actually push the table past MAX_ROWS').toBeGreaterThan(
      MAX_ROWS,
    );

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

    const target = '/tr/admin/alerts';
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${target}`, { timeout: 30_000 });

    // The header "total" tile is the first <dl><div> — see AlertsConsoleClient.
    const totalTileText = await page.locator('dl div').first().locator('dd').innerText();
    const totalTile = Number(totalTileText.replace(/[^\d]/g, ''));
    expect(
      totalTile,
      'the total tile must equal the database count(), not the length of the 300-row page',
    ).toBe(dbTotal);
    expect(totalTile).toBeGreaterThan(MAX_ROWS);

    // The truncation warning only exists once totalCount > MAX_ROWS.
    await expect(page.getByText('300 uyarıdan fazlası varsa', { exact: false })).toBeVisible();

    // The table itself never renders more than MAX_ROWS rows regardless of
    // how many the database holds.
    const renderedRows = await page.locator('table tbody tr').count();
    expect(renderedRows).toBeLessThanOrEqual(MAX_ROWS);

    await page.screenshot({ path: `${SHOTS}/01-truncated-console.png`, fullPage: true });
  });
});
