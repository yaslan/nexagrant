import { describe, test, expect } from 'vitest';
import { getPublicRoute, getWorkspaceRoute } from '../src/lib/routes';

describe('SEO-Friendly Localized Multilingual Routing System (TR & EN)', () => {
  describe('Public Marketing SEO Routes', () => {
    test('resolves Turkish public routes with Turkish SEO keywords', () => {
      expect(getPublicRoute('home', 'tr')).toBe('/tr');
      expect(getPublicRoute('openCalls', 'tr')).toBe('/tr/acik-cagrilar');
      expect(getPublicRoute('pricing', 'tr')).toBe('/tr/fiyatlandirma');
      expect(getPublicRoute('login', 'tr')).toBe('/tr/giris');
      expect(getPublicRoute('register', 'tr')).toBe('/tr/kayit');
      expect(getPublicRoute('terms', 'tr')).toBe('/tr/kullanim-kosullari');
      expect(getPublicRoute('privacy', 'tr')).toBe('/tr/gizlilik-politikasi');
      expect(getPublicRoute('dpa', 'tr')).toBe('/tr/veri-isleme-sozlesmesi');
      expect(getPublicRoute('modules', 'tr')).toBe('/tr/default/ayarlar/moduller');
    });

    test('resolves English public routes with English canonical keywords', () => {
      expect(getPublicRoute('home', 'en')).toBe('/en');
      expect(getPublicRoute('openCalls', 'en')).toBe('/en/open-calls');
      expect(getPublicRoute('pricing', 'en')).toBe('/en/pricing');
      expect(getPublicRoute('login', 'en')).toBe('/en/login');
      expect(getPublicRoute('register', 'en')).toBe('/en/register');
      expect(getPublicRoute('terms', 'en')).toBe('/en/terms');
      expect(getPublicRoute('privacy', 'en')).toBe('/en/privacy');
      expect(getPublicRoute('dpa', 'en')).toBe('/en/dpa');
      expect(getPublicRoute('modules', 'en')).toBe('/en/default/settings/modules');
    });
  });

  describe('Workspace In-App SEO Routes', () => {
    test('resolves Turkish workspace routes with Turkish slugs', () => {
      const ws = 'itu-tto';
      expect(getWorkspaceRoute('dashboard', 'tr', ws)).toBe('/tr/itu-tto/panel');
      expect(getWorkspaceRoute('calls', 'tr', ws)).toBe('/tr/itu-tto/cagrilar');
      expect(getWorkspaceRoute('callDetail', 'tr', ws, 'call-123')).toBe('/tr/itu-tto/cagrilar/call-123');
      expect(getWorkspaceRoute('pipeline', 'tr', ws)).toBe('/tr/itu-tto/firsatlar');
      expect(getWorkspaceRoute('partners', 'tr', ws)).toBe('/tr/itu-tto/ortaklar');
      expect(getWorkspaceRoute('evidence', 'tr', ws)).toBe('/tr/itu-tto/kanitlar');
      expect(getWorkspaceRoute('conceptNotes', 'tr', ws)).toBe('/tr/itu-tto/konsept-notlar');
      expect(getWorkspaceRoute('approvals', 'tr', ws)).toBe('/tr/itu-tto/onay-merkezi');
      expect(getWorkspaceRoute('tto', 'tr', ws)).toBe('/tr/itu-tto/tto-hizlandirici');
      expect(getWorkspaceRoute('marketplace', 'tr', ws)).toBe('/tr/itu-tto/pazar-yeri');
      expect(getWorkspaceRoute('settingsModules', 'tr', ws)).toBe('/tr/itu-tto/ayarlar/moduller');
      expect(getWorkspaceRoute('settingsBilling', 'tr', ws)).toBe('/tr/itu-tto/ayarlar/faturalama');
      // The KVKK/GDPR console had no route key at all, so nothing could link to it.
      expect(getWorkspaceRoute('settingsPrivacy', 'tr', ws)).toBe('/tr/itu-tto/ayarlar/gizlilik');
    });

    test('resolves English workspace routes with standard English slugs', () => {
      const ws = 'itu-tto';
      expect(getWorkspaceRoute('dashboard', 'en', ws)).toBe('/en/itu-tto/dashboard');
      expect(getWorkspaceRoute('calls', 'en', ws)).toBe('/en/itu-tto/calls');
      expect(getWorkspaceRoute('pipeline', 'en', ws)).toBe('/en/itu-tto/pipeline');
      expect(getWorkspaceRoute('partners', 'en', ws)).toBe('/en/itu-tto/partners');
      expect(getWorkspaceRoute('evidence', 'en', ws)).toBe('/en/itu-tto/evidence');
      expect(getWorkspaceRoute('conceptNotes', 'en', ws)).toBe('/en/itu-tto/concept-notes');
      expect(getWorkspaceRoute('approvals', 'en', ws)).toBe('/en/itu-tto/approvals');
      expect(getWorkspaceRoute('settingsModules', 'en', ws)).toBe('/en/itu-tto/settings/modules');
      expect(getWorkspaceRoute('settingsPrivacy', 'en', ws)).toBe('/en/itu-tto/settings/privacy');
    });
  });
});
