import { test, expect } from '@playwright/test';

import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { DEFAULT_GATE_RULES, DEFAULT_SCORING_WEIGHTS } from '../../src/lib/scoring/defaults';
import { DEFAULT_G0_RULES } from '../../src/lib/scoring/g0-canonical';
import {
  SG_ALIGNMENT_WEIGHT,
  SG_WORKSPACE,
  setupGateSettingsTenant,
  signInAsGateSettingsUser,
  teardownGateSettingsTenant,
} from './fixtures/gate-settings-tenant';

/**
 * AKTAR-MURBCJ0A-1 — the Stage-Gate settings page must not pretend to save.
 *
 * Before: a form with number inputs and a "Save Configuration" button whose handler
 * waited 800 ms and alerted "Settings saved successfully!" — no request, nothing
 * stored, a negative threshold "saved" too (denetim bulgusu cae-fb K-1). The gate
 * engine (`src/lib/gates/evaluate.ts`) never read any of it.
 *
 * After: a read-only view of the values the engine and the G0 scorer actually use.
 * Every expected number is imported from the same constant the engine reads, so a
 * page that shows a copied literal goes red the day the constant moves.
 */

const ROUTES = [
  { locale: 'en', url: `/en/${SG_WORKSPACE}/settings/gates`, messages: enMessages },
  { locale: 'tr', url: `/tr/${SG_WORKSPACE}/ayarlar/kapilar`, messages: trMessages },
] as const;

test.describe('Stage-Gate settings — read-only, no fake save', () => {
  test.beforeAll(setupGateSettingsTenant);
  test.afterAll(teardownGateSettingsTenant);

  for (const route of ROUTES) {
    test(`${route.locale}: ${route.url} shows the live thresholds and offers no save`, async ({ page }) => {
      // A fake "saved" alert is exactly the defect; any dialog on this page is a failure.
      const dialogs: string[] = [];
      page.on('dialog', (d) => {
        dialogs.push(d.message());
        void d.dismiss();
      });

      await signInAsGateSettingsUser(page, route.url);
      const main = page.locator('main');

      await expect(main.getByRole('button', { name: /save|kaydet/i })).toHaveCount(0);
      await expect(main.locator('input, select, textarea, form')).toHaveCount(0);

      const num = (n: number) => new Intl.NumberFormat(route.locale).format(n);
      const t = route.messages.settings.gates;
      await expect(main.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
      await expect(main.getByText(t.readOnlyNote)).toBeVisible();

      // G0 — the composite threshold evaluate.ts gates on, and the hard rules decideG0 applies.
      await expect(main.getByTestId('g0-min-score')).toHaveText(num(DEFAULT_GATE_RULES.G0.minScore));
      await expect(main.getByTestId('g0-min-alignment')).toHaveText(num(DEFAULT_G0_RULES.minAlignment ?? Number.NaN));
      await expect(main.getByTestId('g0-min-base-rate')).toHaveText(num(DEFAULT_G0_RULES.minBaseRate));

      // G3 — the evaluation thresholds evaluate.ts compares against.
      await expect(main.getByTestId('g3-min-criterion')).toHaveText(num(DEFAULT_GATE_RULES.G3.minCriterionScore));
      await expect(main.getByTestId('g3-min-total')).toHaveText(num(DEFAULT_GATE_RULES.G3.minTotalScore));

      // Weights — the tenant's own value where it has one, the default elsewhere.
      await expect(main.getByTestId('weight-alignment')).toHaveText(num(SG_ALIGNMENT_WEIGHT));
      await expect(main.getByTestId('weight-baseRate')).toHaveText(num(DEFAULT_SCORING_WEIGHTS.baseRate));

      expect(dialogs, 'the page must not raise a dialog').toEqual([]);
    });
  }
});
