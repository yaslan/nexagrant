/**
 * NG-250 review B1 — the page form of the NexaGrant plan gate: a refusal renders the translated
 * `ngGate.<code>` section (no 403, no fixed sentence), an allowed member gets null and the page
 * goes on. The decision itself is gate.ts (gate.test.ts, ng250-plan-gate.live.test.ts).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NgGateDecision } from './gate';

const decide = vi.hoisted(() => vi.fn<() => Promise<NgGateDecision>>());
vi.mock('./route-gate', () => ({ ngCallerDecision: decide }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => (key: string) =>
    `[${locale}:${namespace}.${key}]`,
}));

const { ngPageGate } = await import('./page-gate');
const CALLER = { tenantId: 't1', role: 'TENANT_OWNER' };

describe('ngPageGate (NG-250 B1)', () => {
  beforeEach(() => decide.mockReset());

  it('allowed → null, asked with the caller, action and feature', async () => {
    decide.mockResolvedValue({ allowed: true, enrolled: true });
    expect(await ngPageGate(CALLER, 'tr', 'view_partner_search', 'partner_search')).toBeNull();
    expect(decide).toHaveBeenCalledWith(CALLER, 'view_partner_search', 'partner_search');
  });

  it.each(['NG_FEATURE_NOT_IN_PLAN', 'NG_MODULE_CLOSED', 'NG_ROLE_FORBIDDEN'] as const)(
    'refused with %s → the translated lock section in the page locale',
    async (code) => {
      decide.mockResolvedValue({ allowed: false, code, feature: 'partner_search' });
      const el = await ngPageGate(CALLER, 'en', 'view_partner_search', 'partner_search');
      const html = renderToStaticMarkup(el!);
      expect(html).toContain('data-testid="ng-plan-gate"');
      expect(html).toContain(`data-ng-code="${code}"`);
      expect(html).toContain('[en:ngGate.pageTitle]');
      expect(html).toContain(`[en:ngGate.${code}]`);
    }
  );
});
