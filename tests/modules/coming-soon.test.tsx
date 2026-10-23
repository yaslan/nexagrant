import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';

/**
 * FO-40 — a "Yakında" module (`statusBadge: 'soon'`) is refused by the access
 * decision with its own reason, whatever its `ModuleState` row or the plan say,
 * and its placeholder page shows the coming-soon view instead of the lock.
 */

const h = vi.hoisted(() => ({ checkModuleAccess: vi.fn() }));

vi.mock('@/lib/modules/access', () => ({ checkModuleAccess: h.checkModuleAccess }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: locale === 'tr' ? trMessages : enMessages, namespace: namespace as never }),
}));

import { decideModuleAccess } from '@/lib/modules/tenant-access';
import { moduleGate } from '@/lib/modules/guard';
import { getAllManifests } from '@/lib/modules/registry';
import type { ModuleId } from '@/lib/modules/types';

const SOON: ModuleId[] = ['M0', 'M12', 'M13', 'M14', 'M15', 'M16'];
const admin = { role: 'TENANT_OWNER', isPlatformAdmin: true };

describe('decideModuleAccess — Yakında modules', () => {
  it('lists exactly the six FO-40 modules as soon', () => {
    expect(getAllManifests().filter((m) => m.statusBadge === 'soon').map((m) => m.id).sort()).toEqual(
      [...SOON].sort(),
    );
  });

  it.each(SOON)('%s is refused as COMING_SOON even when switched ON and entitled', (id) => {
    expect(decideModuleAccess(id, 'ON', [id], admin)).toEqual({
      allowed: false,
      status: 'ON',
      reason: 'COMING_SOON',
    });
  });

  it('leaves a released module to the plan and the switch', () => {
    expect(decideModuleAccess('M3', 'ON', ['M3'], admin).allowed).toBe(true);
    expect(decideModuleAccess('M3', 'ON', [], admin).reason).toBe('PLAN_UPGRADE_REQUIRED');
  });
});

describe('moduleGate — coming-soon page', () => {
  it.each([
    ['tr', trMessages],
    ['en', enMessages],
  ] as const)('renders the translated name and the coming-soon note in %s, no lock', async (locale, messages) => {
    h.checkModuleAccess.mockResolvedValueOnce(decideModuleAccess('M0', 'OFF', [], admin));
    const page = await moduleGate('M0', locale);
    const html = renderToStaticMarkup(page!);

    expect(html).toContain('data-testid="module-coming-soon"');
    expect(html).toContain(messages.modules['call-fit'].name);
    expect(html).not.toContain('🔒');
    expect(html).not.toContain(messages.ModuleGate.title);
  });

  it('still shows the lock for a released module', async () => {
    h.checkModuleAccess.mockResolvedValueOnce(decideModuleAccess('M3', 'OFF', ['M3'], admin));
    const html = renderToStaticMarkup((await moduleGate('M3', 'tr'))!);
    expect(html).toContain('🔒');
    expect(html).not.toContain('module-coming-soon');
  });
});

describe('placeholder routes', () => {
  it.each(SOON)('%s owns a modules/<key> page that answers with the gate', async (id) => {
    const manifest = getAllManifests().find((m) => m.id === id)!;
    expect(manifest.routes).toEqual([{ path: `modules/${manifest.key}` }]);

    const { default: Page } = await import(`@/app/[locale]/(app)/[workspace]/modules/${manifest.key}/page`);
    h.checkModuleAccess.mockResolvedValueOnce(decideModuleAccess(id, 'OFF', [], admin));
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: 'en' }) }));
    expect(h.checkModuleAccess).toHaveBeenLastCalledWith(id);
    expect(html).toContain('data-testid="module-coming-soon"');
    expect(html).toContain(`>${id}</p>`);
  });
});
