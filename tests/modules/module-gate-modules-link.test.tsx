import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';

/**
 * NG-65 — a switched-off module's lock offers Settings → Modules to whoever may
 * open that screen (`can(role, 'manage_modules')`, decided on the server), and keeps
 * the "ask your administrator" sentence for everyone else and for every other reason.
 */

const h = vi.hoisted(() => ({ checkModuleAccess: vi.fn(), requestSession: vi.fn() }));

vi.mock('@/lib/modules/access', () => ({
  checkModuleAccess: h.checkModuleAccess,
  requestSession: h.requestSession,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: locale === 'tr' ? trMessages : enMessages, namespace: namespace as never }),
}));

import { decideModuleAccess } from '@/lib/modules/tenant-access';
import { moduleGate } from '@/lib/modules/guard';

const session = (role: string) => ({
  user: { id: 'user-1', name: 'Test', email: 'test@example.test' },
  tenantId: 'tenant-1',
  role,
  workspaceIds: [],
  isPlatformAdmin: false,
});

const off = () => decideModuleAccess('M5', 'OFF', ['M5'], { role: 'MEMBER', isPlatformAdmin: false });

beforeEach(() => {
  h.checkModuleAccess.mockReset();
  h.requestSession.mockReset();
});

describe('moduleGate — Settings → Modules link on a switched-off module', () => {
  it('TENANT_OWNER gets a link to the modules screen in the default workspace, not the admin sentence', async () => {
    h.checkModuleAccess.mockResolvedValueOnce(off());
    h.requestSession.mockResolvedValueOnce(session('TENANT_OWNER'));

    const html = renderToStaticMarkup((await moduleGate('M5', 'tr'))!);

    expect(html).toContain(`href="/tr/default/ayarlar/moduller"`);
    expect(html).toContain(trMessages.ModuleGate.openModules);
    expect(html).not.toContain(trMessages.ModuleGate.askAdmin.slice(0, 30));
  });

  it('uses the English route for an English page', async () => {
    h.checkModuleAccess.mockResolvedValueOnce(off());
    h.requestSession.mockResolvedValueOnce(session('TENANT_OWNER'));

    const html = renderToStaticMarkup((await moduleGate('M5', 'en'))!);

    expect(html).toContain(`href="/en/default/settings/modules"`);
    expect(html).toContain(enMessages.ModuleGate.openModules);
  });

  it.each(['TENANT_ADMIN', 'MEMBER'])('%s gets no link and keeps the admin sentence', async (role) => {
    h.checkModuleAccess.mockResolvedValueOnce(off());
    h.requestSession.mockResolvedValueOnce(session(role));

    const html = renderToStaticMarkup((await moduleGate('M5', 'en'))!);

    expect(html).not.toContain('<a ');
    expect(html).not.toContain('settings/modules');
    expect(html).toContain(enMessages.ModuleGate.askAdmin.slice(0, enMessages.ModuleGate.askAdmin.indexOf('{brand}')).trim());
  });

  it('a signed-out viewer gets no link', async () => {
    h.checkModuleAccess.mockResolvedValueOnce({ allowed: false, status: 'OFF', reason: 'NOT_AUTHENTICATED' });
    h.requestSession.mockResolvedValueOnce(null);

    const html = renderToStaticMarkup((await moduleGate('M5', 'en'))!);

    expect(html).not.toContain('<a ');
  });

  it('a plan-blocked module keeps the admin sentence even for the owner', async () => {
    h.checkModuleAccess.mockResolvedValueOnce(
      decideModuleAccess('M5', 'ON', [], { role: 'MEMBER', isPlatformAdmin: false }),
    );
    h.requestSession.mockResolvedValueOnce(session('TENANT_OWNER'));

    const html = renderToStaticMarkup((await moduleGate('M5', 'en'))!);

    expect(html).not.toContain('<a ');
    expect(html).toContain(enMessages.ModuleGate.askAdmin.slice(0, enMessages.ModuleGate.askAdmin.indexOf('{brand}')).trim());
  });
});
